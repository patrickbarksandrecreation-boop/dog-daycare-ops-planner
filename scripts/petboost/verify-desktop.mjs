// Read-only comparison using the encrypted hosted session. No session export,
// refresh upload or booking imports. Run only on the trusted setup desktop.
import {serverClient,serverConfig,rpc} from './netlify-runtime.mjs';
import {unseal} from './session-crypto.mjs';
import {readPetboost} from './reader.mjs';
import {chromium} from 'playwright-core';
const c=serverConfig(),db=serverClient();
let browser;
try {
  const envelope=await rpc(db,'read_petboost_session',{p_workspace:c.workspace});
  const state=unseal(envelope,c.sessionKey,`${c.workspace}:${c.business}`);
  browser=await chromium.launch({channel:process.env.PETBOOST_SETUP_BROWSER||'msedge',headless:true});
  const context=await browser.newContext({storageState:state,timezoneId:'Australia/Brisbane',locale:'en-AU'});
  await context.route('**/*',route=>['image','media','font'].includes(route.request().resourceType())?route.abort():route.continue());
  const snapshot=await readPetboost(await context.newPage(),c.business,{onStep:step=>console.log('Read stage:',step)});
  console.log('Desktop read passed; total events:',snapshot.observedCount,'daycare bookings:',snapshot.bookings.length);
} catch(error) {
  console.error('Desktop read failed:',['login_required','incomplete_fetch','identity_review'].includes(error.code)?error.code:'worker_error');
  process.exitCode=1;
} finally {await browser?.close();}
