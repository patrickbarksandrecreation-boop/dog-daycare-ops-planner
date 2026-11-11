import {test,expect} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
// @ts-expect-error server ESM
import {runMobileLogin} from '../../scripts/petboost/mobile-browser.mjs';
// @ts-expect-error server ESM
import {sealCommand} from '../../scripts/petboost/mobile-crypto.mjs';
// @ts-expect-error server ESM
import {unseal} from '../../scripts/petboost/session-crypto.mjs';
const env={CONTEXT:'production',SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic',
  PETBOOST_WORKSPACE_ID:'synthetic',PETBOOST_BUSINESS_BUTTON:'Synthetic Enterprise',PETBOOST_SESSION_KEY:randomBytes(32).toString('base64'),
  PETBOOST_DISPATCH_SECRET:'s'.repeat(40),URL:'https://synthetic.netlify.app'};
const form=(input:string,action:string)=>`<!doctype html><form action="${action}" method="POST">${input}<button>Continue</button></form>`;
test('worker browser performs synthetic email/password/OTP login, saves only encrypted scoped state and closes',async({browser})=>{
  const run=randomUUID();let context:any,publicKey='',revision=0,pending:any,saved:any,view:any;
  const posted:string[]=[],commands:string[]=[];
  const db={rpc:async(name:string,args:any)=>{
    expect(name).toBe('petboost_mobile_worker');
    if(args.p_op==='claim'){publicKey=args.p_view.publicKey;return {data:{claimed:true},error:null};}
    if(args.p_op==='publish'){
      view=args.p_view;revision++;
      if(view.fields.length){const kind=view.fields[0].kind;
        const value=kind==='email'?'synthetic@example.com':kind==='password'?'synthetic-private-password':'123456';
        pending=sealCommand({button:0,values:[{field:0,value}]},publicKey,`mobile:synthetic:${run}:${revision}`);commands.push(pending);}
    }
    if(args.p_op==='take'){const command=pending;pending=null;return {data:{command,revision},error:null};}
    if(args.p_op==='finish')saved=args;
    if(args.p_op==='fail')throw Error('Unexpected worker failure');
    return {data:{ok:true},error:null};
  }};
  const launch=async()=>({
    newContext:async(options:any)=>{
      context=await browser.newContext(options);
      await context.addCookies([{name:'synthetic_session',value:'synthetic-private-session',domain:'business.petboost.com',path:'/'}]);
      return {
        route:async(pattern:string,handler:any)=>context.route(pattern,(route:any)=>handler({request:()=>route.request(),abort:()=>route.abort(),continue:async()=>{
          const u=new URL(route.request().url()),path=u.pathname;
          if(route.request().method()==='POST')posted.push(route.request().postData()||'');
          // Playwright does not re-route the later requests in an HTTP redirect
          // chain. Use a document navigation so every fixture request remains
          // intercepted; never send the synthetic flow to the real provider.
          if(u.hostname==='business.petboost.com' && path==='/')return route.fulfill({contentType:'text/html',body:'<script>location.replace("https://petboost-business.au.auth0.com/u/login")</script>'});
          if(path==='/u/login')return route.fulfill({contentType:'text/html',body:form('<input name="username" type="email" required>','/u/login/password')});
          if(path==='/u/login/password')return route.fulfill({contentType:'text/html',body:form('<input name="password" type="password" required>','/u/login/code')});
          if(path==='/u/login/code')return route.fulfill({contentType:'text/html',body:form('<input name="code" autocomplete="one-time-code" required>','/u/login/finish')});
          if(path==='/u/login/finish')return route.fulfill({contentType:'text/html',body:'<script>location.replace("https://business.petboost.com/mission-control")</script>'});
          if(path==='/mission-control')return route.fulfill({contentType:'text/html',body:'<button>Synthetic Enterprise</button>'});
          return route.abort();
        }})),
        on:context.on.bind(context),pages:context.pages.bind(context),newPage:context.newPage.bind(context),storageState:context.storageState.bind(context),
      };
    },close:async()=>context?.close(),
  });
  const dispatched:any[]=[];
  const result=await runMobileLogin({run,env,db,launch,pause:()=>new Promise(resolve=>setTimeout(resolve,30)),timeoutMs:15000,
    fetcher:async(url:any,options:any)=>{dispatched.push({url:String(url),options});return new Response(null,{status:202});}});
  expect(result).toEqual({status:'saved'});expect(posted).toEqual(['username=synthetic%40example.com','password=synthetic-private-password','code=123456']);
  expect(saved.p_state).not.toContain('synthetic-private-session');expect(commands.join(' ')).not.toContain('synthetic-private-password');
  expect(unseal(saved.p_state,env.PETBOOST_SESSION_KEY,'synthetic:Synthetic Enterprise').cookies[0].value).toBe('synthetic-private-session');
  expect(dispatched[0].url).toBe(`${env.URL}/.netlify/functions/petboost-verify-background`);
  expect(JSON.parse(dispatched[0].options.body)).toEqual({verificationId:saved.p_verification});
  expect(context.pages()).toHaveLength(0);
});
test('cancelled or duplicate worker claims never launch a login browser',async()=>{
  let launched=false;
  const result=await runMobileLogin({run:randomUUID(),env,db:{rpc:async()=>({data:null,error:null})},launch:async()=>{launched=true;}});
  expect(result).toEqual({status:'idle'});expect(launched).toBe(false);
});
