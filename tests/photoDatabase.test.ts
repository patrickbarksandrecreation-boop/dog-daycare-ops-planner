import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
let db: PGlite;
const w='00000000-0000-4000-8000-000000000001', otherW='00000000-0000-4000-8000-000000000002';
const manager='10000000-0000-4000-8000-000000000001', staff='10000000-0000-4000-8000-000000000002', outsider='10000000-0000-4000-8000-000000000003', foreign='10000000-0000-4000-8000-000000000004';
const dog='20000000-0000-4000-8000-000000000001';
const original=`${w}/${dog}/old.png`;
async function q(sql:string,args:unknown[]=[]):Promise<any[]> { return (await db.query(sql,args)).rows; }
async function as(id:string,role='authenticated') { await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false)`); }
async function reserve(actor=staff) { await as(actor,'service_role'); return (await q("select public.reserve_dog_photo($1,$2,'png') path",[actor,dog]))[0].path as string; }
async function uploaded(path:string) { await db.exec('reset role'); await q("insert into storage.objects(bucket_id,name) values('dog-photos',$1)",[path]); await as(staff,'service_role'); }
async function current() { await db.exec('reset role'); return (await q('select * from public.dogs where id=$1',[dog]))[0]; }
async function cleanup(actor=staff) { await as(actor,'service_role'); return (await q('select public.dog_photo_cleanup($1) path',[actor])).map(r=>r.path); }
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
    insert into auth.users values('${manager}',true),('${staff}',true),('${outsider}',true),('${foreign}',true);`);
  const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
  for(const f of files.filter(f=>!f.includes('dog_breed_staff_photos'))) await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8').replace('alter publication supabase_realtime add table public.planning_days,public.dogs;',''));
  await db.exec(`insert into public.workspaces(id,name) values('${otherW}','Other workspace');
    insert into public.staff_profiles(id,display_name,role,workspace_id) values('${manager}','Manager','manager','${w}'),('${staff}','Staff','staff','${w}'),('${foreign}','Other staff','staff','${otherW}');
    insert into public.dogs(id,name,breed,photo_path,workspace_id,source_system,source_pet_id,photo_kind) values('${dog}','Synthetic Luna','Mixed breed','${original}','${w}','fixture','one','breed_placeholder');
    insert into storage.objects(bucket_id,name) values('dog-photos','${original}');`);
  await db.exec(readFileSync('supabase/migrations/20261011082513_dog_breed_staff_photos.sql','utf8'));
});
afterAll(async()=>{await db?.close();});
describe.sequential('breed and private photo migration on PostgreSQL (Storage transport simulated)',()=>{
  it('preserves imported metadata and supports optional breed on new staff-created dogs',async()=>{
    expect(await current()).toMatchObject({breed:'Mixed breed',source_system:'fixture',source_pet_id:'one',photo_path:original});
    await as(staff);
    await q("select public.save_dog('20000000-0000-4000-8000-000000000002','New dog',null,false,'Unknown')");
    await q("select public.save_dog('20000000-0000-4000-8000-000000000003','No breed',null,false,null)");
    await expect(q('select public.save_dog($1,$2,null,false,$3)',[dog,'Changed','Lab'])).rejects.toThrow(/manager/);
    await expect(q("update public.dogs set breed='Lab'")).rejects.toThrow(/permission denied/);
    await as(manager); await q('select public.save_dog($1,$2,null,false,$3)',[dog,'Synthetic Luna','Border Collie']);
    await q('select public.save_dog($1,$2,null,false)',[dog,'Synthetic Luna']);
    expect(await current()).toMatchObject({breed:'Border Collie',photo_path:original});
  });
  it('denies public/ordinary staff access to privileged lifecycle RPCs and the ledger',async()=>{
    for(const role of ['anon','authenticated']) {
      await as(staff,role);
      for(const sql of ["select public.reserve_dog_photo($1,$2,'png')",'select public.commit_dog_photo($1,$2,null,null)']) await expect(q(sql,[staff,dog])).rejects.toThrow(/permission denied/);
      await expect(q('select * from private.dog_photo_objects')).rejects.toThrow(/permission denied/);
    }
    await as(staff); await expect(q("update public.staff_profiles set role='manager'")).rejects.toThrow(/permission denied/);
    for(const actor of [outsider,foreign]) await expect(reserve(actor)).rejects.toThrow(/Staff access/);
  });
  it('keeps old photo until upload and commit, then makes only the old object deletable',async()=>{
    const path=await reserve(); expect((await current()).photo_path).toBe(original);
    await as(staff,'service_role'); await expect(q('select public.commit_dog_photo($1,$2,$3,$4)',[staff,dog,path,original])).rejects.toThrow(/not complete/);
    await uploaded(path); await q('select public.commit_dog_photo($1,$2,$3,$4)',[staff,dog,path,original]);
    expect(await current()).toMatchObject({photo_path:path,photo_kind:'profile',breed:'Border Collie'});
    expect(await cleanup()).toEqual([original]);
    await q('select public.ack_dog_photo_cleanup($1,$2)',[staff,[original]]);
    expect(await cleanup()).toEqual([]);
  });
  it('resolves competing replacements and cannot delete or restore the final image',async()=>{
    const before=(await current()).photo_path, a=await reserve(), b=await reserve(); await uploaded(a); await uploaded(b);
    const attempts=await Promise.allSettled([q('select public.commit_dog_photo($1,$2,$3,$4)',[staff,dog,a,before]),q('select public.commit_dog_photo($1,$2,$3,$4)',[staff,dog,b,before])]);
    expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const winner=(await current()).photo_path, loser=winner===a?b:a;
    await as(staff,'service_role');
    await q('select public.retire_dog_photo($1,$2)',[staff,winner]); // ambiguous successful response
    await q('select public.retire_dog_photo($1,$2)',[staff,loser]);
    expect(await cleanup()).not.toContain(winner);
    await expect(q('select public.commit_dog_photo($1,$2,$3,$4)',[staff,dog,before,winner])).rejects.toThrow(/unavailable/);
    await as(manager); await q('select public.save_dog($1,$2,$3,false,$4)',[dog,'Synthetic Luna',before,'BC']);
    expect((await current()).photo_path).toBe(winner);
  });
  it('expires abandoned uploads and prevents a late commit after cleanup has claimed them',async()=>{
    const before=(await current()).photo_path, pending=await reserve(); await uploaded(pending);
    await db.exec('reset role'); await q("update private.dog_photo_objects set created_at=now()-interval '25 hours' where path=$1",[pending]);
    expect(await cleanup()).toContain(pending);
    await expect(q('select public.commit_dog_photo($1,$2,$3,$4)',[staff,dog,pending,before])).rejects.toThrow(/unavailable/);
    expect((await current()).photo_path).toBe(before);
  });
  it('protects private reads/deletes/uploads and denies revoked membership at commit',async()=>{
    const before=(await current()).photo_path;
    await as(staff);
    await expect(q("insert into storage.objects(bucket_id,name) values('dog-photos',$1)",[`${w}/${dog}/bypass.png`])).rejects.toThrow(/row-level security/);
    await q('delete from storage.objects where name=$1',[before]);
    expect(await q('select * from storage.objects where name=$1',[before])).toHaveLength(1);
    await as(outsider); expect(await q('select * from storage.objects')).toHaveLength(0);
    await as(foreign); expect(await q('select * from storage.objects')).toHaveLength(0);
    await as(outsider,'anon'); await expect(q('select * from storage.objects')).rejects.toThrow(/permission denied/);
    const path=await reserve(); await uploaded(path); await db.exec('reset role'); await q('delete from public.staff_profiles where id=$1',[staff]);
    await as(staff,'service_role'); await expect(q('select public.commit_dog_photo($1,$2,$3,$4)',[staff,dog,path,before])).rejects.toThrow(/Staff access/);
    await db.exec('reset role'); expect((await q("select public from storage.buckets where id='dog-photos'"))[0].public).toBe(false);
  });
});
