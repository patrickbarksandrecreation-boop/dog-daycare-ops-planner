// Opt-in acceptance: unique fictional dogs, isolated future date, retained history.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
assert.equal(process.env.LIVE_TEST_CONFIRM, 'synthetic-pilot');
const url=process.env.VITE_SUPABASE_URL, key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url && key);
const makeClient=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},
  global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(30000)})}});
const [a,b,outsider,anonymous]=Array.from({length:4},makeClient);
const date='2039-10-13', ids=Array.from({length:3},()=>crypto.randomUUID());
const names=ids.map((id,i)=>`Synthetic bulk ${i+1} ${id.slice(0,8)}`);
const rpc=async(db,name,args)=>{const r=await db.rpc(name,args);assert.equal(r.error,null,r.error?.message);return r.data;};
const snapshot=db=>rpc(db,'planning_snapshot',{p_date:date});
const rows=s=>ids.map(id=>s.assignments.find(a=>a.dog_id===id));
const selection=s=>rows(s).map(({id,version,group_id})=>({id,version,group_id}));
let browser,day,groups;
const args=(selected,group)=>({p_day:day,p_assignments:selected,p_group:group});
const bulk=(db,s,group)=>rpc(db,'move_assignments',args(selection(s),group));
const attendance=s=>rows(s).map(({dog_id,attendance_status,arrived_at,departed_at})=>({dog_id,attendance_status,arrived_at,departed_at}));
try {
  for(const [i,db] of [a,b,outsider].entries()) {
    assert.equal((await db.auth.signInAnonymously()).error,null);
    if(i<2) await rpc(db,'join_synthetic_pilot',{p_display_name:`Synthetic bulk staff ${i+1}`});
  }
  day=await rpc(a,'ensure_planning_day',{p_date:date});
  for(const [i,id] of ids.entries()) {
    await rpc(a,'save_dog',{p_id:id,p_name:names[i],p_photo:null,p_archived:false,p_breed:'Fictional test breed'});
    await rpc(a,'add_to_plan',{p_day:day,p_dog:id});
  }
  let s=await snapshot(a);groups=s.groups.map(g=>g.group_id);
  await rpc(a,'set_attendance',{p_day:day,p_assignment:rows(s)[0].id,p_status:'present',p_version:rows(s)[0].version});
  s=await snapshot(a);
  for(const i of [0,1]) await rpc(a,'move_assignment',{p_day:day,p_assignment:rows(s)[i].id,p_group:groups[i],p_before:null,p_version:rows(s)[i].version});
  s=await snapshot(a);const before=s;
  await bulk(a,s,groups[2]); s=await snapshot(b);
  assert.equal(s.day.revision,before.day.revision+1);
  assert.ok(rows(s).every(a=>a.group_id===groups[2]));
  assert.deepEqual(attendance(s),attendance(before));
  assert.deepEqual(s.dogs.filter(d=>ids.includes(d.id)),before.dogs.filter(d=>ids.includes(d.id)));
  assert.equal((await a.rpc('move_assignments',args(selection(before),null))).error?.code,'PT409');
  assert.deepEqual(await snapshot(a),s);
  for(const invalid of [[],[selection(s)[0],selection(s)[0]],[{...selection(s)[0],group_id:groups[0]}],[{...selection(s)[0],id:crypto.randomUUID()}]]) {
    assert.ok((await a.rpc('move_assignments',args(invalid,null))).error);
    assert.deepEqual(await snapshot(a),s);
  }
  assert.ok((await a.rpc('move_assignments',args(selection(s),crypto.randomUUID()))).error);
  for(const db of [outsider,anonymous]) assert.ok((await db.rpc('move_assignments',args(selection(s),null))).error);
  assert.ok((await a.from('daily_assignments').update({group_id:null}).eq('planning_day_id',day)).error);
  assert.ok((await a.rpc('clear_plan',{p_day:day,p_revision:s.day.revision})).error);
  const competing=await Promise.all([a.rpc('move_assignments',args(selection(s),groups[0])),b.rpc('move_assignments',args(selection(s),groups[1]))]);
  assert.equal(competing.filter(r=>!r.error).length,1);
  assert.equal(competing.find(r=>r.error).error.code,'PT409');
  s=await snapshot(a);assert.equal(new Set(rows(s).map(a=>a.group_id)).size,1);
  assert.deepEqual(attendance(s),attendance(before));
  const audit=await b.from('movement_events').select('assignment_id,event_type,actor_id,assignment_version').eq('planning_day_id',day).in('dog_id',ids);
  assert.equal(audit.error,null);assert.equal(audit.data.filter(e=>e.event_type==='moved').length,8);
  assert.ok(audit.data.every(e=>e.actor_id));
  console.log('PASS: hosted atomic batches, concurrent all-or-none conflicts, validation, permissions, attendance, unique placements and attributed audit.',{date,syntheticDogs:ids});
  if(process.env.BULK_API_ONLY==='1') process.exitCode=0;
  else {
    assert.ok(process.env.TEST_APP_URL);
    // Restore cross-lane locations for UI acceptance, retaining all audit events.
    for(const [i,row] of rows(s).entries()) await rpc(a,'move_assignment',{p_day:day,p_assignment:row.id,p_group:i<2?groups[i]:null,p_before:null,p_version:row.version});
    browser=await chromium.launch();const pages=[];
    for(const [i,db] of [a,b].entries()) {
      const context=await browser.newContext(i?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1920,height:1080}});
      const {data:{session}}=await db.auth.getSession();
      await context.addInitScript(({session,ref})=>localStorage.setItem(`sb-${ref}-auth-token`,JSON.stringify(session)),{session,ref:new URL(url).hostname.split('.')[0]});
      const page=await context.newPage();await page.goto(process.env.TEST_APP_URL);
      await page.locator('.connection.online').waitFor({timeout:30000});
      await page.getByLabel('Planning date').fill(date);
      await expect(page.getByTestId(`card-${names[2]}`)).toBeVisible({timeout:30000});
      pages.push(page);
    }
    const select=(page,i)=>page.getByRole('button',{name:`Select ${names[i]}`,exact:true});
    const destination=page=>page.getByLabel('Move selected dogs to',{exact:true});
    const tab=(page,i)=>page.getByRole('button',{name:`View ${before.groups[i].displayed_name}`,exact:true});
    for(const i of [0,1,2]) await select(pages[0],i).click();
    await expect(pages[0].getByTestId('selection-count')).toContainText('3 selected');
    await destination(pages[0]).selectOption(groups[2]);
    await tab(pages[1],2).tap();
    for(const i of [0,1,2]) await expect(pages[1].getByTestId(`lane-${groups[2]}`).getByTestId(`card-${names[i]}`)).toBeVisible({timeout:15000});
    // Keep selected source/version snapshots through a real Realtime update.
    for(const i of [0,1]) await select(pages[0],i).click();
    s=await snapshot(b);const changed=rows(s)[1];
    await rpc(b,'move_assignment',{p_day:day,p_assignment:changed.id,p_group:null,p_before:null,p_version:changed.version});
    await expect(pages[0].getByTestId('lane-unassigned').getByTestId(`card-${names[1]}`)).toBeVisible({timeout:15000});
    await expect(pages[0].getByTestId('selection-count')).toContainText('2 selected');
    await destination(pages[0]).selectOption(groups[0]);
    await expect(pages[0].getByRole('alert')).toContainText('No selected dogs moved');
    await expect(pages[0].getByTestId(`lane-${groups[2]}`).getByTestId(`card-${names[0]}`)).toBeVisible();
    await expect(pages[0].locator('.dog-card.selected')).toHaveCount(0);
    // Mobile bulk selection spanning its visible group and Unassigned.
    await select(pages[1],0).tap(); await select(pages[1],2).tap();
    await select(pages[1],1).tap();
    await tab(pages[1],0).tap();
    await expect(pages[1].getByTestId('selection-count')).toContainText('3 selected');
    await destination(pages[1]).selectOption(groups[1]);
    for(const i of [0,1,2]) await expect(pages[0].getByTestId(`lane-${groups[1]}`).getByTestId(`card-${names[i]}`)).toBeVisible({timeout:15000});
    // The request commits but its response is lost: reconcile, report uncertainty,
    // clear the selection and never silently send another batch.
    for(const i of [0,1]) await select(pages[0],i).click();
    let requests=0;
    await pages[0].route('**/rest/v1/rpc/move_assignments',async route=>{requests++;await route.fetch();await route.abort('failed');});
    await destination(pages[0]).selectOption(groups[0]);
    await expect(pages[0].getByRole('alert')).toContainText('confirm server state');
    for(const i of [0,1]) await expect(pages[0].getByTestId(`lane-${groups[0]}`).getByTestId(`card-${names[i]}`)).toBeVisible({timeout:15000});
    await expect(pages[0].locator('.dog-card.selected')).toHaveCount(0);assert.equal(requests,1);
    await pages[0].unroute('**/rest/v1/rpc/move_assignments');
    await pages[0].reload();await pages[0].locator('.connection.online').waitFor({timeout:30000});
    await pages[0].getByLabel('Planning date').fill(date);
    for(const i of [0,1]) await expect(pages[0].getByTestId(`lane-${groups[0]}`).getByTestId(`card-${names[i]}`)).toBeVisible({timeout:15000});
    assert.deepEqual(attendance(await snapshot(a)),attendance(before));
    console.log('PASS: deployed desktop/mobile selection, destinations, two staff Realtime convergence, stale UI rejection, ambiguous response reconciliation (one request) and reload persistence.',{origin:process.env.TEST_APP_URL});
  }
} finally {
  await browser?.close();
  // No records or history are deleted. Return only our unique dogs to Unassigned.
  if(day) {const s=await snapshot(a);if(rows(s).every(Boolean)) await bulk(a,s,null);}
  for(const db of [a,b,outsider]) await db.auth.signOut();
}
