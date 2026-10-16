import { PGlite } from '@electric-sql/pglite';
import { readFileSync,readdirSync } from 'node:fs';
import { beforeAll,beforeEach,afterAll,it,expect } from 'vitest';
let db:PGlite, workspace:string,staff:string,date:string,day:string;
const id=(s:string)=>s.repeat(24);
async function q(sql:string,args:unknown[]=[]):Promise<any[]> {return (await db.query(sql,args)).rows;}
async function role(name='postgres',user='') {await db.exec(`reset role; set role ${name}; select set_config('request.jwt.claim.sub','${user}',false)`);}
async function claim() { await role('authenticated',staff); await q('select public.request_petboost_sync()'); await role('service_role'); return (await q('select public.claim_petboost_sync($1) token',[workspace]))[0].token; }
const row=(pet='a',booking='b',name='Synthetic Dog')=>({petId:id(pet),bookingId:id(booking),name});
async function apply(rows:any[],extra:Record<string,unknown>={},token?:string) {
  token ||= await claim();
  return q('select public.apply_petboost_sync($1,$2,$3::jsonb)',[workspace,token,JSON.stringify({date,complete:true,expectedCount:rows.length,observedCount:rows.length,fetchedAt:new Date().toISOString(),bookings:rows,...extra})]);
}
async function snapshot() {await role('authenticated',staff); return (await q('select public.planning_snapshot($1) s',[date]))[0].s;}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage; create table auth.users(id uuid primary key,is_anonymous boolean);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security; grant select,insert,delete on storage.objects to authenticated;`);
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8').replace('alter publication supabase_realtime add table public.planning_days,public.dogs;',''));
});
it('keeps encrypted sessions service-only and requires a fresh Netlify verification after session seeding',async()=>{
  await expect(q('select public.read_petboost_session($1)',[workspace])).rejects.toThrow('permission denied');
  await expect(q('select * from public.petboost_sessions')).rejects.toThrow('permission denied');
  await role();await q("update public.petboost_sync set worker_mode='netlify' where workspace_id=$1",[workspace]);
  const token=await claim();await expect(apply([row()],{},token)).rejects.toThrow('Verify Petboost session');
  await q('select public.save_petboost_session($1,$2,null)',[workspace,'Synthetic encrypted envelope']);
  expect((await q('select public.read_petboost_session($1) s',[workspace]))[0].s).toBe('Synthetic encrypted envelope');
  const verification=crypto.randomUUID();
  await q('select public.claim_petboost_verification($1,$2)',[workspace,verification]);
  await q('select public.finish_petboost_verification($1,$2,null)',[workspace,verification]);
  await role();await q('update public.petboost_sync set requested_at=null,claimed_request_at=null where workspace_id=$1',[workspace]);
  await apply([row()]);
  await role('service_role');await q('select public.save_petboost_session($1,$2,null)',[workspace,'Synthetic renewed envelope']);
  expect((await q('select public.read_petboost_verification($1) s',[workspace]))[0].s.verified_at).toBeNull();
  await expect(q('select public.save_petboost_session($1,$2,$3)',[workspace,'Synthetic outdated envelope',token])).rejects.toThrow('Expired sync lease');
});
it('fences verification and imports when a session is renewed, and correlates verification outcomes',async()=>{
  await role();await q("update public.petboost_sync set worker_mode='netlify' where workspace_id=$1",[workspace]);
  await role('service_role');
  await q('select public.save_petboost_session($1,$2,null)',[workspace,'Synthetic initial encrypted envelope']);
  const oldRun=crypto.randomUUID(),newRun=crypto.randomUUID();
  expect((await q('select public.claim_petboost_verification($1,$2) token',[workspace,oldRun]))[0].token).toBe(oldRun);
  expect((await q('select public.claim_petboost_verification($1,$2) token',[workspace,newRun]))[0].token).toBeNull();
  await q('select public.save_petboost_session($1,$2,null)',[workspace,'Synthetic renewed encrypted envelope']);
  await expect(q('select public.save_petboost_session($1,$2,$3)',[workspace,'Synthetic stale encrypted envelope',oldRun])).rejects.toThrow('Expired sync lease');
  await q('select public.finish_petboost_verification($1,$2,null)',[workspace,oldRun]);
  expect((await q('select public.read_petboost_verification($1) s',[workspace]))[0].s.verified_at).toBeNull();
  await q('select public.claim_petboost_verification($1,$2)',[workspace,newRun]);
  await q("select public.finish_petboost_verification($1,$2,'login_required')",[workspace,oldRun]);
  await q('select public.finish_petboost_verification($1,$2,null)',[workspace,newRun]);
  const result=(await q('select public.read_petboost_verification($1) s',[workspace]))[0].s;
  expect(result.run_id).toBe(newRun);expect(result.finished_at).toBeTruthy();expect(result.verified_at).toBeTruthy();expect(result.error).toBeNull();
  expect((await q('select public.read_petboost_session($1) s',[workspace]))[0].s).toBe('Synthetic renewed encrypted envelope');
});
beforeEach(async()=>{
  await role(); workspace=crypto.randomUUID();staff=crypto.randomUUID();
  await q('insert into public.workspaces(id,name) values($1,$2)',[workspace,'Synthetic sync test']);
  await q('insert into auth.users values($1,false)',[staff]);
  await q("insert into public.staff_profiles values($1,'Synthetic Staff','staff',$2)",[staff,workspace]);
  await q("insert into public.group_configurations(workspace_id,default_name,display_order) values($1,'Synthetic Group',1)",[workspace]);
  await q('insert into public.petboost_sync(workspace_id,enabled) values($1,true)',[workspace]);
  date=(await q("select (now() at time zone 'Australia/Brisbane')::date::text d"))[0].d;
  await role('authenticated',staff); day=(await q('select public.ensure_planning_day($1) d',[date]))[0].d;
});
afterAll(async()=>{await db?.close();});
it('deduplicates repeats and changed booking IDs without changing group, attendance, notes, name or photo',async()=>{
  await apply([row()]); let s=await snapshot(); const a=s.assignments[0],dog=s.dogs[0];
  await q('select public.move_assignment($1,$2,$3,null,$4)',[day,a.id,s.groups[0].group_id,a.version]);
  await q("select public.set_attendance($1,$2,'present',2)",[day,a.id]);
  await q("select public.set_handling_notes($1,'Staff note',1)",[dog.id]);
  const before=await snapshot();
  await role(); await q('update public.petboost_sync set requested_at=null,claimed_request_at=null where workspace_id=$1',[workspace]);
  await apply([row('a','c','Changed source name')]); const after=await snapshot();
  expect(after.assignments).toEqual(before.assignments); expect(after.dogs).toEqual(before.dogs);
  await role(); expect((await q('select * from public.petboost_bookings where workspace_id=$1 and active',[workspace]))).toHaveLength(1);
});
it('flags cancellations and preserves assigned/arrived dogs; rebooking clears warnings',async()=>{
  await apply([row()]); let s=await snapshot();
  await q('select public.move_assignment($1,$2,$3,null,1)',[day,s.assignments[0].id,s.groups[0].group_id]);
  const before=await snapshot(); await role(); await q('update public.petboost_sync set requested_at=null,claimed_request_at=null where workspace_id=$1',[workspace]);
  await apply([]); expect((await snapshot()).assignments).toEqual(before.assignments);
  await role(); expect((await q('select active from public.petboost_bookings where workspace_id=$1',[workspace]))[0].active).toBe(false);
  await q('update public.petboost_sync set requested_at=null,claimed_request_at=null where workspace_id=$1',[workspace]);
  await apply([row()]); await role(); expect((await q('select active from public.petboost_bookings where workspace_id=$1',[workspace]))[0].active).toBe(true);
});
it('preserves staff manual removal across repeated imports and adds only newly booked dogs',async()=>{
  await apply([row()]); let s=await snapshot(); await q('select public.remove_assignment($1,$2,1)',[day,s.assignments[0].id]);
  await role(); await q('update public.petboost_sync set requested_at=null,claimed_request_at=null where workspace_id=$1',[workspace]);
  await apply([row(),row('c','d','New Synthetic')]); s=await snapshot();
  expect(s.assignments).toHaveLength(1); expect(s.dogs).toHaveLength(2); expect(s.assignments[0].group_id).toBeNull();
});
it('rejects incomplete, stale, wrong-date and duplicate snapshots without creating records',async()=>{
  const token=await claim();
  for(const extra of [{complete:false},{expectedCount:2},{date:'2000-01-01'},{fetchedAt:'2000-01-01T00:00:00Z'},{observedCount:null},{bookings:[row(),row()],expectedCount:2,observedCount:2}]) {
    await expect(apply([row()],extra,token)).rejects.toThrow();
  }
  expect((await snapshot()).assignments).toEqual([]);
});
it('requires explicit ID linking when a matching manual dog exists, with atomic rollback',async()=>{
  await q("select public.save_dog($1,'Synthetic Dog',null,false,null)",[crypto.randomUUID()]);
  await expect(apply([row('c','d','New Synthetic'),row()])).rejects.toThrow('Identity review');
  const s=await snapshot(); expect(s.dogs).toHaveLength(1);expect(s.assignments).toHaveLength(0);
});
it('fences concurrent and late workers and retains last success when login expires',async()=>{
  await apply([row()]); await role(); const old=(await q('select last_success_at from public.petboost_sync where workspace_id=$1',[workspace]))[0].last_success_at;
  await q('update public.petboost_sync set requested_at=null,claimed_request_at=null where workspace_id=$1',[workspace]);
  const token=await claim(); expect(token).toBeTruthy();
  expect((await q('select public.claim_petboost_sync($1) token',[workspace]))[0].token).toBeNull();
  await expect(apply([],{},crypto.randomUUID())).rejects.toThrow('Expired sync lease');
  await q("select public.fail_petboost_sync($1,$2,'login_required')",[workspace,token]);
  await role(); const s=(await q('select * from public.petboost_sync where workspace_id=$1',[workspace]))[0];
  expect(s.last_success_at).toEqual(old); expect(s.last_error_code).toBe('login_required');
  await expect(apply([],{},token)).rejects.toThrow('Expired sync lease');
});
it('denies frontend imports/configuration, exposes only workspace rows and defaults disabled',async()=>{
  await expect(q('select public.claim_petboost_sync($1)',[workspace])).rejects.toThrow('permission denied');
  await expect(q('update public.petboost_sync set enabled=true')).rejects.toThrow('permission denied');
  const foreign=crypto.randomUUID(); await role(); await q("insert into public.workspaces values($1,'Foreign')",[foreign]);
  await q('insert into public.petboost_sync(workspace_id) values($1)',[foreign]);
  await role('authenticated',staff); expect(await q('select * from public.petboost_sync')).toHaveLength(1);
  await role('anon'); await expect(q('select * from public.petboost_sync')).rejects.toThrow('permission denied');
  await role('service_role'); expect((await q('select public.claim_petboost_sync($1) token',[foreign]))[0].token).toBeNull();
});
it('refuses real imports into an openly enrollable synthetic workspace',async()=>{
  await role(); await q('update public.workspaces set anonymous_pilot_enabled=true where id=$1',[workspace]);
  await expect(apply([row()])).rejects.toThrow('Workplace access review');
  expect((await snapshot()).assignments).toHaveLength(0);
});
it('preserves a staff removal that happened before the first import',async()=>{
  const dog=crypto.randomUUID();
  await role(); await q("insert into public.dogs(id,workspace_id,name,source_system,source_pet_id) values($1,$2,'Synthetic Dog','petboost',$3)",[dog,workspace,id('a')]);
  await role('authenticated',staff); await q('select public.add_to_plan($1,$2)',[day,dog]);
  const s=await snapshot(); await q('select public.remove_assignment($1,$2,1)',[day,s.assignments[0].id]);
  await apply([row()]); expect((await snapshot()).assignments).toHaveLength(0);
});
