import {internalAuth,deploymentEnv} from '../../scripts/petboost/netlify-runtime.mjs';
import {validRun} from '../../scripts/petboost/mobile-contract.mjs';
import {runMobileLogin} from '../../scripts/petboost/mobile-browser.mjs';
export default async(request,context)=>{
  const env=deploymentEnv(context);
  if(env.CONTEXT!=='production' || request.method!=='POST' || !internalAuth(request,env))return;
  try {
    const {run}=await request.json();if(!validRun(run))return;
    const result=await runMobileLogin({run,env});
    console.log('Petboost mobile reconnect:',result.status);
  } catch {console.error('Petboost mobile reconnect could not record its outcome.');}
};
export const config={background:true};
