import {createHash,randomUUID} from 'node:crypto';
import {serverClient,serverConfig,rpc,deploymentEnv} from './netlify-runtime.mjs';
import {seal} from './session-crypto.mjs';
import {setupState} from './setup-state.mjs';
const MAX_BYTES=1400000;
async function boundedJson(request) {
  const reader=request.body?.getReader();if(!reader)throw Error('Missing request');
  const chunks=[];let size=0;
  try {
    for(;;) {
      const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw Error('Request too large');}
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {reader.releaseLock();}
}
export async function setupHandler(request,context,{env=deploymentEnv(context),db,fetcher=fetch}={}) {
  const headers={'cache-control':'no-store','content-type':'application/json','referrer-policy':'no-referrer'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(env.CONTEXT!=='production')return reply(404,{error:'Unavailable'});
  if(!['GET','POST'].includes(request.method))return reply(405,{error:'Method not allowed'});
  const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!token)return reply(401,{error:'Reconnect code is missing or expired'});
  try {
    const c=serverConfig(env);db ||= serverClient(env);
    const hash=createHash('sha256').update(token).digest('hex');
    const valid=await rpc(db,'check_petboost_session_setup',{p_workspace:c.workspace,p_hash:hash});
    if(valid!==true)return reply(401,{error:'Reconnect code is missing or expired'});
    if(request.method==='GET')return reply(200,{business:c.business});
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415,{error:'JSON required'});
    if(Number(request.headers.get('content-length')||0)>MAX_BYTES)return reply(413,{error:'Login state too large'});
    let state;
    try {state=setupState((await boundedJson(request)).state);}
    catch {return reply(400,{error:'Invalid login state'});}
    const encrypted=seal(state,c.sessionKey,`${c.workspace}:${c.business}`);
    if(encrypted.length>2000000)return reply(413,{error:'Login state too large'});
    await rpc(db,'complete_petboost_session_setup',{p_workspace:c.workspace,p_hash:hash,p_state:encrypted});
    // The saved login is confirmed independently of the background check. A
    // dispatch failure must not make the user replay an already-consumed code.
    try {
      if(!env.URL || !env.PETBOOST_DISPATCH_SECRET || env.PETBOOST_DISPATCH_SECRET.length<32)throw Error('No dispatch configuration');
      const site=new URL(env.URL);if(site.protocol!=='https:')throw Error('HTTPS required');
      const verificationId=randomUUID();
      const response=await fetcher(new URL('/.netlify/functions/petboost-verify-background',site),{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{'x-petboost-dispatch':env.PETBOOST_DISPATCH_SECRET,'content-type':'application/json'},
        body:JSON.stringify({verificationId}),
      });
      if(response.status===202)return reply(200,{saved:true,verificationId});
    } catch { /* Saved state remains valid; the owner can request verification. */ }
    return reply(200,{saved:true});
  } catch {return reply(503,{error:'Reconnect could not be completed; no success is confirmed'});}
}
