import {createHash,randomUUID} from 'node:crypto';
import {serverClient,serverConfig,rpc,deploymentEnv} from './netlify-runtime.mjs';
import {sealCommand} from './mobile-crypto.mjs';
import {mobileCommand,validRun} from './mobile-contract.mjs';

export async function smallJson(request,limit=12000) {
  const reader=request.body?.getReader();if(!reader)throw Error('Missing body');
  let size=0;const chunks=[];
  try {
    for(;;){const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('Request too large');}chunks.push(Buffer.from(value));}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {reader.releaseLock();}
}
export async function mobileHandler(request,context,{env=deploymentEnv(context),db,fetcher=fetch}={}) {
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{
    'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff',
  }});
  if(env.CONTEXT!=='production')return reply(404,{error:'Unavailable'});
  if(request.method!=='POST')return reply(405,{error:'POST required'});
  const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!token)return reply(401,{error:'Enter a current reconnect code.'});
  // Bearer auth is required even on same-origin calls. Do not enable CORS.
  if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin)
    return reply(403,{error:'Open reconnect on the planner website.'});
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415,{error:'JSON required'});
  let body;try{body=await smallJson(request);}catch{return reply(400,{error:'Invalid login request.'});}
  if(!['start','read','command','cancel'].includes(body?.op) || (body.op!=='start' && !validRun(body.run)))
    return reply(400,{error:'Invalid login request.'});
  if(body.op==='command' && (!Number.isInteger(body.revision) || body.revision<0))return reply(400,{error:'Invalid login step.'});
  let command;
  if(body.op==='command')try{command=mobileCommand(body.command);}catch{return reply(400,{error:'Invalid login action.'});}
  try {
    const c=serverConfig(env);db ||= serverClient(env);
    const hash=createHash('sha256').update(token).digest('hex');
    const run=body.op==='start'?randomUUID():body.run;
    let encrypted=null;
    if(command) {
      const current=await rpc(db,'petboost_mobile_request',{p_workspace:c.workspace,p_hash:hash,p_op:'read',p_run:run,p_revision:null,p_command:null});
      if(!current)return reply(401,{error:'Reconnect code expired or was replaced. Request a new code.'});
      if(current.status!=='ready' || current.revision!==body.revision || !current.publicKey)return reply(409,{error:'That login step has changed. Wait for the current screen.'});
      encrypted=sealCommand(command,current.publicKey,`mobile:${c.workspace}:${run}:${body.revision}`);
    }
    const result=await rpc(db,'petboost_mobile_request',{p_workspace:c.workspace,p_hash:hash,p_op:body.op,p_run:run,
      p_revision:body.revision??null,p_command:encrypted});
    if(!result)return reply(401,{error:'Reconnect code expired or was replaced. Request a new code.'});
    if(result.conflict)return reply(409,{error:'That login step has changed. Wait for the current screen.'});
    if(result.created) {
      try {
        if(!env.URL || !env.PETBOOST_DISPATCH_SECRET || env.PETBOOST_DISPATCH_SECRET.length<32)throw Error('Missing dispatch');
        const site=new URL(env.URL);if(site.protocol!=='https:')throw Error('HTTPS required');
        const dispatched=await fetcher(new URL('/.netlify/functions/petboost-login-background',site),{
          method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
          headers:{'content-type':'application/json','x-petboost-dispatch':env.PETBOOST_DISPATCH_SECRET},
          body:JSON.stringify({run:result.run}),
        });
        if(dispatched.status!==202)throw Error('Dispatch failed');
      } catch {
        await rpc(db,'petboost_mobile_request',{p_workspace:c.workspace,p_hash:hash,p_op:'cancel',p_run:result.run,p_revision:null,p_command:null});
        return reply(503,{error:'The login browser could not start. Try again.'});
      }
    }
    let verification;
    if(result.status==='saved' && result.verificationId) {
      const v=await rpc(db,'read_petboost_verification',{p_workspace:c.workspace});
      verification=v?.run_id===result.verificationId
        ? (v.verified_at?'verified':v.finished_at?'failed':'checking'):'pending';
      if(verification==='checking' && Date.now()-Date.parse(result.savedAt)>8*60*1000)verification='failed';
    }
    return reply(200,{...result,created:undefined,publicKey:undefined,business:c.business,verification});
  } catch {return reply(503,{error:'Reconnect is unavailable. Your existing board is preserved.'});}
}
