// Trusted desktop helper: no production secrets file. The one-use code allows
// replacement only, never reading the existing saved login.
import {chromium} from '@playwright/test';
import {setupState} from './setup-state.mjs';
process.umask(0o077);
const endpoint='https://dog-daycare-ops-planner.netlify.app/.netlify/functions/petboost-connect';
const token=process.env.PETBOOST_SETUP_TOKEN;
if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('Set the one-use PETBOOST_SETUP_TOKEN supplied for this reconnect');
const headers={authorization:`Bearer ${token}`};
let browser,stage='server connection';
try {
  const config=await fetch(endpoint,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!config.ok)throw Error('Reconnect unavailable');
  const {business}=await config.json();
  if(typeof business!=='string' || !business)throw Error('Missing business configuration');
  const channel=process.env.PETBOOST_SETUP_BROWSER || (process.platform==='win32'?'msedge':'chrome');
  if(!['msedge','chrome'].includes(channel))throw Error('Use installed Edge or Chrome');
  stage='browser launch';browser=await chromium.launch({channel,headless:false});
  const context=await browser.newContext({timezoneId:'Australia/Brisbane',locale:'en-AU'});
  const page=await context.newPage();await page.goto('https://business.petboost.com');
  stage='Petboost sign-in';console.log('Sign in to Petboost in the opened browser. This does not change bookings.');
  await page.waitForURL(u=>u.origin==='https://business.petboost.com' && ['/me','/mission-control','/appointments'].includes(u.pathname),{timeout:300000});
  stage='business verification';const businessButton=page.getByRole('button',{name:business,exact:true}),menu=page.getByRole('button',{name:'Open menu',exact:true});
  await businessButton.or(menu).first().waitFor({timeout:30000});
  if(!await businessButton.isVisible())await menu.click();
  await businessButton.waitFor({timeout:10000});
  const state=setupState(await context.storageState({indexedDB:true}),{filter:true});
  stage='login upload';const response=await fetch(endpoint,{method:'POST',headers:{...headers,'content-type':'application/json'},
    body:JSON.stringify({state}),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok || (await response.json()).saved!==true)throw Error('Login upload not confirmed');
  console.log('Petboost login saved securely. No bookings imported. Tell ChatGPT: login saved.');
} catch {
  console.error(`Petboost reconnect did not finish during ${stage}. Check sign-in, installed browser and reconnect-code expiry.`);
  process.exitCode=1;
} finally {delete process.env.PETBOOST_SETUP_TOKEN;await browser?.close();}
