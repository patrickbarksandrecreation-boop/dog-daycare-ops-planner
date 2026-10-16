import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual,randomUUID } from 'node:crypto';
import { readPetboost,scheduledSlot,SyncError } from './reader.mjs';
import { seal,unseal } from './session-crypto.mjs';

export function enabled(env=process.env) {
  return env.CONTEXT==='production' && env.PETBOOST_SYNC_ENABLED==='true';
}
// CONTEXT is a build variable, not a guaranteed Functions runtime variable.
// Derive the guard from Netlify's trusted invocation context instead.
export function deploymentEnv(context,env=process.env) {
  return {...env,CONTEXT:context?.deploy?.published && context.deploy.context==='production'?'production':'disabled'};
}
export function internalAuth(request,env=process.env) {
  const expected=env.PETBOOST_DISPATCH_SECRET;
  const supplied=request.headers.get('x-petboost-dispatch') || '';
  return typeof expected==='string' && expected.length>=32 && Buffer.byteLength(supplied)===Buffer.byteLength(expected)
    && timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));
}
export function serverConfig(env=process.env) {
  const c={workspace:env.PETBOOST_WORKSPACE_ID,business:env.PETBOOST_BUSINESS_BUTTON,
    url:env.SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY,sessionKey:env.PETBOOST_SESSION_KEY};
  if(Object.values(c).some(x=>!x)) throw new Error('Missing server configuration');
  return c;
}
export function serverClient(env=process.env) {
  const c=serverConfig(env);
  return createClient(c.url,c.key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function rpc(db,name,args) {
  const {data,error}=await db.rpc(name,args);
  if(error) throw new SyncError(error.code==='P0002'?'identity_review':'worker_error');
  return data;
}
export async function dispatch(env=process.env,fetcher=fetch) {
  if(!enabled(env)) return false;
  if(!env.URL || !env.PETBOOST_DISPATCH_SECRET || env.PETBOOST_DISPATCH_SECRET.length<32) throw new Error('Missing dispatch configuration');
  const site=new URL(env.URL);
  if(site.protocol!=='https:') throw new Error('Invalid deployment origin');
  const response=await fetcher(new URL('/.netlify/functions/petboost-run-background',site),{
    method:'POST',headers:{'x-petboost-dispatch':env.PETBOOST_DISPATCH_SECRET},redirect:'error',signal:AbortSignal.timeout(15000),
  });
  if(response.status!==202) throw new Error('Worker dispatch failed');
  return true;
}
export async function launchServerless() {
  const [{default: binary},{chromium}]=await Promise.all([import('@sparticuz/chromium'),import('playwright-core')]);
  return chromium.launch({executablePath:await binary.executablePath(),args:binary.args,headless:true});
}
export async function runNetlify({env=process.env,db,launch=launchServerless,reader=readPetboost,now=new Date(),verifyOnly=false,verificationId=randomUUID()}={}) {
  if(env.CONTEXT!=='production' || (!verifyOnly && !enabled(env))) return {status:'disabled'};
  const c=serverConfig(env);db ||= serverClient(env);
  const token=verifyOnly
    ? await rpc(db,'claim_petboost_verification',{p_workspace:c.workspace,p_run:verificationId})
    : await rpc(db,'claim_petboost_sync',{p_workspace:c.workspace,p_slot:scheduledSlot(now)});
  if(!token) return {status:'idle'};
  let browser;
  try {
    const envelope=await rpc(db,'read_petboost_session',{p_workspace:c.workspace});
    if(!envelope) throw new SyncError('login_required');
    let state;
    try {state=unseal(envelope,c.sessionKey,`${c.workspace}:${c.business}`);} catch {throw new SyncError('login_required');}
    browser=await launch();
    const context=await browser.newContext({storageState:state,timezoneId:'Australia/Brisbane',locale:'en-AU'});
    const page=await context.newPage();
    // Abort before the eight-minute DB lease expires; never accept late results.
    let timer;
    const snapshot=await Promise.race([
      reader(page,c.business),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new SyncError('incomplete_fetch')),7*60*1000);}),
    ]).finally(()=>clearTimeout(timer));
    const updated=await context.storageState({indexedDB:true});
    await rpc(db,'save_petboost_session',{p_workspace:c.workspace,p_run:token,p_state:seal(updated,c.sessionKey,`${c.workspace}:${c.business}`)});
    if(verifyOnly) await rpc(db,'finish_petboost_verification',{p_workspace:c.workspace,p_run:token,p_code:null});
    else await rpc(db,'apply_petboost_sync',{p_workspace:c.workspace,p_run:token,p_snapshot:snapshot});
    return {status:'success'};
  } catch(error) {
    const code=['login_required','incomplete_fetch','identity_review'].includes(error.code)?error.code:'worker_error';
    if(verifyOnly) await rpc(db,'finish_petboost_verification',{p_workspace:c.workspace,p_run:token,p_code:code});
    else await rpc(db,'fail_petboost_sync',{p_workspace:c.workspace,p_run:token,p_code:code});
    return {status:code};
  } finally {await browser?.close();}
}
