// Opt-in: creates two synthetic anonymous users and retains their test attendance history.
import assert from 'node:assert/strict';
import { chromium, expect as playwrightExpect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
const expect=playwrightExpect.configure({timeout:30000});
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
  const names=[1,2].map(i=>`Synthetic staff creation ${date} ${i} ${crypto.randomUUID().slice(0,8)}`);
  const created=[];
  for(let i=0;i<2;i++){
    const page=pages[i];
    const profile=await clients[i].from('staff_profiles').select('role').single();
    assert.equal(profile.error,null); assert.equal(profile.data.role,'staff');
    await page.getByRole('button',{name:'New Dog',exact:true}).click();
    // Duplicate-name acknowledgement must work for ordinary staff too.
    await page.getByLabel('Dog’s name').fill(state.dogs[0].name);
    await expect(page.getByRole('button',{name:'Save dog',exact:true})).toBeDisabled();
    await page.getByLabel('This is a different dog with the same name').check();
    await expect(page.getByRole('button',{name:'Save dog',exact:true})).toBeEnabled();
    await page.getByLabel('Dog’s name').fill(names[i]);
    if(i===0) await page.getByLabel('Photo (optional)').setInputFiles('public/icon-192.png');
    await page.getByRole('button',{name:'Save dog',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Dog database');
    await expect(page.locator('.database-row')).toContainText(names[i]);
    assert.equal((await snapshot(clients[i])).assignments.length,0,'Creation must not book or mark arrival');
    await expect(page.getByRole('button',{name:`Edit ${names[i]}`,exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    const peer=pages[1-i];
    await peer.getByRole('button',{name:'Dog database',exact:true}).click();
    await peer.getByLabel('Search dog database').fill(names[i]);
    await expect(peer.locator('.database-row')).toContainText(names[i],{timeout:30000});
    await peer.getByRole('button',{name:'Close dialog',exact:true}).click();
    const saved=(await snapshot(clients[i])).dogs.find(d=>d.name===names[i]);
    assert.ok(saved); created.push(saved);
  }
  for(const page of pages){
    await page.reload(); await page.locator('.connection.online').waitFor({timeout:30000});
    assert.equal(await page.getByLabel('Display name',{exact:true}).count(),0);
    await page.getByLabel('Planning date',{exact:true}).fill(date);
    for(const name of names){
      await page.getByRole('button',{name:'Dog database',exact:true}).click();
      await page.getByLabel('Search dog database').fill(name);
      await expect(page.locator('.database-row')).toContainText(name);
      if(name===names[0]){
        const image=page.locator('.database-row img');
        await expect(image).toBeVisible();
        await expect.poll(()=>image.evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true);
      }
      await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    }
  }
  const dog=created[0],day=state.day.id;
  assert.ok((await b.rpc('save_dog',{p_id:dog.id,p_name:'Denied edit',p_photo:null,p_archived:false})).error);
  assert.ok((await a.rpc('save_dog',{p_id:dog.id,p_name:dog.name,p_photo:dog.photo_path,p_archived:true})).error);
  assert.ok((await b.rpc('clear_plan',{p_day:day,p_revision:state.day.revision})).error);
  assert.ok((await b.rpc('rename_group',{p_day:day,p_group:state.groups[0].group_id,p_name:'Denied',p_default:false})).error);
  const deniedUpload=await b.storage.from('dog-photos').upload(`${state.day.workspace_id}/${dog.id}/denied.png`,await readFile('public/icon-192.png'),{contentType:'image/png'});
  assert.ok(deniedUpload.error,'Staff may not upload to existing dogs');
  const visitor=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  assert.ok((await visitor.storage.from('dog-photos').createSignedUrl(dog.photo_path,60)).error);
  const signed=await b.storage.from('dog-photos').createSignedUrl(dog.photo_path,60);
  assert.equal(signed.error,null);
  assert.equal((await fetch(signed.data.signedUrl)).status,200);
  console.log('PASS: both staff created dogs, duplicate acknowledgement, separate booking, synchronized visibility and refresh, private photo reads, denied existing-profile edits/archive/uploads/rename/clear.');
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
