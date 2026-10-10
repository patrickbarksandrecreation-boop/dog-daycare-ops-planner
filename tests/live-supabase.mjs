/** Opt-in integration check. Only run against a disposable configured Supabase project.
 * Two separate authenticated browser contexts + two independent API/realtime clients.
 * No admin key needed. Test accounts must already exist (A manager, B staff).
 */
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
const env = process.env;
const required = ['TEST_SUPABASE_URL','TEST_SUPABASE_KEY','TEST_MANAGER_EMAIL','TEST_MANAGER_PASSWORD','TEST_STAFF_EMAIL','TEST_STAFF_PASSWORD','TEST_PLAN_DATE','TEST_APP_URL'];
for (const name of required) if (!env[name]) throw new Error(`Missing ${name}. See docs/TESTING.md; use a disposable test project.`);
assert.equal(env.LIVE_TEST_CONFIRM, 'disposable-project', 'Set LIVE_TEST_CONFIRM=disposable-project. This test creates and archives fictional test dogs.');
const clients = Array.from({ length: 3 }, () => createClient(env.TEST_SUPABASE_URL,env.TEST_SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}));
const [manager,staff,anonymous]=clients;
async function rpc(db,name,args) { const result=await db.rpc(name,args); if(result.error) throw new Error(result.error.message); return result.data; }
await manager.auth.signInWithPassword({email:env.TEST_MANAGER_EMAIL,password:env.TEST_MANAGER_PASSWORD}).then(r=>{if(r.error)throw r.error;});
await staff.auth.signInWithPassword({email:env.TEST_STAFF_EMAIL,password:env.TEST_STAFF_PASSWORD}).then(r=>{if(r.error)throw r.error;});
const date=env.TEST_PLAN_DATE;
const day=await rpc(manager,'ensure_planning_day',{p_date:date});
const snapshot=db=>rpc(db,'planning_snapshot',{p_date:date});
assert.equal((await snapshot(manager)).assignments.length,0,'Choose an EMPTY dedicated test date. The test will not clear a populated date.');
let browser, channel;
const dog=crypto.randomUUID();
const dogName=`Test pup ${dog.slice(0,8)}`;
try {
  assert.ok((await anonymous.rpc('planning_snapshot',{p_date:date})).error,'Anonymous snapshot must fail');
  assert.ok((await staff.rpc('save_dog',{p_id:dog,p_name:dogName,p_photo:null,p_archived:false})).error,'Staff dog editing must fail');
  assert.ok((await staff.from('staff_profiles').update({role:'manager'}).neq('id',crypto.randomUUID())).error,'Role escalation must fail');
  await rpc(manager,'save_dog',{p_id:dog,p_name:dogName,p_photo:null,p_archived:false});
  let received=0;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Realtime subscription timed out')),15000);
    channel=staff.channel(`integration-${dog}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'planning_days',filter:`id=eq.${day}`},()=>received++).subscribe(status=>{
      if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}
      else if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(new Error('Realtime channel failed'));}
    });
  });
  browser=await chromium.launch();
  const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  for(let i=0;i<pages.length;i++){
    const page=pages[i]; await page.goto(env.TEST_APP_URL);
    await page.getByLabel('Work email').fill(i===0?env.TEST_MANAGER_EMAIL:env.TEST_STAFF_EMAIL);
    await page.getByLabel('Password',{exact:true}).fill(i===0?env.TEST_MANAGER_PASSWORD:env.TEST_STAFF_PASSWORD);
    await page.getByRole('button',{name:'Sign in to your daycare'}).click();
    await page.locator('.connection.online').waitFor();
    await page.getByLabel('Planning date').fill(date);
    await page.locator('.connection.online').waitFor();
  }
  await pages[0].getByRole('button',{name:'Dog database',exact:true}).click();
  await pages[0].getByRole('textbox',{name:'Search dog database'}).fill(dogName);
  await pages[0].getByRole('button',{name:`Book ${dogName} for day`,exact:true}).click();
  await pages[0].getByRole('button',{name:'Close dialog'}).click();
  await pages[1].getByTestId(`card-${dogName}`).waitFor({timeout:15000});
  const state=await snapshot(staff); const a=state.assignments.find(a=>a.dog_id===dog);
  const results=await Promise.all([manager,staff].map((db,i)=>db.rpc('move_assignment',{p_day:day,p_assignment:a.id,p_group:state.groups[i].group_id,p_before:null,p_version:a.version})));
  assert.equal(results.filter(r=>!r.error).length,1,'Exactly one concurrent move succeeds');
  assert.equal(results.filter(r=>r.error?.code==='40001').length,1,'Stale move explicitly conflicts');
  const confirmed=await snapshot(manager);
  assert.equal(confirmed.assignments.length,1);
  const finalGroup=confirmed.assignments[0].group_id;
  for(const page of pages)await page.getByTestId(`lane-${finalGroup}`).getByTestId(`card-${dogName}`).waitFor({timeout:15000});
  await pages[1].reload(); await pages[1].getByLabel('Planning date').fill(date);
  await pages[1].getByTestId(`lane-${finalGroup}`).getByTestId(`card-${dogName}`).waitFor();
  await contexts[1].setOffline(true);
  await pages[1].locator('.connection.offline').waitFor();
  assert.equal(await pages[1].getByRole('button',{name:`Select ${dogName}`,exact:true}).isDisabled(),true);
  await contexts[1].setOffline(false); await pages[1].locator('.connection.online').waitFor({timeout:20000});
  assert.ok(received>=2,'Realtime emitted committed day changes');
  await pages[0].getByRole('button',{name:`Mark ${dogName} present`,exact:true}).click();
  await pages[1].locator(`[data-testid="card-${dogName}"].present`).waitFor({timeout:15000});
  const arrived=(await snapshot(manager)).assignments[0];
  await rpc(staff,'move_assignment',{p_day:day,p_assignment:arrived.id,p_group:null,p_before:null,p_version:arrived.version});
  for(const page of pages)await page.getByTestId('lane-unassigned').locator(`[data-testid="card-${dogName}"].present`).waitFor({timeout:15000});
  await pages[0].getByRole('button',{name:`Information for ${dogName}`,exact:true}).click();
  await pages[0].getByRole('button',{name:'Mark departed',exact:true}).click();
  for(const page of pages)await page.getByTestId(`card-${dogName}`).waitFor({state:'detached',timeout:15000});
  const departed=(await snapshot(staff)).assignments[0];
  assert.equal(departed.attendance_status,'departed');
  assert.equal(departed.arrived_at,arrived.arrived_at);
  assert.ok(departed.departed_at);
  await rpc(staff,'add_to_plan',{p_day:day,p_dog:dog});
  assert.equal((await snapshot(staff)).assignments.length,1,'Departed booking cannot be duplicated');
  // Real storage upload and private URL checks.
  const { readFile }=await import('node:fs/promises');
  const path=`${dog}/${crypto.randomUUID()}.png`;
  const upload=await manager.storage.from('dog-photos').upload(path,await readFile('public/icon-192.png'),{contentType:'image/png'});
  assert.equal(upload.error,null);
  const signed=await staff.storage.from('dog-photos').createSignedUrl(path,60);
  assert.ok(signed.data?.signedUrl);
  assert.ok((await anonymous.storage.from('dog-photos').createSignedUrl(path,60)).error);
  await manager.storage.from('dog-photos').remove([path]);
  console.log('PASS: two browsers, saved refresh, Realtime convergence, concurrent moves, independent attendance, departure history, offline recovery, access restrictions and private storage.');
} finally {
  await browser?.close();
  if(channel)await staff.removeChannel(channel);
  // Expected-only cleanup. Received/departed test records deliberately remain historical.
  const state=await snapshot(manager);
  const a=state.assignments.find(a=>a.dog_id===dog);
  if(a?.attendance_status==='expected')await rpc(manager,'remove_assignment',{p_day:day,p_assignment:a.id,p_version:a.version});
  await rpc(manager,'save_dog',{p_id:dog,p_name:dogName,p_photo:null,p_archived:true});
  for(const db of clients)await db.auth.signOut();
}
