// Opt-in: creates two synthetic anonymous users and retains their test attendance history.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
const env=process.env;
assert.equal(env.LIVE_TEST_CONFIRM,'synthetic-pilot');
const url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
const date=env.TEST_PLAN_DATE; assert.ok(date,'Choose an empty test date');
const app=env.TEST_APP_URL||'http://127.0.0.1:5174';
const browser=await chromium.launch();
const clients=[];
try {
  const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  for(let i=0;i<2;i++){
    const page=pages[i]; await page.goto(app);
    await page.getByLabel('Display name',{exact:true}).fill(`Synthetic live tester ${i+1}`);
    await page.getByRole('button',{name:'Join the shared pilot',exact:true}).click();
    await page.locator('.connection.online').waitFor({timeout:30000});
    await page.getByLabel('Planning date',{exact:true}).fill(date);
    await page.locator('.connection.online').waitFor({timeout:30000});
    const session=await page.evaluate(()=>{
      const k=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));
      return JSON.parse(localStorage.getItem(k));
    });
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(30000)})}});
    const {error}=await db.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
    assert.equal(error,null); clients.push(db);
  }
  const rpc=async(db,name,args)=>{const r=await db.rpc(name,args);if(r.error)throw new Error(r.error.message);return r.data;};
  const snapshot=db=>rpc(db,'planning_snapshot',{p_date:date});
  const [a,b]=clients; let state=await snapshot(a); assert.equal(state.assignments.length,0,'Use an empty test date');
  assert.ok(state.dogs.length>0); const dog=state.dogs[0],day=state.day.id;
  await rpc(a,'add_to_plan',{p_day:day,p_dog:dog.id});
  for(const page of pages) await page.getByTestId(`card-${dog.name}`).waitFor({timeout:15000});
  state=await snapshot(a);const placement=state.assignments[0];
  const results=await Promise.all(clients.map((db,i)=>db.rpc('move_assignment',{p_day:day,p_assignment:placement.id,p_group:state.groups[i].group_id,p_before:null,p_version:placement.version})));
  console.log('Concurrent move responses:',results.map(r=>r.error ? {code:r.error.code,message:r.error.message} : 'saved'));
  assert.equal(results.filter(r=>!r.error).length,1);
  assert.equal(results.filter(r=>r.error?.code==='PT409' && r.status===409).length,1,JSON.stringify(results.map(r=>r.error && {code:r.error.code,message:r.error.message})));
  state=await snapshot(a);let row=state.assignments[0];
  for(const page of pages) await page.getByTestId(`lane-${row.group_id}`).getByTestId(`card-${dog.name}`).waitFor({timeout:15000});
  await pages[0].reload(); await pages[0].locator('.connection.online').waitFor({timeout:30000});
  assert.equal(await pages[0].getByLabel('Display name',{exact:true}).count(),0,'Session persists after reload');
  await pages[0].getByLabel('Planning date',{exact:true}).fill(date);
  await pages[0].getByTestId(`lane-${row.group_id}`).getByTestId(`card-${dog.name}`).waitFor({timeout:15000});
  await rpc(a,'set_attendance',{p_day:day,p_assignment:row.id,p_status:'present',p_version:row.version});
  for(const page of pages)await page.locator(`[data-testid="card-${dog.name}"].present`).waitFor({timeout:15000});
  row=(await snapshot(a)).assignments[0];
  await rpc(b,'move_assignment',{p_day:day,p_assignment:row.id,p_group:null,p_before:null,p_version:row.version});
  assert.equal((await snapshot(a)).assignments[0].attendance_status,'present');
  row=(await snapshot(a)).assignments[0];
  await rpc(a,'set_attendance',{p_day:day,p_assignment:row.id,p_status:'departed',p_version:row.version});
  for(const page of pages)await page.getByTestId(`card-${dog.name}`).waitFor({state:'detached',timeout:15000});
  const history=await b.from('movement_events').select('event_type,to_status').eq('assignment_id',row.id);
  assert.equal(history.error,null);assert.ok(history.data.some(e=>e.to_status==='departed'));
  assert.ok((await b.from('movement_events').delete().eq('assignment_id',row.id)).error);
  assert.ok((await b.from('staff_profiles').update({role:'manager'}).neq('id',crypto.randomUUID())).error);
  await contexts[1].setOffline(true); await pages[1].locator('.connection.offline').waitFor();
  await contexts[1].setOffline(false); await pages[1].locator('.connection.online').waitFor({timeout:30000});
  console.log('PASS: two anonymous browser sessions, display-name enrollment, saved refresh, Realtime, concurrent move conflict, independent attendance, append-only history, denied escalation and offline recovery.');
} catch(error) { console.error(error); throw error; }
finally { await browser.close(); for(const db of clients) await db.auth.signOut(); }
