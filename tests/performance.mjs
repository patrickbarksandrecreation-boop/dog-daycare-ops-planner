import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
assert.equal(process.env.LIVE_TEST_CONFIRM,'synthetic-pilot');
const testDate=process.env.TEST_PLAN_DATE;
assert.ok(testDate && /^203[0-9]-[0-9]{2}-[0-9]{2}$/.test(testDate),'Choose a fictional test date in the 2030s');
const browser=await chromium.launch();
try {
 const page=await browser.newPage();await page.goto(process.env.TEST_APP_URL || 'http://127.0.0.1:5175');
 await page.getByLabel('Display name',{exact:true}).fill('Performance browser check');
 await page.getByRole('button',{name:'Join the shared pilot',exact:true}).click();
 await page.locator('.connection.online').waitFor({timeout:30000});
 const result=await page.evaluate(async(planDate)=>{
  const {client:db,cloudRepository}=await import('/src/supabase.ts');
  const date=planDate,baseline=[],optimised=[];
  const checked=async(p)=>{const r=await p;if(r.error)throw new Error(r.error.message);return r.data;};
  for(let i=0;i<3;i++){
   const t=performance.now(),{user}=await checked(db.auth.getUser());
   await checked(db.from('staff_profiles').select('id,display_name,role,workspace_id').eq('id',user.id).single());
   await checked(db.rpc('ensure_planning_day',{p_date:date}));
   const s=await checked(db.rpc('planning_snapshot',{p_date:date}));
   const paths=[...new Set(s.dogs.map(d=>d.photo_path).filter(Boolean))];
   await checked(db.storage.from('dog-photos').createSignedUrls(paths,3600));
   baseline.push(Math.round(performance.now()-t));
  }
  const repo=cloudRepository();
  for(let i=0;i<4;i++){const t=performance.now();await Promise.all([repo.profile(),repo.snapshot(date)]);optimised.push(Math.round(performance.now()-t));}
  return {baseline_ms:baseline,cold_optimised_ms:optimised[0],warm_optimised_ms:optimised.slice(1)};
 },testDate);
 console.log(JSON.stringify(result));await mkdir('test-results',{recursive:true});await writeFile('test-results/performance-results.json',JSON.stringify(result,null,2));
} finally {await browser.close();}
