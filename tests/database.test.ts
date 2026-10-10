import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
let db: PGlite;
const manager='10000000-0000-4000-8000-000000000001', staff='10000000-0000-4000-8000-000000000002', outsider='10000000-0000-4000-8000-000000000003';
const dog1='20000000-0000-4000-8000-000000000001', dog2='20000000-0000-4000-8000-000000000002';
let day: string, group1: string, group2: string;
async function identity(id: string, role='authenticated') { await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`); }
async function query<T = any>(sql: string, args: unknown[] = []): Promise<T[]> { return (await db.query<T>(sql,args)).rows; }
async function snapshot(date='2026-10-08') { return (await query('select public.planning_snapshot($1) as value',[date]))[0].value; }
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth,storage to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security; grant select,insert,delete on storage.objects to authenticated;
    insert into auth.users values('${manager}'),('${staff}'),('${outsider}');`);
  // PGlite has no replication process; all application SQL, functions and RLS execute unchanged.
  const migration = readFileSync('supabase/migrations/001_planner.sql','utf8').replace('alter publication supabase_realtime add table public.planning_days,public.dogs;', '');
  await db.exec(migration);
  await db.exec(readFileSync('supabase/migrations/002_attendance.sql','utf8'));
  await db.exec(`insert into public.staff_profiles values('${manager}','Manager','manager'),('${staff}','Staff','staff');`);
  await identity(manager);
  day=(await query('select public.ensure_planning_day($1) as id',['2026-10-08']))[0].id;
  const state=await snapshot(); group1=state.groups[0].group_id; group2=state.groups[1].group_id;
});
afterAll(async () => { await db?.close(); });
describe.sequential('actual PostgreSQL schema and security', () => {
  it('allows manager creation, duplicate names, rename and photo references', async () => {
    await query('select public.save_dog($1,$2,$3,false)',[dog1,'Luna',null]);
    await query('select public.save_dog($1,$2,$3,false)',[dog2,'Luna',null]);
    await query('select public.save_dog($1,$2,$3,false)',[dog1,'Luna Rose',`${dog1}/photo.png`]);
    expect((await snapshot()).dogs.map((d:any)=>d.name)).toEqual(['Luna','Luna Rose']);
    await expect(query('select public.save_dog($1,$2,$3,false)',[dog1,'Luna','wrong/file.png'])).rejects.toThrow('Invalid photo');
  });
  it('makes repeated adds idempotent and increments day revisions only on changes', async () => {
    await identity(staff);
    await query('select public.add_to_plan($1,$2)',[day,dog1]);
    await query('select public.add_to_plan($1,$2)',[day,dog1]);
    await query('select public.add_to_plan($1,$2)',[day,dog2]);
    const state=await snapshot(); expect(state.assignments).toHaveLength(2); expect(state.day.revision).toBe(2);
  });
  it('moves atomically, rejects the losing stale edit, and preserves unrelated dogs', async () => {
    const initial=await snapshot(); const a=initial.assignments.find((a:any)=>a.dog_id===dog1);
    await query('select public.move_assignment($1,$2,$3,null,$4)',[day,a.id,group1,a.version]);
    await expect(query('select public.move_assignment($1,$2,$3,null,$4)',[day,a.id,group2,a.version])).rejects.toThrow('changed by another');
    const state=await snapshot(); expect(state.assignments).toHaveLength(2);
    expect(state.assignments.find((a:any)=>a.dog_id===dog1).group_id).toBe(group1);
    expect(state.assignments.find((a:any)=>a.dog_id===dog2).group_id).toBeNull();
  });
  it('reorders using a server-side anchor and permits returning to unassigned', async () => {
    let state=await snapshot(); let a=state.assignments.find((a:any)=>a.dog_id===dog2); const first=state.assignments.find((a:any)=>a.dog_id===dog1);
    await query('select public.move_assignment($1,$2,$3,$4,$5)',[day,a.id,group1,first.id,a.version]);
    state=await snapshot(); expect(state.assignments.filter((a:any)=>a.group_id===group1).map((a:any)=>a.dog_id)).toEqual([dog2,dog1]);
    a=state.assignments.find((a:any)=>a.dog_id===dog2);
    await query('select public.move_assignment($1,$2,null,null,$3)',[day,a.id,a.version]);
    expect((await snapshot()).assignments.find((a:any)=>a.dog_id===dog2).group_id).toBeNull();
  });
  it('denies direct table writes, role escalation and staff administrative actions', async () => {
    await expect(query("update public.staff_profiles set role='manager' where id=$1",[staff])).rejects.toThrow(/permission denied/);
    await expect(query('delete from public.daily_assignments')).rejects.toThrow(/permission denied/);
    await expect(query('select public.save_dog($1,$2,null,false)',[dog1,'Bad edit'])).rejects.toThrow(/manager/);
    await expect(query('select public.rename_group($1,$2,$3,false)',[day,group1,'Bad group'])).rejects.toThrow(/manager/);
    await expect(query('select public.clear_plan($1,0)',[day])).rejects.toThrow(/manager/);
    await expect(query('select public.touch_plan($1)',[day])).rejects.toThrow(/permission denied/);
  });
  it('enforces staff photo reads and manager uploads through storage policies', async () => {
    await expect(query("insert into storage.objects(bucket_id,name) values('dog-photos','test.png')")).rejects.toThrow(/row-level security/);
    await identity(manager);
    await query("insert into storage.objects(bucket_id,name) values('dog-photos','test.png')");
    await identity(staff); expect(await query('select * from storage.objects')).toHaveLength(1);
    await identity(outsider); expect(await query('select * from storage.objects')).toHaveLength(0);
  });
  it('denies anonymous and unlisted authenticated users', async () => {
    await identity(outsider); expect(await query('select * from public.dogs')).toHaveLength(0);
    await expect(snapshot()).rejects.toThrow(/staff/);
    await identity(outsider,'anon'); await expect(snapshot()).rejects.toThrow(/permission denied/);
    await identity(manager);
  });
  it('snapshots group names on new days and does not copy allocations', async () => {
    await query('select public.ensure_planning_day($1)',['2026-10-09']);
    await query('select public.rename_group($1,$2,$3,true)',[day,group1,'Gentle souls']);
    await query('select public.ensure_planning_day($1)',['2026-10-10']);
    expect((await snapshot()).groups[0].displayed_name).toBe('Gentle souls');
    expect((await snapshot('2026-10-09')).groups[0].displayed_name).toBe('Group 1');
    expect((await snapshot('2026-10-10')).groups[0].displayed_name).toBe('Gentle souls');
    expect((await snapshot('2026-10-10')).assignments).toEqual([]);
  });
  it('archives dogs while retaining existing daily records', async () => {
    await query('select public.save_dog($1,$2,null,true)',[dog1,'Luna Rose']);
    expect((await snapshot()).dogs.find((d:any)=>d.id===dog1).is_archived).toBe(true);
    expect((await snapshot('2026-10-10')).dogs.find((d:any)=>d.id===dog1)).toBeUndefined();
    await expect(query('select public.add_to_plan($1,$2)',[day,dog1])).rejects.toThrow(/archived/);
  });
  it('rejects cross-day and invalid destinations without partial changes', async () => {
    const state=await snapshot(); const a=state.assignments[0]; const other=(await snapshot('2026-10-09')).day.id;
    await expect(query('select public.move_assignment($1,$2,$3,null,$4)',[other,a.id,group2,a.version])).rejects.toThrow(/changed/);
    await expect(query('select public.move_assignment($1,$2,$3,null,$4)',[day,a.id,dog1,a.version])).rejects.toThrow(/Invalid destination/);
    expect((await snapshot()).day.revision).toBe(state.day.revision);
  });
  it('rejects stale removals and clears, then clears only the selected date', async () => {
    const state=await snapshot(), a=state.assignments[0];
    await expect(query('select public.remove_assignment($1,$2,999)',[day,a.id])).rejects.toThrow(/changed/);
    await query('select public.remove_assignment($1,$2,$3)',[day,a.id,a.version]);
    await expect(query('select public.clear_plan($1,$2)',[day,state.day.revision])).rejects.toThrow(/changed/);
    const latest=await snapshot(); await query('select public.clear_plan($1,$2)',[day,latest.day.revision]);
    expect((await snapshot()).assignments).toHaveLength(0);
    expect((await snapshot('2026-10-10')).groups[0].displayed_name).toBe('Gentle souls');
  });
  it('keeps attendance independent of assignment and rejects stale arrival/move races', async () => {
    await identity(staff);
    await query('select public.add_to_plan($1,$2)',[day,dog2]);
    let a=(await snapshot()).assignments[0];
    expect(a.attendance_status).toBe('expected');
    await query('select public.move_assignment($1,$2,$3,null,$4)',[day,a.id,group1,a.version]);
    a=(await snapshot()).assignments[0];
    expect(a.attendance_status).toBe('expected');
    const oldVersion=a.version;
    await query('select public.set_attendance($1,$2,$3,$4)',[day,a.id,'present',a.version]);
    await expect(query('select public.move_assignment($1,$2,$3,null,$4)',[day,a.id,group2,oldVersion])).rejects.toThrow(/changed/);
    a=(await snapshot()).assignments[0]; const arrival=a.arrived_at;
    await query('select public.move_assignment($1,$2,$3,null,$4)',[day,a.id,group2,a.version]);
    a=(await snapshot()).assignments[0];
    expect(a.attendance_status).toBe('present'); expect(a.arrived_at).toBe(arrival); expect(a.group_id).toBe(group2);
    await query('select public.move_assignment($1,$2,null,null,$3)',[day,a.id,a.version]);
    a=(await snapshot()).assignments[0]; expect(a.attendance_status).toBe('present');
  });
  it('retains departed records and prevents duplicate booking, removal and movement', async () => {
    let a=(await snapshot()).assignments[0];
    await query('select public.set_attendance($1,$2,$3,$4)',[day,a.id,'departed',a.version]);
    a=(await snapshot()).assignments[0]; expect(a.departed_at).not.toBeNull();
    await query('select public.add_to_plan($1,$2)',[day,dog2]);
    expect((await snapshot()).assignments).toHaveLength(1);
    await expect(query('select public.remove_assignment($1,$2,$3)',[day,a.id,a.version])).rejects.toThrow(/cannot be removed/);
    await expect(query('select public.move_assignment($1,$2,$3,null,$4)',[day,a.id,group1,a.version])).rejects.toThrow(/Departed/);
    await identity(manager);
    await query('select public.clear_plan($1,$2)',[day,(await snapshot()).day.revision]);
    expect((await snapshot()).assignments[0].attendance_status).toBe('departed');
    await query('select public.set_attendance($1,$2,$3,$4)',[day,a.id,'present',a.version]);
    a=(await snapshot()).assignments[0]; expect(a.departed_at).toBeNull(); expect(a.arrived_at).not.toBeNull();
  });
  it('protects attendance from outsiders, invalid transitions and direct writes', async () => {
    const a=(await snapshot()).assignments[0];
    await expect(query('select public.set_attendance($1,$2,$3,$4)',[day,a.id,'expected',a.version])).rejects.toThrow(/Invalid attendance/);
    await expect(query('select public.set_attendance($1,$2,$3,$4)',[day,a.id,null,a.version])).rejects.toThrow(/Invalid attendance/);
    await expect(query("update public.daily_assignments set attendance_status='departed'")).rejects.toThrow(/permission denied/);
    await identity(outsider);
    await expect(query('select public.set_attendance($1,$2,$3,$4)',[day,a.id,'departed',a.version])).rejects.toThrow(/staff/);
    await identity(outsider,'anon');
    await expect(query('select public.set_attendance($1,$2,$3,$4)',[day,a.id,'departed',a.version])).rejects.toThrow(/permission denied/);
    await identity(manager);
  });
});
