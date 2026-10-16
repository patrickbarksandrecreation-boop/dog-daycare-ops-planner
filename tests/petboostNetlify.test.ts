import {expect,it,vi} from 'vitest';
import {randomBytes} from 'node:crypto';
// @ts-expect-error server-only Node ESM
import {seal,unseal} from '../scripts/petboost/session-crypto.mjs';
// @ts-expect-error server-only Node ESM
import {enabled,internalAuth,dispatch,runNetlify,deploymentEnv} from '../scripts/petboost/netlify-runtime.mjs';
const secret=randomBytes(32).toString('base64');
const env={CONTEXT:'production',PETBOOST_SYNC_ENABLED:'true',PETBOOST_WORKSPACE_ID:'synthetic',PETBOOST_BUSINESS_BUTTON:'Synthetic Enterprise',SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-key',PETBOOST_SESSION_KEY:secret,PETBOOST_DISPATCH_SECRET:'x'.repeat(40),URL:'https://synthetic.netlify.app'};
const binding='synthetic:Synthetic Enterprise';
const state={cookies:[{name:'synthetic-cookie',value:'synthetic-private-value'}],origins:[]};
function fixture(errorCode?:string) {
  const calls:any[]=[];
  const db={rpc:vi.fn(async(name:string,args:any)=>{
    calls.push({name,args});
    return {data:name==='claim_petboost_sync'?'synthetic-run':name==='claim_petboost_verification'?args.p_run:name==='read_petboost_session'?seal(state,secret,binding):null,error:null};
  })};
  const close=vi.fn(),context={newPage:async()=>({}),storageState:async()=>state};
  const launch=vi.fn(async()=>({newContext:async()=>context,close}));
  const reader=vi.fn(async()=>{if(errorCode)throw Object.assign(new Error(errorCode),{code:errorCode});return {date:'2026-10-16',bookings:[]};});
  return {db,calls,launch,reader,close};
}
it('encrypts sessions with random nonces and binds authentication to the exact workspace/business',()=>{
  const a=seal(state,secret,binding),b=seal(state,secret,binding);
  expect(a).not.toEqual(b);expect(a).not.toContain('synthetic-private-value');expect(unseal(a,secret,binding)).toEqual(state);
  expect(()=>unseal(a,secret,'other-workspace')).toThrow();
  const tampered=JSON.parse(a);tampered.body='AAAA';expect(()=>unseal(JSON.stringify(tampered),secret,binding)).toThrow();
  expect(()=>seal(state,'bad',binding)).toThrow();
});
it('disables previews and requires the internal dispatch secret before worker invocation',async()=>{
  expect(enabled(deploymentEnv({deploy:{context:'deploy-preview',published:false}},env))).toBe(false);
  expect(enabled(deploymentEnv({deploy:{context:'production',published:true}},env))).toBe(true);
  expect(enabled(deploymentEnv(undefined,env))).toBe(false);
  expect(enabled({...env,CONTEXT:'deploy-preview'})).toBe(false);
  expect(internalAuth(new Request(env.URL),env)).toBe(false);
  expect(internalAuth(new Request(env.URL,{headers:{'x-petboost-dispatch':env.PETBOOST_DISPATCH_SECRET}}),env)).toBe(true);
  const fetcher=vi.fn(async()=>new Response(null,{status:202}));
  await dispatch(env,fetcher); expect(fetcher).toHaveBeenCalledTimes(1);
  await dispatch({...env,CONTEXT:'deploy-preview'},fetcher);expect(fetcher).toHaveBeenCalledTimes(1);
  const f=fixture();expect(await runNetlify({...f,env:{...env,CONTEXT:'deploy-preview'}})).toEqual({status:'disabled'});expect(f.launch).not.toHaveBeenCalled();
});
it('restores encrypted session, saves refreshed state under the lease, then imports exactly once',async()=>{
  const f=fixture();expect(await runNetlify({...f,env})).toEqual({status:'success'});
  expect(f.calls.map(c=>c.name)).toEqual(['claim_petboost_sync','read_petboost_session','save_petboost_session','apply_petboost_sync']);
  expect(f.calls[2].args.p_run).toBe('synthetic-run');expect(f.calls[2].args.p_state).not.toContain('synthetic-private-value');expect(f.close).toHaveBeenCalledOnce();
});
it('records session expiry without applying an empty snapshot or replacing saved state',async()=>{
  const f=fixture('login_required');expect(await runNetlify({...f,env})).toEqual({status:'login_required'});
  expect(f.calls.map(c=>c.name)).toEqual(['claim_petboost_sync','read_petboost_session','fail_petboost_sync']);expect(f.close).toHaveBeenCalledOnce();
});
it('read-only Netlify verification uses its own fenced lease with imports disabled and never applies bookings',async()=>{
  const f=fixture(),verificationId=crypto.randomUUID();
  expect(await runNetlify({...f,env:{...env,PETBOOST_SYNC_ENABLED:'false'},verifyOnly:true,verificationId})).toEqual({status:'success'});
  expect(f.calls.map(c=>c.name)).toEqual(['claim_petboost_verification','read_petboost_session','save_petboost_session','finish_petboost_verification']);
  expect(f.calls[2].args.p_run).toBe(verificationId);
  expect(f.calls[3].args.p_run).toBe(verificationId);
  expect(f.close).toHaveBeenCalledOnce();
});
it('does not launch another verification browser while a job owns the lease',async()=>{
  const f=fixture();f.db.rpc.mockImplementation(async()=>({data:null,error:null}));
  expect(await runNetlify({...f,env,verifyOnly:true})).toEqual({status:'idle'});
  expect(f.launch).not.toHaveBeenCalled();
});
