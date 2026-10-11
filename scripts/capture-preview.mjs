import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results/previews',{recursive:true});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  await page.goto('http://127.0.0.1:5173');
  await page.getByLabel('Demo scenario').selectOption('planned');
  await page.getByRole('button',{name:'Explore the demo'}).click();
  await page.getByTestId('card-Alfie').waitFor();
  await page.screenshot({path:'test-results/previews/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/previews/phone.png',fullPage:true});
} finally { await browser.close(); }
