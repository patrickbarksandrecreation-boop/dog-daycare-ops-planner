import {serverClient,serverConfig,rpc} from './netlify-runtime.mjs';
// Runs only inside the successful production build. Secrets stay in Netlify;
// this dispatches the existing read-only endpoint and never enables imports.
export async function verifyAfterDeploy({env=process.env,verificationId,db,fetcher=fetch}={}) {
  if(env.CONTEXT!=='production' || env.NETLIFY!=='true' || env.BRANCH!=='main') return {status:'skipped'};
  if(typeof verificationId!=='string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(verificationId))
    throw new Error('Invalid verification request ID');
  const c=serverConfig(env);
  if(!env.OPENAI_API_KEY || !env.PETBOOST_DISPATCH_SECRET || env.PETBOOST_DISPATCH_SECRET.length<32 || !env.URL)
    throw new Error('Incomplete hosted verification configuration');
  db ||= serverClient(env);
  const existing=await rpc(db,'read_petboost_verification',{p_workspace:c.workspace});
  // A fixed request ID is attempted once. Future deploys do not keep invoking
  // the model after that request has acquired the shared verification lease.
  if(existing?.run_id===verificationId) return {status:'already_requested'};
  const site=new URL(env.URL);
  if(site.protocol!=='https:' || site.username || site.password) throw new Error('Invalid verification origin');
  const response=await fetcher(new URL('/.netlify/functions/petboost-verify-background',site),{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{'x-petboost-dispatch':env.PETBOOST_DISPATCH_SECRET,'content-type':'application/json'},
    body:JSON.stringify({verificationId}),
  });
  if(response.status!==202) throw new Error('Hosted verification dispatch was not acknowledged');
  return {status:'requested'};
}
