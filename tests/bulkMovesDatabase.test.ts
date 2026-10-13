import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
let db: PGlite;
const workspace='00000000-0000-4000-8000-000000000001';
const foreignWorkspace='00000000-0000-4000-8000-000000000002';
const staff='10000000-0000-4000-8000-000000000001', second='10000000-0000-4000-8000-000000000002';
const outsider='10000000-0000-4000-8000-000000000003', foreign='10000000-0000-4000-8000-000000000004';
const dogs=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003'];
let date:string, day:string, group:string, otherGroup:string, foreignDay:string, foreignGroup:string;
let counter=0;
async function q(sql:string,args:unknown[]=[]):Promise<any[]> { return (await db.query(sql,args)).rows; }
async function as(id:string,role='authenticated') { await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false)`); }
async function snapshot() { return (await q('select public.planning_snapshot($1) s',[date]))[0].s; }
const selected=(s:any)=>s.assignments.map(({id,version,group_id}:any)=>({id,version,group_id}));
async function move(items:any, destination:string|null=group, target=day) {
  return q('select public.move_assignments($1,$2::jsonb,$3)',[target,JSON.stringify(items),destination]);
}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,is_anonymous boolean);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{"is_anonymous":true}'::jsonb $$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security; grant select,insert,delete on storage.objects to authenticated;
    insert into auth.users values('${staff}',true),('${second}',true),('${outsider}',true),('${foreign}',true);`);
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8').replace('alter publication supabase_realtime add table public.planning_days,public.dogs;',''));
  }
  await db.exec(`insert into public.workspaces(id,name) values('${foreignWorkspace}','Other synthetic workspace');
    insert into public.staff_profiles(id,display_name,role,workspace_id) values
    ('${staff}','Synthetic Staff','staff','${workspace}'),('${second}','Second Staff','staff','${workspace}'),('${foreign}','Foreign Staff','staff','${foreignWorkspace}');
    insert into public.group_configurations(default_name,display_order,workspace_id) values('Foreign group',1,'${foreignWorkspace}');`);
  await as(foreign); foreignDay=(await q("select public.ensure_planning_day('2039-01-01') id"))[0].id;
  foreignGroup=(await q('select group_id from public.daily_group_labels where planning_day_id=$1',[foreignDay]))[0].group_id;
  await as(staff);
  for(const [i,id] of dogs.entries()) await q('select public.save_dog($1,$2,null,false,$3)',[id,`Synthetic bulk ${i}`,'Fictional breed']);
});
beforeEach(async()=>{
  await as(staff); date=`2039-01-${String(++counter).padStart(2,'0')}`;
  day=(await q('select public.ensure_planning_day($1) id',[date]))[0].id;
  for(const dog of dogs) await q('select public.add_to_plan($1,$2)',[day,dog]);
  const s=await snapshot(); group=s.groups[0].group_id; otherGroup=s.groups[1].group_id;
  const first=s.assignments.find((a:any)=>a.dog_id===dogs[0]);
  const secondDog=s.assignments.find((a:any)=>a.dog_id===dogs[1]);
  await q("select public.set_attendance($1,$2,'present',1)",[day,first.id]);
  await q('select public.move_assignment($1,$2,$3,null,2)',[day,first.id,group]);
  await q('select public.move_assignment($1,$2,$3,null,1)',[day,secondDog.id,otherGroup]);
});
afterAll(async()=>{await db?.close();});

it('moves across groups and Unassigned with one revision, attributed history, unique locations and unchanged attendance',async()=>{
  const before=await snapshot(); await as(second); await move(selected(before),group);
  const after=await snapshot();
  expect(after.day.revision).toBe(before.day.revision+1);
  expect(after.assignments).toHaveLength(3);
  for(const a of before.assignments) expect(after.assignments.find((r:any)=>r.id===a.id)).toMatchObject({
    group_id:group,version:a.version+1,attendance_status:a.attendance_status,arrived_at:a.arrived_at,departed_at:a.departed_at,
  });
  expect(after.dogs).toEqual(before.dogs);
  const events=await q("select * from public.movement_events where planning_day_id=$1 and actor_id=$2",[day,second]);
  expect(events).toHaveLength(3); expect(events.every(e=>e.event_type==='moved'&&e.actor_display_name==='Second Staff')).toBe(true);
  await as(staff); expect(await snapshot()).toEqual(after);
  await move(selected(after),null);
  expect((await snapshot()).assignments.every((a:any)=>a.group_id===null)).toBe(true);
});

it('rejects a stale member and mismatched source without moving the other members or writing history/revisions',async()=>{
  let before=await snapshot(); const items=selected(before);
  await as(second); await q('select public.move_assignment($1,$2,null,null,$3)',[day,items[2].id,items[2].version]);
  await as(staff); before=await snapshot();
  const history=await q('select * from public.movement_events where planning_day_id=$1',[day]);
  await expect(move(items)).rejects.toMatchObject({code:'PT409'});
  expect(await snapshot()).toEqual(before);
  expect(await q('select * from public.movement_events where planning_day_id=$1',[day])).toEqual(history);
  const wrong=selected(before); wrong[2].group_id=wrong[2].group_id===group?null:group;
  await expect(move(wrong)).rejects.toMatchObject({code:'PT409'});
  expect(await snapshot()).toEqual(before);
});

it('rejects departed, missing, duplicate, malformed, cross-day selections and foreign destinations atomically',async()=>{
  const s=await snapshot(), items=selected(s);
  const present=s.assignments.find((a:any)=>a.dog_id===dogs[0]);
  expect(present.attendance_status).toBe('present');
  await q("select public.set_attendance($1,$2,'departed',$3)",[day,present.id,present.version]);
  const before=await snapshot();
  for(const invalid of [selected(before),[items[1],{...items[2],id:crypto.randomUUID()}],[items[1],items[1]],[],null,[{id:items[1].id,group_id:null}],[{...items[1],version:null}],[{...items[1],group_id:undefined}]]) {
    await expect(move(invalid)).rejects.toThrow(); expect(await snapshot()).toEqual(before);
  }
  await expect(move([items[1]],foreignGroup)).rejects.toThrow(/Invalid destination/);
  const tomorrow=(await q("select public.ensure_planning_day('2039-02-01') id"))[0].id;
  await expect(move([items[1]],null,tomorrow)).rejects.toMatchObject({code:'PT409'});
  expect(await snapshot()).toEqual(before);
});

it('authorizes staff, isolates workspaces, denies anonymous/nonstaff/revoked sessions and direct writes',async()=>{
  const before=await snapshot(), items=selected(before);
  await expect(move(items,null,foreignDay)).rejects.toThrow(/unavailable/);
  await as(foreign); await expect(move(items)).rejects.toThrow(/unavailable/);
  await as(outsider); await expect(move(items)).rejects.toThrow(/staff/i);
  await as(staff,'anon'); await expect(move(items)).rejects.toThrow(/permission denied/);
  await as(staff); await expect(q('update public.daily_assignments set group_id=null where planning_day_id=$1',[day])).rejects.toThrow(/permission denied/);
  await db.exec(`reset role; delete from public.staff_profiles where id='${second}'`);
  await as(second); await expect(move(items)).rejects.toThrow(/staff/i);
  await as(staff); expect(await snapshot()).toEqual(before);
  await db.exec(`reset role; insert into public.staff_profiles values('${second}','Second Staff','staff','${workspace}')`);
});

it('allows one competing batch and rejects the entire losing batch',async()=>{
  const before=await snapshot(), items=selected(before);
  const results=await Promise.allSettled([move(items,group),move(items,otherGroup)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'PT409'}});
  const after=await snapshot(); expect(after.day.revision).toBe(before.day.revision+1);
  expect(after.assignments.every((a:any)=>a.group_id===group)).toBe(true);
});
