import {enabled,internalAuth,runNetlify,deploymentEnv} from '../../scripts/petboost/netlify-runtime.mjs';
export default async (request,context)=>{
  const env=deploymentEnv(context);
  // Netlify acknowledges background requests before executing the handler, so
  // authorization must happen before any DB claim or Chromium startup.
  if(!enabled(env) || request.method!=='POST' || !internalAuth(request,env)) return;
  try {const result=await runNetlify({env});console.log('Petboost worker:',result.status);}
  catch {console.error('Petboost worker could not record its status.');}
};
export const config={background:true};
