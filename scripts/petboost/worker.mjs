import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile, readFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readPetboost, scheduledSlot, SyncError } from './reader.mjs';

process.umask(0o077);
const mode=process.argv[2];
if(!['login','verify','tick'].includes(mode)) throw new Error('Use login, verify or tick');
const profile=resolve(process.env.PETBOOST_PROFILE_DIR || '.petboost/profile');
const business=process.env.PETBOOST_BUSINESS_BUTTON;
if(!business) throw new Error('PETBOOST_BUSINESS_BUTTON is required');
await mkdir(profile,{recursive:true,mode:0o700}); await chmod(profile,0o700);
const proofPath=resolve(profile,'../verified.json');
let db, token;
const workspace=process.env.PETBOOST_WORKSPACE_ID;
async function rpc(name,args) {
  const {data,error}=await db.rpc(name,args);
  if(error) throw Object.assign(new Error('Database operation failed'),{code:error.code==='P0002'?'identity_review':'worker_error'});
  return data;
}
if(mode==='tick') {
  if(!workspace || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Worker server environment is incomplete');
  db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  token=await rpc('claim_petboost_sync',{p_workspace:workspace,p_slot:scheduledSlot()});
  if(!token) process.exit(0);
}
let context;
try {
  if(mode==='tick') {
    let proof; try { proof=JSON.parse(await readFile(proofPath,'utf8')); } catch { throw new SyncError('login_required'); }
    if(proof.profile!==profile || proof.business!==business) throw new SyncError('login_required');
  }
  context=await chromium.launchPersistentContext(profile,{headless:mode!=='login',timezoneId:'Australia/Brisbane',locale:'en-AU'});
  const page=await context.newPage();
  if(mode==='login') {
    await page.goto('https://business.petboost.com');
    console.log('Sign in in the worker browser. No password is read or stored by this script.');
    await page.waitForURL('https://business.petboost.com/me',{timeout:300000});
    console.log('Session saved. Run verify next; scheduling remains disabled.');
  } else {
    const snapshot=await readPetboost(page,business);
    if(mode==='verify') {
      await writeFile(proofPath,JSON.stringify({profile,business,verifiedAt:new Date().toISOString()}),{mode:0o600});
      console.log(`Read-only verification passed: ${snapshot.observedCount} appointment rows, ${snapshot.bookings.length} daycare dog bookings. No imports performed.`);
    } else {
      await rpc('apply_petboost_sync',{p_workspace:workspace,p_run:token,p_snapshot:snapshot});
      console.log('Petboost sync succeeded.');
    }
  }
} catch(error) {
  const code=['login_required','incomplete_fetch','identity_review'].includes(error.code)?error.code:'worker_error';
  if(db && token) await rpc('fail_petboost_sync',{p_workspace:workspace,p_run:token,p_code:code}).catch(()=>{});
  // Never log browser errors, DOM, request headers, URLs, or session data.
  console.error(`Petboost sync stopped: ${code}`); process.exitCode=1;
} finally { await context?.close(); }
