import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('upgrades an existing placement without losing its dog, group, order or version', async () => {
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid,bucket_id text);
    `);
    await db.exec(readFileSync('supabase/migrations/001_planner.sql','utf8').replace('alter publication supabase_realtime add table public.planning_days,public.dogs;',''));
    await db.exec(`
      insert into public.dogs(id,name) values('20000000-0000-4000-8000-000000000099','Legacy fictional dog');
      insert into public.planning_days(id,local_date) values('30000000-0000-4000-8000-000000000099','2026-01-01');
      insert into public.daily_group_labels select '30000000-0000-4000-8000-000000000099',id,default_name from public.group_configurations;
      insert into public.daily_assignments(planning_day_id,dog_id,group_id,sort_order,version)
        select '30000000-0000-4000-8000-000000000099','20000000-0000-4000-8000-000000000099',id,7,4 from public.group_configurations where display_order=2;
    `);
    const old=(await db.query('select * from public.daily_assignments')).rows[0];
    await db.exec(readFileSync('supabase/migrations/002_attendance.sql','utf8'));
    const upgraded=(await db.query('select * from public.daily_assignments')).rows[0];
    expect(upgraded).toMatchObject(old);
    expect(upgraded).toMatchObject({attendance_status:'expected',arrived_at:null,departed_at:null});
    await db.exec("insert into public.group_configurations(default_name,display_order) values('Group 4',4)");
    await expect(db.exec("insert into public.group_configurations(default_name,display_order) values('Group 5',5)")).rejects.toThrow();
  } finally { await db.close(); }
});
