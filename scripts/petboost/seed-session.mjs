// Run once on a trusted desktop for login/renewal. Never exports plaintext state.
import { chromium } from '@playwright/test';
import { createInterface } from 'node:readline/promises';
import { seal } from './session-crypto.mjs';
import { serverConfig,serverClient,rpc } from './netlify-runtime.mjs';
process.umask(0o077);
const c=serverConfig();let browser,stage='browser launch';
try {
  const channel=process.env.PETBOOST_SETUP_BROWSER;
  if(channel && !['msedge','chrome'].includes(channel)) throw Error('Unsupported setup browser');
  browser=await chromium.launch({headless:false,...(channel?{channel}:{})});
  stage='sign-in';
  const interactive=await browser.newContext({timezoneId:'Australia/Brisbane',locale:'en-AU'});
  const page=await interactive.newPage();await page.goto('https://business.petboost.com');
  console.log('Complete Petboost sign-in in the opened browser. No password is collected by this script.');
  await page.waitForURL('https://business.petboost.com/me',{timeout:300000});
  for(let attempt=0;;attempt++) {
    let restored;
    try {
      // Reload the local reader after an explicit retry while keeping login in memory.
      const {readPetboost}=await import(`./reader.mjs?attempt=${attempt}`);
      stage='initial read';
      await readPetboost(page,c.business,{onStep:step=>{stage=`initial read / ${step}`;}});
      const state=await interactive.storageState({indexedDB:true});
      // Prove that serializable state works in a fresh isolated context first.
      restored=await browser.newContext({storageState:state,timezoneId:'Australia/Brisbane',locale:'en-AU'});
      stage='restored-session read';
      await readPetboost(await restored.newPage(),c.business,{onStep:step=>{stage=`restored-session read / ${step}`;}});
      stage='encrypted session upload';
      await rpc(serverClient(),'save_petboost_session',{
        p_workspace:c.workspace,p_state:seal(await restored.storageState({indexedDB:true}),c.sessionKey,`${c.workspace}:${c.business}`),p_run:null,
      });
      break;
    } catch(error) {
      if(process.env.PETBOOST_SETUP_RETRY!=='true' || stage==='encrypted session upload') throw error;
      console.error(`Setup check failed during ${stage}; the login remains open in memory.`);
      const prompt=createInterface({input:process.stdin,output:process.stdout});
      try {
        const answer=await prompt.question('Press Enter to retry, or q to close: ',{signal:AbortSignal.timeout(15*60*1000)});
        if(answer.trim().toLowerCase()==='q') throw error;
      } finally {prompt.close();}
    } finally {await restored?.close();}
  }
  console.log('Verified encrypted session saved. No bookings imported. Netlify must still pass its own read-only verification before activation.');
} catch(error) {
  const code=['login_required','incomplete_fetch','identity_review'].includes(error.code)?error.code:'setup_failed';
  console.error(`Session setup did not complete during ${stage} (${code}); no plaintext session was saved.`);
  process.exitCode=1;
}
finally {await browser?.close();}
