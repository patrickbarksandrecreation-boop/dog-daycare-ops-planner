import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
let db: PGlite;
const w1='00000000-0000-4000-8000-000000000001', w2='00000000-0000-4000-8000-000000000002';
const u1='10000000-0000-4000-8000-000000000001', u2='10000000-0000-4000-8000-000000000002', stranger='10000000-0000-4000-8000-000000000003';
const dog='20000000-0000-4000-8000-000000000001', otherDog='20000000-0000-4000-8000-000000000002';
let day:string, otherDay:string, group:string, otherGroup:string, assignment:string;
async function q(sql:string,args:unknown[]=[]):Promise<any[]> { return (await db.query(sql,args)).rows; }
async function user(id:string,role='authenticated') { await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false)`); }
async function state() { return (await q("select public.planning_snapshot('2026-10-10') s"))[0].s; }
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth,storage to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security; grant select,insert,delete on storage.objects to authenticated;
    insert into auth.users values('${u1}'),('${u2}'),('${stranger}');`);
  await db.exec(readFileSync('supabase/migrations/001_planner.sql','utf8').replace('alter publication supabase_realtime add table public.planning_days,public.dogs;',''));
  await db.exec(readFileSync('supabase/migrations/002_attendance.sql','utf8'));
  // Existing membership, dog and placement must survive the additive upgrade.
  await db.exec(`insert into public.staff_profiles values('${u1}','Pilot One','manager');`);
  await user(u1);
  day=(await q("select public.ensure_planning_day('2026-10-10') id"))[0].id;
  await q('select public.save_dog($1,$2,null,false)',[dog,'Synthetic Luna']);
  await q('select public.add_to_plan($1,$2)',[day,dog]);
  assignment=(await state()).assignments[0].id;
  await db.exec('reset role');
  await db.exec(readFileSync('supabase/migrations/003_workspace_history.sql','utf8'));
  await db.exec(`insert into public.workspaces values('${w2}','Second synthetic pilot');
    insert into public.staff_profiles values('${u2}','Pilot Two','manager','${w2}');
    insert into public.group_configurations(default_name,display_order,workspace_id) values('Other area',1,'${w2}');`);
  await user(u2);
  otherDay=(await q("select public.ensure_planning_day('2026-10-10') id"))[0].id;
  await q('select public.save_dog($1,$2,null,false)',[otherDog,'Other synthetic Luna']);
  otherGroup=(await state()).groups[0].group_id;
  await user(u1); group=(await state()).groups[0].group_id;
});
afterAll(async()=>{await db?.close();});
describe.sequential('M3 workspace isolation and transactional history',()=>{
  it('denies anonymous execution of every planner RPC and staff access to internal helpers',async()=>{
    const names=['is_staff','is_manager','current_workspace','require_staff','lock_plan','touch_plan','ensure_planning_day','planning_snapshot','add_to_plan','move_assignment','remove_assignment','rename_group','clear_plan','save_dog','set_attendance','record_movement','reject_event_mutation'];
    const privileges=await q("select proname,has_function_privilege('anon',p.oid,'EXECUTE') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=any($1)",[names]);
    expect(privileges).toHaveLength(names.length); expect(privileges.every(p=>!p.allowed)).toBe(true);
    for(const name of ['require_staff','lock_plan','touch_plan','record_movement','reject_event_mutation']) {
      expect((await q("select has_function_privilege('authenticated',p.oid,'EXECUTE') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=$1",[name]))[0].allowed).toBe(false);
    }
  });
  it('preserves existing data and isolates same-date boards and master records',async()=>{
    const s=await state(); expect(s.day.id).toBe(day); expect(day).not.toBe(otherDay);
    expect(s.day.workspace_id).toBe(w1); expect(s.assignments[0].id).toBe(assignment);
    expect(s.dogs.map((d:any)=>d.id)).toEqual([dog]);
    for(const table of ['dogs','planning_days','daily_assignments','daily_group_labels','group_configurations','workspaces']) {
      expect((await q(`select * from public.${table}`)).every(r=>(r.workspace_id??r.id)===w1)).toBe(true);
    }
  });
  it('rejects foreign workspace RPC targets without partial writes',async()=>{
    const revision=(await state()).day.revision;
    await expect(q('select public.add_to_plan($1,$2)',[day,otherDog])).rejects.toThrow(/unavailable/);
    await expect(q('select public.add_to_plan($1,$2)',[otherDay,dog])).rejects.toThrow(/unavailable/);
    await expect(q('select public.move_assignment($1,$2,$3,null,1)',[day,assignment,otherGroup])).rejects.toThrow(/Invalid destination/);
    await expect(q('select public.save_dog($1,$2,null,false)',[otherDog,'Intrusion'])).rejects.toThrow(/unavailable/);
    expect((await state()).day.revision).toBe(revision);
    expect(await q('select * from public.movement_events')).toHaveLength(0);
  });
  it('commits one winning move and one event for competing stale versions',async()=>{
    const results=await Promise.allSettled([
      q('select public.move_assignment($1,$2,$3,null,1)',[day,assignment,group]),
      q('select public.move_assignment($1,$2,null,null,1)',[day,assignment]),
    ]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const events=await q('select * from public.movement_events'); expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({event_type:'moved',actor_id:u1,actor_display_name:'Pilot One',from_group_id:null,to_group_id:group,assignment_version:2});
    expect((await state()).assignments).toHaveLength(1);
  });
  it('rolls back both placement and event when the enclosing transaction fails',async()=>{
    await db.exec('begin');
    await q('select public.move_assignment($1,$2,null,null,2)',[day,assignment]);
    await expect(q('select 1/0')).rejects.toThrow(); await db.exec('rollback');
    expect((await state()).assignments[0].group_id).toBe(group);
    expect(await q('select * from public.movement_events')).toHaveLength(1);
  });
  it('preserves attendance through movement and audits departure',async()=>{
    await q("select public.set_attendance($1,$2,'present',2)",[day,assignment]);
    await q('select public.move_assignment($1,$2,null,null,3)',[day,assignment]);
    expect((await state()).assignments[0].attendance_status).toBe('present');
    await q("select public.set_attendance($1,$2,'departed',4)",[day,assignment]);
    await expect(q('select public.move_assignment($1,$2,$3,null,5)',[day,assignment,group])).rejects.toThrow(/Departed/);
    expect((await q('select * from public.movement_events order by id')).map(e=>e.event_type)).toEqual(['moved','attendance','moved','attendance']);
  });
  it('denies event forgery, edits, deletion, role escalation and membership changes',async()=>{
    for(const sql of ["update public.movement_events set actor_display_name='Fake'",'delete from public.movement_events','truncate public.movement_events',"insert into public.movement_events(event_type) values('moved')",`update public.staff_profiles set workspace_id='${w2}'`]) {
      await expect(q(sql)).rejects.toThrow(/permission denied/);
    }
    await db.exec('reset role');
    await expect(q('delete from public.movement_events')).rejects.toThrow(/append-only/);
    await user(u1);
  });
  it('enforces tenant composite constraints and daily uniqueness even for privileged writes',async()=>{
    await db.exec('reset role');
    await expect(q('insert into public.daily_assignments(workspace_id,planning_day_id,dog_id) values($1,$2,$3)',[w1,day,otherDog])).rejects.toThrow(/foreign key/);
    await expect(q('insert into public.daily_assignments(workspace_id,planning_day_id,dog_id) values($1,$2,$3)',[w1,day,dog])).rejects.toThrow(/unique/);
    await user(u1);
  });
  it('scopes private storage uploads and reads',async()=>{
    await q("insert into storage.objects(bucket_id,name) values('dog-photos',$1)",[`${w1}/${dog}/photo.png`]);
    await expect(q("insert into storage.objects(bucket_id,name) values('dog-photos',$1)",[`${w2}/${dog}/photo.png`])).rejects.toThrow(/row-level security/);
    await user(u2); expect(await q('select * from storage.objects')).toHaveLength(0);
    expect(await q('select * from public.movement_events')).toHaveLength(0);
    await user(u1);
  });
  it('denies unregistered authenticated sessions and anonymous visitors',async()=>{
    await user(stranger);
    expect(await q('select * from public.dogs')).toHaveLength(0);
    expect(await q('select * from public.movement_events')).toHaveLength(0);
    await expect(state()).rejects.toThrow(/staff/);
    await user(stranger,'anon'); await expect(state()).rejects.toThrow(/permission denied/);
    await user(u1);
  });
  it('preserves staff restrictions and retains history after removing Expected bookings',async()=>{
    await db.exec('reset role');
    await db.exec(`insert into public.staff_profiles values('${stranger}','Synthetic Staff','staff','${w1}');`);
    const extra='20000000-0000-4000-8000-000000000003';
    await user(u1); await q('select public.save_dog($1,$2,null,false)',[extra,'Synthetic Archie']);
    await user(stranger);
    await expect(q('select public.save_dog($1,$2,null,false)',[extra,'Denied'])).rejects.toThrow(/manager/);
    await expect(q("insert into storage.objects(bucket_id,name) values('dog-photos',$1)",[`${w1}/${extra}/image.png`])).rejects.toThrow(/row-level security/);
    await expect(q('select public.clear_plan($1,0)',[day])).rejects.toThrow(/manager/);
    await q('select public.add_to_plan($1,$2)',[day,extra]);
    const a=(await state()).assignments.find((a:any)=>a.dog_id===extra);
    await q('select public.remove_assignment($1,$2,1)',[day,a.id]);
    expect((await q('select * from public.movement_events where assignment_id=$1 order by id',[a.id])).map(e=>e.event_type)).toEqual(['booked','removed']);
    await user(u1);
  });
  it('seeds fictional master data into the explicit original workspace',async()=>{
    await db.exec('reset role');
    await db.exec(readFileSync('supabase/demo_seed.sql','utf8'));
    await user(u2); expect((await state()).dogs).toHaveLength(1);
    await user(u1); expect((await state()).dogs.length).toBeGreaterThanOrEqual(20);
  });
  it('upgrades runs and markers with staff editing, stale protection and tenant isolation',async()=>{
    await db.exec('reset role');
    await db.exec(readFileSync('supabase/migrations/004_runs_markers.sql','utf8'));
    await user(stranger); // authorised ordinary staff in workspace one
    expect((await state()).groups[0].run).toBeNull();
    await q('select public.set_dog_markers($1,true,true,1)',[dog]);
    await q("select public.set_group_run($1,$2,'Water park',1)",[day,group]);
    const s=await state(); expect(s.dogs.find((d:any)=>d.id===dog)).toMatchObject({groomed:true,no_waterpark:true,marker_version:2});
    expect(s.groups[0]).toMatchObject({run:'Water park',run_version:2});
    await expect(q('select public.set_dog_markers($1,false,false,1)',[dog])).rejects.toThrow(/changed/);
    await expect(q("select public.set_group_run($1,$2,'Farm',1)",[day,group])).rejects.toThrow(/changed/);
    await expect(q("select public.set_group_run($1,$2,'Unknown',2)",[day,group])).rejects.toThrow(/check constraint/);
    await expect(q('select public.set_dog_markers($1,true,true,1)',[otherDog])).rejects.toThrow(/unavailable/);
    await expect(q("select public.set_group_run($1,$2,'Farm',1)",[otherDay,otherGroup])).rejects.toThrow(/unavailable/);
    await expect(q('update public.dogs set groomed=false')).rejects.toThrow(/permission denied/);
    await user(u1);
    await q('select public.save_dog($1,$2,null,false)',[dog,'Synthetic renamed']);
    expect((await state()).dogs.find((d:any)=>d.id===dog).groomed).toBe(true);
    const tomorrow=(await q("select public.ensure_planning_day('2026-10-11') id"))[0].id;
    expect((await q('select * from public.daily_group_labels where planning_day_id=$1',[tomorrow]))[0].run).toBeNull();
    await q('select public.set_group_run($1,$2,null,2)',[day,group]);
    await q('select public.set_dog_markers($1,false,false,2)',[dog]);
    expect((await state()).groups[0].run).toBeNull();
    await user(u1,'anon');
    await expect(q('select public.set_dog_markers($1,true,true,3)',[dog])).rejects.toThrow(/permission denied/);
    await user(u1);
  });
  it('returns explicit conflicts after upgrading without weakening permissions',async()=>{
    await db.exec('reset role');
    await db.exec(readFileSync('supabase/migrations/20261011034943_explicit_conflicts.sql','utf8'));
    await user(u1);
    const calls=[
      q('select public.move_assignment($1,$2,null,null,-1)',[day,assignment]),
      q("select public.set_attendance($1,$2,'present',-1)",[day,assignment]),
      q('select public.remove_assignment($1,$2,-1)',[day,assignment]),
      q('select public.clear_plan($1,-1)',[day]),
      q('select public.set_dog_markers($1,true,true,-1)',[dog]),
      q("select public.set_group_run($1,$2,'Farm',-1)",[day,group]),
    ];
    for(const result of await Promise.allSettled(calls)){
      expect(result.status).toBe('rejected');
      if(result.status==='rejected') expect(result.reason.code).toBe('PT409');
    }
    await user(u1,'anon');
    await expect(q('select public.move_assignment($1,$2,null,null,-1)',[day,assignment])).rejects.toThrow(/permission denied/);
    await user(u2);
    await expect(q('select public.move_assignment($1,$2,null,null,-1)',[day,assignment])).rejects.toThrow(/unavailable/);
    await user(u1);
  });
  it('enrols anonymous display names only into the enabled synthetic workspace as staff',async()=>{
    await db.exec('reset role');
    await db.exec('alter table auth.users add column is_anonymous boolean not null default false');
    await db.exec(readFileSync('supabase/migrations/20261010083809_anonymous_pilot.sql','utf8'));
    const pilot='10000000-0000-4000-8000-000000000004';
    await db.exec(`insert into auth.users(id,is_anonymous) values('${pilot}',true)`);
    await user(pilot,'anon'); await expect(q("select public.join_synthetic_pilot('Pilot')")).rejects.toThrow(/permission denied/);
    await user(u1); await expect(q("select public.join_synthetic_pilot('Pilot')")).rejects.toThrow(/anonymous/);
    await user(pilot); await expect(q("select public.join_synthetic_pilot(' ')")).rejects.toThrow(/display name/);
    await q("select public.join_synthetic_pilot(' Synthetic Tester ')");
    expect((await q('select * from public.staff_profiles'))[0]).toMatchObject({display_name:'Synthetic Tester',role:'staff',workspace_id:w1});
    await q("select public.join_synthetic_pilot('Try manager')");
    expect((await q('select * from public.staff_profiles'))[0].display_name).toBe('Synthetic Tester');
    await expect(q('select * from public.pilot_enrollments')).rejects.toThrow(/permission denied/);
    await db.exec(`reset role; delete from public.staff_profiles where id='${pilot}'`);
    await user(pilot); await expect(q("select public.join_synthetic_pilot('Return')")).rejects.toThrow(/removed/);
    await db.exec(`reset role; update public.workspaces set anonymous_pilot_enabled=false where id='${w1}'; insert into auth.users(id,is_anonymous) values('10000000-0000-4000-8000-000000000005',true)`);
    await user('10000000-0000-4000-8000-000000000005'); await expect(q("select public.join_synthetic_pilot('Closed')")).rejects.toThrow(/closed/);
    await user(u1);
  });

  it('allows two staff members to create dogs and photos while preserving update and tenant restrictions',async()=>{
    await db.exec('reset role');
    await db.exec(readFileSync('supabase/migrations/20261011050413_staff_dog_creation.sql','utf8'));
    const second='10000000-0000-4000-8000-000000000006';
    const firstDog='20000000-0000-4000-8000-000000000006', secondDog='20000000-0000-4000-8000-000000000007';
    await db.exec(`insert into auth.users(id) values('${second}'); insert into public.staff_profiles values('${second}','Second staff','staff','${w1}');`);
    await user(stranger);
    const photo=`${w1}/${firstDog}/new.png`;
    await q("insert into storage.objects(bucket_id,name) values('dog-photos',$1)",[photo]);
    await q('select public.save_dog($1,$2,$3,false)',[firstDog,'Staff-created Luna',photo]);
    await expect(q('select public.save_dog($1,$2,null,true)',['20000000-0000-4000-8000-000000000008','Archived create'])).rejects.toThrow(/manager/);
    await expect(q('select public.save_dog($1,$2,null,false)',[otherDog,'Foreign edit'])).rejects.toThrow(/unavailable/);
    await expect(q('select public.save_dog($1,$2,$3,false)',['20000000-0000-4000-8000-000000000008','Bad photo',`${w2}/${firstDog}/new.png`])).rejects.toThrow(/Invalid photo/);
    await user(second);
    await q('select public.save_dog($1,$2,null,false)',[secondDog,'Staff-created Luna']);
    expect((await state()).dogs.filter((d:any)=>[firstDog,secondDog].includes(d.id))).toHaveLength(2);
    expect((await state()).assignments.some((a:any)=>[firstDog,secondDog].includes(a.dog_id))).toBe(false);
    await expect(q('select public.save_dog($1,$2,null,false)',[firstDog,'Overwrite'])).rejects.toThrow(/manager/);
    await expect(q('select public.save_dog($1,$2,null,true)',[secondDog,'Archive'])).rejects.toThrow(/manager/);
    await expect(q("insert into storage.objects(bucket_id,name) values('dog-photos',$1)",[`${w1}/${firstDog}/replace.png`])).rejects.toThrow(/row-level security/);
    await expect(q("insert into storage.objects(bucket_id,name) values('dog-photos',$1)",[`${w2}/20000000-0000-4000-8000-000000000009/new.png`])).rejects.toThrow(/row-level security/);
    await q('delete from storage.objects where name=$1',[photo]);
    expect(await q('select * from storage.objects where name=$1',[photo])).toHaveLength(1);
    await expect(q('select public.rename_group($1,$2,$3,false)',[day,group,'Denied'])).rejects.toThrow(/manager/);
    await expect(q('select public.clear_plan($1,0)',[day])).rejects.toThrow(/manager/);
    const collision='20000000-0000-4000-8000-000000000010';
    const results=await Promise.allSettled([q('select public.save_dog($1,$2,null,false)',[collision,'First']),q('select public.save_dog($1,$2,null,false)',[collision,'Second'])]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((await q('select name from public.dogs where id=$1',[collision]))[0].name).toBe('First');
    await user(stranger);
    expect((await state()).dogs.find((d:any)=>d.id===secondDog).name).toBe('Staff-created Luna');
    await user(u2); expect(await q('select * from public.dogs where id=$1',[firstDog])).toHaveLength(0);
    await db.exec(`reset role; delete from public.staff_profiles where id='${second}'`);
    await user(second); await expect(q('select public.save_dog($1,$2,null,false)',['20000000-0000-4000-8000-000000000011','Revoked'])).rejects.toThrow(/staff/);
    await expect(q("insert into storage.objects(bucket_id,name) values('dog-photos',$1)",[`${w1}/20000000-0000-4000-8000-000000000011/new.png`])).rejects.toThrow(/row-level security/);
    await user(u1);
    await q('select public.save_dog($1,$2,$3,true)',[firstDog,'Manager edited',photo]);
    expect((await q('select * from public.dogs where id=$1',[firstDog]))[0]).toMatchObject({name:'Manager edited',is_archived:true});
    await db.exec('reset role');
    expect((await q("select public from storage.buckets where id='dog-photos'"))[0].public).toBe(false);
    await user(u1);
  });
});
