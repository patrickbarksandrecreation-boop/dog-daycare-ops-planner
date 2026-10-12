import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
let db: PGlite;
const w='00000000-0000-4000-8000-000000000001', otherW='00000000-0000-4000-8000-000000000002';
const staff='10000000-0000-4000-8000-000000000001', second='10000000-0000-4000-8000-000000000002', outsider='10000000-0000-4000-8000-000000000003', foreign='10000000-0000-4000-8000-000000000004';
const a='20000000-0000-4000-8000-000000000001', b='20000000-0000-4000-8000-000000000002', c='20000000-0000-4000-8000-000000000003';
async function q(sql:string,args:unknown[]=[]):Promise<any[]> { return (await db.query(sql,args)).rows; }
async function as(id:string,role='authenticated') { await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false)`); }
async function snapshot() { return (await q("select public.planning_snapshot('2026-10-12') s"))[0].s; }
async function rule(id:string|null,version:number|null,level='hard',note='Keep separate',first=a,last=b) {
  return q('select public.save_interaction_rule($1,$2,$3,$4,$5,$6)',[id,first,last,level,note,version]);
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
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8').replace('alter publication supabase_realtime add table public.planning_days,public.dogs;',''));
  }
  await db.exec(`insert into public.workspaces(id,name) values('${otherW}','Other workspace');
    insert into public.staff_profiles(id,display_name,role,workspace_id) values('${staff}','Synthetic Staff','staff','${w}'),('${second}','Second Staff','staff','${w}'),('${foreign}','Other staff','staff','${otherW}');
    insert into public.dogs(id,name,workspace_id) values('${a}','Fictional A','${w}'),('${b}','Fictional B','${w}'),('${c}','Foreign C','${otherW}');`);
  await as(staff); await q("select public.ensure_planning_day('2026-10-12')");
});
afterAll(async()=>{await db?.close();});
describe.sequential('shared notes/rules PostgreSQL permissions, invariants and audit',()=>{
  it('allows enrolled staff notes and preserves independent dog attributes with audit attribution',async()=>{
    await q('select public.set_handling_notes($1,$2,1)',[a,'  Calm greeting\nGive space  ']);
    const s=await snapshot(); expect(s.dogs.find((d:any)=>d.id===a)).toMatchObject({handling_notes:'Calm greeting\nGive space',notes_version:2,notes_updated_by:'Synthetic Staff'});
    const events=await q('select * from public.behaviour_events');
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({actor_id:staff,actor_display_name:'Synthetic Staff',event_type:'notes_edited',before_value:{notes:'',version:1},after_value:{version:2}});
    expect(events[0].occurred_at).toBeTruthy();
    await q('select public.set_dog_markers($1,true,false,1)',[a]);
    expect((await snapshot()).dogs.find((d:any)=>d.id===a).notes_version).toBe(2);
  });
  it('rejects stale/competing notes without losing the winning text or creating extra audit rows',async()=>{
    await as(second);
    const results=await Promise.allSettled([q('select public.set_handling_notes($1,$2,2)',[a,'Winner']),q('select public.set_handling_notes($1,$2,2)',[a,'Loser'])]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code).toBe('PT409');
    expect((await snapshot()).dogs.find((d:any)=>d.id===a)).toMatchObject({handling_notes:'Winner',notes_version:3,notes_updated_by:'Second Staff'});
    expect(await q('select * from public.behaviour_events')).toHaveLength(2);
    await expect(q('select public.set_handling_notes($1,$2,3)',[a,'x'.repeat(5001)])).rejects.toThrow(/5000/);
  });
  it('stores one canonical symmetric pair and rejects concurrent/reversed duplicate creation',async()=>{
    const results=await Promise.allSettled([rule(null,null),rule(null,null,'soft','Duplicate',b,a)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code).toBe('PT409');
    const rules=(await snapshot()).rules; expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({dogs:[a,b],level:'hard',note:'Keep separate',version:1});
    await expect(rule(null,null,'hard','Self',a,a)).rejects.toThrow(/different/);
    await expect(rule(null,null,'hard','Foreign',a,c)).rejects.toThrow(/workspace/);
    await expect(rule(null,null,'invalid')).rejects.toThrow(/Hard or Soft/);
    await expect(rule(null,null,'soft','  ')).rejects.toThrow(/note/);
  });
  it('checks edits and removals against versions and retains removed rule content',async()=>{
    const original=(await snapshot()).rules[0];
    await rule(original.id,1,'soft','Monitor after introductions',b,a);
    await expect(rule(original.id,1,'hard','Stale')).rejects.toMatchObject({code:'PT409'});
    await expect(q('select public.remove_interaction_rule($1,1)',[original.id])).rejects.toMatchObject({code:'PT409'});
    const results=await Promise.allSettled([rule(original.id,2,'hard','Winning edit'),q('select public.remove_interaction_rule($1,2)',[original.id])]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    await q('select public.remove_interaction_rule($1,3)',[original.id]);
    expect((await snapshot()).rules).toEqual([]);
    const events=await q("select * from public.behaviour_events where event_type='rule_removed'");
    expect(events[0]).toMatchObject({before_value:{note:'Winning edit',version:3},after_value:null,actor_id:second});
    await rule(null,null,'soft','Re-created');
    await expect(rule(original.id,3)).rejects.toMatchObject({code:'PT409'});
  });
  it('denies anonymous, unenrolled, cross-workspace and revoked staff access',async()=>{
    const r=(await snapshot()).rules[0];
    for(const id of [foreign,outsider]) {
      await as(id);
      expect(await q('select * from public.interaction_rules')).toHaveLength(0);
      expect(await q('select * from public.behaviour_events')).toHaveLength(0);
      await expect(q('select public.set_handling_notes($1,$2,3)',[a,'Denied'])).rejects.toThrow();
      await expect(rule(r.id,r.version)).rejects.toThrow();
      await expect(q('select public.remove_interaction_rule($1,$2)',[r.id,r.version])).rejects.toThrow();
    }
    await as(staff,'anon');
    for(const name of ['set_handling_notes','save_interaction_rule','remove_interaction_rule','record_behaviour_change']) {
      expect((await q("select has_function_privilege('anon',p.oid,'EXECUTE') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=$1",[name]))[0].allowed).toBe(false);
    }
    await db.exec(`reset role; delete from public.staff_profiles where id='${second}'`);
    await as(second); await expect(rule(null,null)).rejects.toThrow(/staff/i);
    expect(await q('select * from public.behaviour_events')).toHaveLength(0);
    await as(staff);
  });
  it('denies direct writes and audit forgery; constraints protect privileged writes too',async()=>{
    for(const sql of ["update public.dogs set handling_notes='Forged'","delete from public.interaction_rules","update public.interaction_rules set level='soft'","delete from public.behaviour_events","truncate public.behaviour_events","insert into public.behaviour_events(entity_id) values(gen_random_uuid())"]) await expect(q(sql)).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
    await expect(q('delete from public.behaviour_events')).rejects.toThrow(/append-only/);
    const insert="insert into public.interaction_rules(workspace_id,dog_a,dog_b,level,note,updated_by) values($1,$2,$3,'hard','test','test')";
    await expect(q(insert,[w,b,a])).rejects.toThrow(/check constraint/);
    await expect(q(insert,[w,a,a])).rejects.toThrow(/check constraint/);
    await expect(q(insert,[w,a,c])).rejects.toThrow(/foreign key/);
    await expect(q(insert,[w,a,b])).rejects.toThrow(/unique constraint/);
    await as(staff);
  });
  it('keeps hard rules advisory for bookings, moves and attendance and persists across dates',async()=>{
    const r=(await snapshot()).rules[0]; await rule(r.id,r.version,'hard','Must stay separate');
    const s=await snapshot();
    for(const id of [a,b]) {
      await q('select public.add_to_plan($1,$2)',[s.day.id,id]);
      const assignment=(await snapshot()).assignments.find((x:any)=>x.dog_id===id);
      await q('select public.move_assignment($1,$2,$3,null,1)',[s.day.id,assignment.id,s.groups[0].group_id]);
      await q("select public.set_attendance($1,$2,'present',2)",[s.day.id,assignment.id]);
    }
    expect((await snapshot()).assignments.every((x:any)=>x.attendance_status==='present')).toBe(true);
    await q("select public.ensure_planning_day('2026-10-13')");
    const next=(await q("select public.planning_snapshot('2026-10-13') s"))[0].s;
    expect(next.rules).toEqual((await snapshot()).rules);
    expect(next.dogs.find((d:any)=>d.id===a).handling_notes).toBe('Winner');
    await db.exec('begin'); await q('select public.set_handling_notes($1,$2,3)',[a,'Rolled back']); await db.exec('rollback');
    expect((await snapshot()).dogs.find((d:any)=>d.id===a).handling_notes).toBe('Winner');
  });
});
