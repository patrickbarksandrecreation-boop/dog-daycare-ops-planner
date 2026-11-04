import {it,expect,vi} from 'vitest';
// @ts-expect-error server-only ESM
import {verifyAfterDeploy} from '../scripts/petboost/verify-after-deploy.mjs';
const verificationId='dd583655-5cf6-43f4-8576-e2e6019aa9c1';
const env={NETLIFY:'true',CONTEXT:'production',BRANCH:'main',URL:'https://synthetic.netlify.app',
  PETBOOST_WORKSPACE_ID:'synthetic',PETBOOST_BUSINESS_BUTTON:'Synthetic Enterprise',SUPABASE_URL:'https://synthetic.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-key',PETBOOST_SESSION_KEY:'synthetic-session-key',OPENAI_API_KEY:'synthetic-openai-key',PETBOOST_DISPATCH_SECRET:'s'.repeat(40)};
it('skips previews, non-Netlify execution and other branches before accessing secrets or the database',async()=>{
  for(const override of [{CONTEXT:'deploy-preview'},{NETLIFY:'false'},{BRANCH:'other'}])
    expect(await verifyAfterDeploy({env:{...env,...override},verificationId})).toEqual({status:'skipped'});
});
it('uses the protected read-only endpoint with a correlation ID and never enables or imports bookings',async()=>{
  const db={rpc:vi.fn(async()=>({data:null,error:null}))},fetcher=vi.fn(async()=>new Response(null,{status:202}));
  expect(await verifyAfterDeploy({env,verificationId,db,fetcher})).toEqual({status:'requested'});
  expect(db.rpc).toHaveBeenCalledExactlyOnceWith('read_petboost_verification',{p_workspace:'synthetic'});
  const [url,request]=fetcher.mock.calls[0] as any;
  expect(String(url)).toBe('https://synthetic.netlify.app/.netlify/functions/petboost-verify-background');
  expect(request.headers['x-petboost-dispatch']).toBe(env.PETBOOST_DISPATCH_SECRET);
  expect(JSON.parse(request.body)).toEqual({verificationId});
  expect(request.body).not.toContain(env.OPENAI_API_KEY);
});
it('does not rerun the fixed request on subsequent deploys, including recorded failures or in-progress checks',async()=>{
  for(const state of [{run_id:verificationId},{run_id:verificationId,error:'incomplete_fetch',finished_at:'now'}]) {
    const db={rpc:vi.fn(async()=>({data:state,error:null}))},fetcher=vi.fn();
    expect(await verifyAfterDeploy({env,verificationId,db,fetcher})).toEqual({status:'already_requested'});
    expect(fetcher).not.toHaveBeenCalled();
  }
});
it('rejects bad configuration and failed dispatch without exposing provider errors',async()=>{
  const db={rpc:vi.fn(async()=>({data:null,error:null}))};
  await expect(verifyAfterDeploy({env,verificationId:'invalid',db})).rejects.toThrow('Invalid verification request ID');
  await expect(verifyAfterDeploy({env:{...env,OPENAI_API_KEY:''},verificationId,db})).rejects.toThrow('Incomplete hosted verification configuration');
  await expect(verifyAfterDeploy({env,verificationId,db,fetcher:async()=>new Response('private provider message',{status:403})})).rejects.toThrow('Hosted verification dispatch was not acknowledged');
});
