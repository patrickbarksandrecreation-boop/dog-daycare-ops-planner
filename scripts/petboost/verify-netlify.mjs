import {serverClient,serverConfig,rpc} from './netlify-runtime.mjs';
import {randomUUID} from 'node:crypto';
// Run on the trusted setup desktop after seed-session. Prints no secrets.
const env=process.env,c=serverConfig(env),db=serverClient(env);
if(!env.PETBOOST_SITE_URL || !env.PETBOOST_DISPATCH_SECRET) throw Error('Configure the setup environment first');
const site=new URL(env.PETBOOST_SITE_URL);
if(site.protocol!=='https:')throw Error('HTTPS is required');
const verificationId=randomUUID();
const response=await fetch(new URL('/.netlify/functions/petboost-verify-background',site),{
  method:'POST',headers:{'x-petboost-dispatch':env.PETBOOST_DISPATCH_SECRET,'content-type':'application/json'},
  body:JSON.stringify({verificationId}),redirect:'error',signal:AbortSignal.timeout(15000),
});
if(response.status!==202)throw Error('Netlify did not acknowledge verification');
console.log('Netlify verification requested. Waiting for a full read; no bookings will be imported.');
for(let i=0;i<24;i++) {
  await new Promise(resolve=>setTimeout(resolve,20000));
  const result=await rpc(db,'read_petboost_verification',{p_workspace:c.workspace});
  if(result?.run_id!==verificationId || !result.finished_at) continue;
  if(result.verified_at) {
    console.log('Netlify read-only verification passed. Imports may now be enabled after the workplace access review.');process.exit(0);
  }
  if(result?.error) {console.error('Netlify verification failed:',result.error);process.exit(1);}
}
console.error('Verification has not completed. Keep imports disabled and inspect sanitized Netlify logs.');process.exitCode=1;
