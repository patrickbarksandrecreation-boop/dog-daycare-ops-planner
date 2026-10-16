import {enabled,serverClient,serverConfig,rpc,dispatch,deploymentEnv} from '../../scripts/petboost/netlify-runtime.mjs';
export default async (request,context)=>{
  const env=deploymentEnv(context);
  const headers={'cache-control':'no-store'};
  if(!enabled(env)) return new Response('Sync is not enabled',{status:503,headers});
  if(request.method!=='POST') return new Response('Method not allowed',{status:405,headers});
  const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if(!token) return new Response('Sign in required',{status:401,headers});
  try {
    const db=serverClient(env), c=serverConfig(env);
    const {data,error}=await db.auth.getUser(token);
    if(error || !data.user) return new Response('Sign in required',{status:401,headers});
    // Query using the validated subject, never caller-supplied workspace or role.
    const access=await rpc(db,'petboost_kick_access',{p_workspace:c.workspace,p_user:data.user.id});
    if(!access.authorized) return new Response('Staff access required',{status:403,headers});
    // The frontend queued through the membership-checked RPC first. A redundant
    // kick cannot create work or bypass the DB throttle/lease.
    if(!access.pending) return new Response('No pending request',{status:200,headers});
    await dispatch(env);return new Response('Sync requested',{status:202,headers});
  } catch {return new Response('Sync could not start. The queued request is retained.',{status:503,headers});}
};
