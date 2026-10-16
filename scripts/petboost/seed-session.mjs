// Run once on a trusted desktop for login/renewal. Never exports plaintext state.
import { chromium } from '@playwright/test';
import { readPetboost } from './reader.mjs';
import { seal } from './session-crypto.mjs';
import { serverConfig,serverClient,rpc } from './netlify-runtime.mjs';
process.umask(0o077);
const c=serverConfig();let browser;
try {
  browser=await chromium.launch({headless:false});
  const interactive=await browser.newContext({timezoneId:'Australia/Brisbane',locale:'en-AU'});
  const page=await interactive.newPage();await page.goto('https://business.petboost.com');
  console.log('Complete Petboost sign-in in the opened browser. No password is collected by this script.');
  await page.waitForURL('https://business.petboost.com/me',{timeout:300000});
  await readPetboost(page,c.business);
  const state=await interactive.storageState({indexedDB:true});
  // Prove that serializable state works in a fresh isolated context first.
  const restored=await browser.newContext({storageState:state,timezoneId:'Australia/Brisbane',locale:'en-AU'});
  await readPetboost(await restored.newPage(),c.business);
  await rpc(serverClient(),'save_petboost_session',{
    p_workspace:c.workspace,p_state:seal(await restored.storageState({indexedDB:true}),c.sessionKey,`${c.workspace}:${c.business}`),p_run:null,
  });
  console.log('Verified encrypted session saved. No bookings imported. Netlify must still pass its own read-only verification before activation.');
} catch {console.error('Session setup did not complete; no plaintext session was saved.');process.exitCode=1;}
finally {await browser?.close();}
