import {internalAuth,runNetlify,deploymentEnv} from '../../scripts/petboost/netlify-runtime.mjs';
export default async (request,context)=>{
  const env=deploymentEnv(context);
  if(env.CONTEXT!=='production' || request.method!=='POST' || !internalAuth(request,env)) return;
  try {
    const {verificationId}=await request.json();
    if(typeof verificationId!=='string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(verificationId)) return;
    const result=await runNetlify({env,verifyOnly:true,verificationId,onDiagnostic:({stage,code})=>console.error('Petboost verification check:',stage,code)});
    console.log('Petboost read-only verification:',result.status);
  }
  catch {console.error('Petboost verification could not record its status.');}
};
export const config={background:true};
