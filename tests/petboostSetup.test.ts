import {expect,it,vi} from 'vitest';
import {createHash,randomBytes} from 'node:crypto';
// @ts-expect-error server-only ESM
import {setupHandler} from '../scripts/petboost/session-setup.mjs';
// @ts-expect-error server-only ESM
import {setupState} from '../scripts/petboost/setup-state.mjs';
// @ts-expect-error server-only ESM
import {unseal} from '../scripts/petboost/session-crypto.mjs';
const token='a'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
const env={CONTEXT:'production',SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key',
 PETBOOST_WORKSPACE_ID:'synthetic',PETBOOST_BUSINESS_BUTTON:'Synthetic Enterprise',PETBOOST_SESSION_KEY:randomBytes(32).toString('base64')};
const state={cookies:[{domain:'business.petboost.com',name:'synthetic',value:'private-synthetic-session'}],origins:[]};
const req=(method='GET',body?:unknown)=>new Request('https://synthetic.netlify.app/.netlify/functions/petboost-connect',{
 method,headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
const fixture=(valid=true)=>({rpc:vi.fn(async(name:string)=>({data:name==='check_petboost_session_setup'?valid:null,error:null}))});
it('denies missing tokens and non-production calls before database access',async()=>{
 const db=fixture();expect((await setupHandler(new Request(req().url),{}, {env,db})).status).toBe(401);
 expect((await setupHandler(req(),{}, {env:{...env,CONTEXT:'deploy-preview'},db})).status).toBe(404);expect(db.rpc).not.toHaveBeenCalled();
});
it('requires a service-issued live token and returns only business configuration',async()=>{
 expect((await setupHandler(req(),{}, {env,db:fixture(false)})).status).toBe(401);
 const db=fixture(),response=await setupHandler(req(),{}, {env,db});
 expect(await response.json()).toEqual({business:'Synthetic Enterprise'});
 expect(db.rpc).toHaveBeenCalledExactlyOnceWith('check_petboost_session_setup',{p_workspace:'synthetic',p_hash:hash});
});
it('encrypts the login server-side and only confirms success after atomic token consumption',async()=>{
 const db=fixture(),response=await setupHandler(req('POST',{state}),{}, {env,db});expect(response.status).toBe(200);
 expect(await response.json()).toEqual({saved:true});
 const [name,args]=db.rpc.mock.calls[1] as any;expect(name).toBe('complete_petboost_session_setup');expect(args.p_hash).toBe(hash);
 expect(args.p_state).not.toContain('private-synthetic-session');
 expect(unseal(args.p_state,env.PETBOOST_SESSION_KEY,'synthetic:Synthetic Enterprise')).toEqual(state);
 expect(response.headers.get('cache-control')).toBe('no-store');
});
it('filters unrelated login state on the desktop and rejects it on the server',async()=>{
 const extra={...state,cookies:[...state.cookies,{domain:'.google.com',name:'other',value:'private-other-session'}]};
 expect(setupState(extra,{filter:true})).toEqual(state);expect(()=>setupState(extra)).toThrow('Unexpected login origin');
 const db=fixture();expect((await setupHandler(req('POST',{state:extra}),{}, {env,db})).status).toBe(400);
 expect(db.rpc).toHaveBeenCalledTimes(1);
});
it('bounds body reads without trusting content-length and rejects invalid empty state',async()=>{
 const db=fixture();const large=req('POST',{state,padding:'x'.repeat(1400001)});
 expect((await setupHandler(large,{}, {env,db})).status).toBe(400);
 expect((await setupHandler(req('POST',{state:{cookies:[],origins:[]}}),{}, {env,db})).status).toBe(400);
 expect(db.rpc.mock.calls.every((c:any)=>c[0]==='check_petboost_session_setup')).toBe(true);
});
it('returns sanitized failure when atomic consumption rejects a concurrent/expired token',async()=>{
 const db=fixture();db.rpc.mockImplementation(async(name:string)=>({data:name==='check_petboost_session_setup'?true:null,error:name==='complete_petboost_session_setup'?{code:'private-server-error'}:null} as any));
 const response=await setupHandler(req('POST',{state}),{}, {env,db});expect(response.status).toBe(503);
 expect(await response.text()).not.toContain('private-server-error');
});
it('queues only the protected read-only verification after the login has been saved',async()=>{
 const db=fixture(),fetcher=vi.fn(async()=>new Response(null,{status:202}));
 const response=await setupHandler(req('POST',{state}),{}, {env:{...env,URL:'https://synthetic.netlify.app',PETBOOST_DISPATCH_SECRET:'d'.repeat(40)},db,fetcher});
 const result=await response.json();expect(result.saved).toBe(true);expect(result.verificationId).toMatch(/^[a-f0-9-]{36}$/);
 const [url,request]=fetcher.mock.calls[0] as any;expect(String(url)).toContain('/.netlify/functions/petboost-verify-background');
 expect(JSON.parse(request.body)).toEqual({verificationId:result.verificationId});
 expect(request.body).not.toContain('private-synthetic-session');
 expect(db.rpc.mock.calls[1][0]).toBe('complete_petboost_session_setup');
});
