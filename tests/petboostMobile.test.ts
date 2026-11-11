import {it,expect,vi} from 'vitest';
import {randomBytes} from 'node:crypto';
// @ts-expect-error server ESM
import {mobileHandler} from '../scripts/petboost/mobile-api.mjs';
// @ts-expect-error server ESM
import {mobileKeys,sealCommand,openCommand} from '../scripts/petboost/mobile-crypto.mjs';
// @ts-expect-error server ESM
import {mobileCommand} from '../scripts/petboost/mobile-contract.mjs';
const run='11111111-2222-4333-8444-555555555555',token='a'.repeat(64);
const env={CONTEXT:'production',SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic',
  PETBOOST_WORKSPACE_ID:'synthetic',PETBOOST_BUSINESS_BUTTON:'Synthetic Enterprise',PETBOOST_SESSION_KEY:randomBytes(32).toString('base64'),
  PETBOOST_DISPATCH_SECRET:'s'.repeat(40),URL:'https://synthetic.netlify.app'};
const request=(body:unknown,headers={})=>new Request(`${env.URL}/.netlify/functions/petboost-mobile`,{method:'POST',
  headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...headers},body:JSON.stringify(body)});
const fixture=(data:any)=>({rpc:vi.fn(async()=>({data,error:null}))});
it('requires published production and a one-use bearer code; rejects cross-origin and oversized requests',async()=>{
  const db=fixture(null);
  expect((await mobileHandler(request({op:'start'}),{},{env:{...env,CONTEXT:'deploy-preview'},db})).status).toBe(404);
  expect((await mobileHandler(request({op:'start'},{authorization:''}),{},{env,db})).status).toBe(401);
  expect((await mobileHandler(request({op:'start'},{origin:'https://other.example'}),{},{env,db})).status).toBe(403);
  expect((await mobileHandler(request({op:'start',padding:'x'.repeat(12001)}),{},{env,db})).status).toBe(400);
  expect(db.rpc).not.toHaveBeenCalled();
});
it('dispatches one protected browser only for a newly-created run, never exposing the dispatch secret',async()=>{
  const db=fixture({run,created:true,status:'starting',revision:0}),fetcher=vi.fn(async()=>new Response(null,{status:202}));
  const response=await mobileHandler(request({op:'start'}),{},{env,db,fetcher});
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.text()).not.toContain(env.PETBOOST_DISPATCH_SECRET);
  const [url,options]=fetcher.mock.calls[0] as any;
  expect(String(url)).toBe(`${env.URL}/.netlify/functions/petboost-login-background`);
  expect(JSON.parse(options.body)).toEqual({run});expect(options.headers['x-petboost-dispatch']).toBe(env.PETBOOST_DISPATCH_SECRET);
  db.rpc.mockResolvedValue({data:{run,created:false,status:'starting',revision:0},error:null});fetcher.mockClear();
  await mobileHandler(request({op:'start'}),{},{env,db,fetcher});expect(fetcher).not.toHaveBeenCalled();
});
it('cancels a failed dispatch so a retry can start a fresh browser',async()=>{
  const db=fixture({run,created:true,status:'starting'});
  const response=await mobileHandler(request({op:'start'}),{},{env,db,fetcher:async()=>new Response(null,{status:503})});
  expect(response.status).toBe(503);expect(db.rpc.mock.calls[1][1]).toMatchObject({p_op:'cancel',p_run:run});
});
it('encrypts credentials for the live worker only, bound to the exact login step; no credential reaches DB plaintext',async()=>{
  const keys=mobileKeys(),command={button:0,values:[{field:0,value:'synthetic-secret-password'}]};
  const db=fixture({run,status:'ready',revision:3,publicKey:keys.publicKey});
  const response=await mobileHandler(request({op:'command',run,revision:3,command}),{},{env,db});expect(response.status).toBe(200);
  const encrypted=(db.rpc.mock.calls[1][1] as any).p_command;
  expect(encrypted).not.toContain('synthetic-secret-password');
  expect(openCommand(encrypted,keys.privateKey,`mobile:synthetic:${run}:3`)).toEqual(command);
  expect(()=>openCommand(encrypted,keys.privateKey,`mobile:synthetic:${run}:4`)).toThrow();
  expect(()=>openCommand(encrypted,mobileKeys().privateKey,`mobile:synthetic:${run}:3`)).toThrow();
  const text=await response.text();expect(text).not.toContain('publicKey');expect(text).not.toContain('synthetic-secret-password');
});
it('rejects stale forms, malformed actions, invented fields and scripts before queuing credentials',async()=>{
  const db=fixture({run,status:'ready',revision:4,publicKey:mobileKeys().publicKey});
  expect((await mobileHandler(request({op:'command',run,revision:3,command:{button:0,values:[]}}),{},{env,db})).status).toBe(409);
  for(const command of [{button:-1,values:[]},{button:0,values:[{field:9,value:'x'}]},{button:0,values:[{field:0,value:'x'},{field:0,value:'y'}]}])
    expect(()=>mobileCommand(command)).toThrow();
  expect(db.rpc).toHaveBeenCalledTimes(1);
});
it('reports verified only for the saved session’s exact read-only check',async()=>{
  for(const [v,expected] of [[{run_id:run,verified_at:'now'},'verified'],[{run_id:'other',verified_at:'now'},'pending'],
    [{run_id:run,finished_at:'now',error:'login_required'},'failed']] as const) {
    const db={rpc:vi.fn(async(name:string)=>({data:name==='petboost_mobile_request'?{run,status:'saved',verificationId:run,savedAt:new Date().toISOString()}:v,error:null}))};
    const response=await mobileHandler(request({op:'read',run}),{},{env,db});expect((await response.json()).verification).toBe(expected);
  }
});
it('fails closed on server errors without returning internal diagnostics',async()=>{
  const db={rpc:vi.fn(async()=>({data:null,error:{code:'private-database-detail'}}))};
  const response=await mobileHandler(request({op:'start'}),{},{env,db});expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private-database-detail');
  const keys=mobileKeys();expect(()=>openCommand(sealCommand({},keys.publicKey,'first'),keys.privateKey,'other')).toThrow();
});
