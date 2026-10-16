// CI checks the exact packaged Chromium against synthetic HTML. Never logs in.
import {launchServerless} from './netlify-runtime.mjs';
let browser;
try {
  browser=await launchServerless();const page=await browser.newPage();
  await page.setContent('<h1>Synthetic worker runtime</h1>');
  if(await page.locator('h1').innerText()!=='Synthetic worker runtime')throw Error('Worker smoke check failed');
  console.log('Serverless Chromium smoke check passed.');
} finally {await browser?.close();}
