import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{windowsHide:true,stdio:'pipe'});
let browser;
try {
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Preview startup timed out')),10000);
    server.stdout.on('data',chunk=>{if(chunk.toString().includes('4173')){clearTimeout(timer);resolve();}});
    server.on('exit',code=>{clearTimeout(timer);reject(new Error(`Preview exited with ${code}`));});
  });
  browser=await chromium.launch();
  const context=await browser.newContext(); const page=await context.newPage();
  page.on('pageerror',error=>console.error('Browser error:',error.message));
  page.on('console',message=>{if(message.type()==='error')console.error('Browser console:',message.text());});
  await page.goto('http://127.0.0.1:4173');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.getByRole('button',{name:'Explore the demo'}).waitFor();
  const cached=await page.evaluate(async()=>{const cache=await caches.open('dayboard-shell-v1');return (await cache.keys()).map(r=>r.url);});
  assert.ok(cached.some(url=>url.endsWith('/')));
  assert.ok(cached.some(url=>/\/assets\/.*\.js$/.test(url)));
  assert.ok(cached.some(url=>url.endsWith('/icon-512.png')));
  assert.ok(cached.every(url=>new URL(url).origin==='http://127.0.0.1:4173'));
  await context.setOffline(true); await page.reload();
  try { await page.getByRole('button',{name:'Explore the demo'}).waitFor({timeout:10000}); }
  catch(error){console.error('Offline page:',await page.locator('body').innerText());throw error;}
  assert.equal(await page.evaluate(()=>navigator.onLine),false);
  console.log('PASS: production PWA registers, precaches its shell/assets/icons and reloads offline without caching private records.');
} finally { await browser?.close(); server.kill(); }
