import {randomUUID} from 'node:crypto';
import {serverClient,serverConfig,rpc,launchServerless} from './netlify-runtime.mjs';
import {seal} from './session-crypto.mjs';
import {mobileKeys,openCommand} from './mobile-crypto.mjs';
import {setupState} from './setup-state.mjs';
import {mobileCommand} from './mobile-contract.mjs';

const loginHost='petboost-business.au.auth0.com';
const allowedUrl=value=>{try{const u=new URL(value);return u.protocol==='https:' && [loginHost,'business.petboost.com'].includes(u.hostname);}catch{return false;}};

// Inspect only login controls, never input values, account data or page HTML.
export async function loginForm(page) {
  if(new URL(page.url()).hostname!==loginHost)return null;
  return page.evaluate(()=>{
    const visible=el=>!!(el.getClientRects().length) && getComputedStyle(el).visibility!=='hidden';
    if(Array.from(document.querySelectorAll('iframe[src*="captcha"],iframe[src*="challenge"],.g-recaptcha,.h-captcha,[data-sitekey]')).some(visible))
      return {unsupported:true,fields:[],buttons:[]};
    const inputs=Array.from(document.querySelectorAll('input'));
    const fields=[];
    for(const [index,el] of inputs.entries()) {
      if(!visible(el) || el.disabled || el.readOnly || ['hidden','submit','button','checkbox','radio'].includes(el.type))continue;
      const hint=`${el.name} ${el.id} ${el.autocomplete}`.toLowerCase();
      const kind=el.type==='password'?'password':el.type==='email'||/email|username/.test(hint)?'email':
        /code|otp|one-time|token/.test(hint)?'code':null;
      if(!kind)return {unsupported:true,fields:[],buttons:[]};
      fields.push({index,kind,required:el.required,maxLength:el.maxLength>0?Math.min(el.maxLength,1024):1024});
    }
    const buttons=[];
    for(const [index,el] of Array.from(document.querySelectorAll('button,input[type="submit"]')).entries()) {
      if(!visible(el) || el.disabled)continue;
      const label=(el.tagName==='INPUT'?el.value:el.innerText).trim().replace(/\s+/g,' ');
      if(/^(continue(?: with email)?|log ?in|sign in|verify|submit|send (?:a )?code|resend(?: code)?|send a new code)$/i.test(label))
        buttons.push({index,label});
    }
    const rejected=Array.from(document.querySelectorAll('[role="alert"],.ulp-input-error-message,.auth0-global-message-error'))
      .some(el=>visible(el) && !!el.textContent.trim());
    return {fields,buttons,rejected,unsupported:fields.length>6 || buttons.length>8};
  });
}
export function publicLoginForm(form) {
  return {fields:form.fields.map(({kind,required,maxLength},id)=>({id,kind,required,maxLength,
    label:kind==='password'?'Password':kind==='email'?'Email address':'Verification code'})),
    buttons:form.buttons.map(({label},id)=>({id,label})),
    notice:form.unsupported?'unsupported':form.rejected?'rejected':form.buttons.length?'form':'loading'};
}
export async function applyLoginCommand(page,form,input) {
  const command=mobileCommand(input);
  if(form.unsupported || !form.buttons[command.button] || command.values.length!==form.fields.length)throw Error('Stale login form');
  for(const {field,value} of command.values) {
    const spec=form.fields[field];if(!spec || value.length>spec.maxLength)throw Error('Invalid field');
    await page.locator('input').nth(spec.index).fill(value,{timeout:5000});
  }
  await page.locator('button,input[type="submit"]').nth(form.buttons[command.button].index).click({timeout:10000});
}
async function signedIn(page,business) {
  const u=new URL(page.url());
  if(u.origin!=='https://business.petboost.com' || !['/me','/mission-control','/appointments'].includes(u.pathname))return false;
  const button=page.getByRole('button',{name:business,exact:true});
  if(await button.isVisible())return true;
  const menu=page.getByRole('button',{name:'Open menu',exact:true});
  if(await menu.isVisible()){await menu.click({timeout:3000});return await button.isVisible();}
  return false;
}
export async function runMobileLogin({run,env=process.env,db,launch=launchServerless,fetcher=fetch,
  now=()=>Date.now(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeoutMs=6*60*1000}={}) {
  if(env.CONTEXT!=='production')return {status:'disabled'};
  const c=serverConfig(env);db ||= serverClient(env);
  const worker=randomUUID();
  const keys=mobileKeys();
  const call=(op,extra={})=>rpc(db,'petboost_mobile_worker',{p_workspace:c.workspace,p_run:run,p_worker:worker,p_op:op,
    p_view:null,p_state:null,p_verification:null,...extra});
  if(!await call('claim',{p_view:{publicKey:keys.publicKey}}))return {status:'idle'};
  let browser,timer,expired=false;
  const started=now();
  try {
    browser=await launch();
    // Also close an in-flight navigation/interaction at the deadline. No browser
    // or queued credential survives this short-lived reconnect process.
    timer=setTimeout(()=>{expired=true;void browser.close().catch(()=>{});},timeoutMs);
    const context=await browser.newContext({timezoneId:'Australia/Brisbane',locale:'en-AU',viewport:{width:390,height:740}});
    await context.route('**/*',route=>{
      const r=route.request();
      if(r.isNavigationRequest() && !allowedUrl(r.url()))return route.abort();
      return ['image','media','font'].includes(r.resourceType())?route.abort():route.continue();
    });
    context.on('page',p=>{if(context.pages().length>1)void p.close();});
    const page=await context.newPage();page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(30000);
    await page.goto('https://business.petboost.com',{waitUntil:'domcontentloaded'});
    let previous='',form=null,submitted=false;
    while(!expired && now()-started<timeoutMs) {
      const work=await call('take');if(!work)return {status:'cancelled'};
      if(!allowedUrl(page.url()))throw Error('Unsupported login destination');
      if(await signedIn(page,c.business)) {
        const state=setupState(await context.storageState({indexedDB:true}),{filter:true});
        const verificationId=randomUUID();
        const saved=await call('finish',{p_state:seal(state,c.sessionKey,`${c.workspace}:${c.business}`),p_verification:verificationId});
        if(!saved)return {status:'cancelled'};
        // A successful save is independent of the read-only check dispatch.
        try {
          const site=new URL(env.URL);if(site.protocol!=='https:' || !env.PETBOOST_DISPATCH_SECRET)throw Error('Missing dispatch');
          await fetcher(new URL('/.netlify/functions/petboost-verify-background',site),{
            method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
            headers:{'content-type':'application/json','x-petboost-dispatch':env.PETBOOST_DISPATCH_SECRET},body:JSON.stringify({verificationId}),
          });
        } catch { /* The phone reports saved/pending, never a false verified result. */ }
        return {status:'saved'};
      }
      // Re-read controls before applying a command. Never apply an index from
      // an old screen if the login provider changed the form independently.
      const current=await loginForm(page);
      if(work.command) {
        if(!form || JSON.stringify(current)!==JSON.stringify(form))throw Error('Login screen changed');
        const command=openCommand(work.command,keys.privateKey,`mobile:${c.workspace}:${run}:${work.revision}`);
        await applyLoginCommand(page,form,command);submitted=true;
        await pause(700);continue;
      }
      const view=current?publicLoginForm(current):{fields:[],buttons:[],notice:'loading'};
      const signature=JSON.stringify(current);
      if(signature!==previous || submitted) {
        const published=await call('publish',{p_view:view});if(!published)return {status:'cancelled'};
        if(!published.pending){previous=signature;form=current;submitted=false;}
      }
      await pause(1200);
    }
    await call('fail');return {status:'expired'};
  } catch {
    // Do not log exceptions, provider messages, DOM, URLs or field values.
    await call('fail');return {status:'failed'};
  } finally {clearTimeout(timer);await browser?.close().catch(()=>{});}
}
