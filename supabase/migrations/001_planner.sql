-- One workplace per Supabase project. Apply as postgres using SQL Editor or CLI.
begin;
create table public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  role text not null default 'staff' check (role in ('manager','staff'))
);
create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  photo_path text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dogs_active_name on public.dogs (is_archived, name);
create table public.group_configurations (
  id uuid primary key default gen_random_uuid(),
  default_name text not null check (length(trim(default_name)) between 1 and 40),
  display_order integer not null unique check (display_order between 1 and 3),
  updated_at timestamptz not null default now()
);
insert into public.group_configurations(default_name,display_order) values ('Group 1',1),('Group 2',2),('Group 3',3);
create table public.planning_days (
  id uuid primary key default gen_random_uuid(),
  local_date date not null unique,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.daily_group_labels (
  planning_day_id uuid not null references public.planning_days(id),
  group_id uuid not null references public.group_configurations(id),
  displayed_name text not null check (length(trim(displayed_name)) between 1 and 40),
  primary key (planning_day_id,group_id)
);
create table public.daily_assignments (
  id uuid primary key default gen_random_uuid(),
  planning_day_id uuid not null references public.planning_days(id),
  dog_id uuid not null references public.dogs(id),
  group_id uuid,
  sort_order integer not null default 0 check (sort_order >= 0),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (planning_day_id,dog_id),
  foreign key (planning_day_id,group_id) references public.daily_group_labels(planning_day_id,group_id)
);
create index assignments_lane on public.daily_assignments (planning_day_id,group_id,sort_order);

create function public.is_staff() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.staff_profiles where id = auth.uid());
$$;
create function public.is_manager() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.staff_profiles where id = auth.uid() and role = 'manager');
$$;
alter table public.staff_profiles enable row level security;
alter table public.dogs enable row level security;
alter table public.group_configurations enable row level security;
alter table public.planning_days enable row level security;
alter table public.daily_group_labels enable row level security;
alter table public.daily_assignments enable row level security;
create policy own_profile on public.staff_profiles for select to authenticated using (id = auth.uid());
create policy staff_read_dogs on public.dogs for select to authenticated using (public.is_staff());
create policy staff_read_config on public.group_configurations for select to authenticated using (public.is_staff());
create policy staff_read_days on public.planning_days for select to authenticated using (public.is_staff());
create policy staff_read_labels on public.daily_group_labels for select to authenticated using (public.is_staff());
create policy staff_read_assignments on public.daily_assignments for select to authenticated using (public.is_staff());
-- All table writes go through checked RPCs. Self-enrolment and role escalation are impossible through the API.
revoke all on public.staff_profiles, public.dogs, public.group_configurations, public.planning_days, public.daily_group_labels, public.daily_assignments from anon, authenticated;
grant select on public.staff_profiles, public.dogs, public.group_configurations, public.planning_days, public.daily_group_labels, public.daily_assignments to authenticated;

create function public.require_staff(p_manager boolean default false) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() or (p_manager and not public.is_manager()) then
    raise exception 'Authorised % access required', case when p_manager then 'manager' else 'staff' end using errcode = '42501';
  end if;
end; $$;
create function public.lock_plan(p_day uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff();
  perform 1 from public.planning_days where id = p_day for update;
  if not found then raise exception 'Planning day not found'; end if;
end; $$;
create function public.touch_plan(p_day uuid) returns void language sql security definer set search_path = '' as $$
  update public.planning_days set revision = revision + 1, updated_at = now() where id = p_day;
$$;
create function public.ensure_planning_day(p_date date) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_day uuid;
begin
  perform public.require_staff();
  if p_date is null then raise exception 'A date is required'; end if;
  insert into public.planning_days(local_date) values(p_date) on conflict(local_date) do nothing returning id into v_day;
  if v_day is null then select id into v_day from public.planning_days where local_date = p_date; end if;
  insert into public.daily_group_labels(planning_day_id,group_id,displayed_name)
    select v_day,id,default_name from public.group_configurations on conflict do nothing;
  return v_day;
end; $$;
create function public.planning_snapshot(p_date date) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.require_staff();
  -- Single statement snapshot: counts and roster derive from this same assignment set.
  select jsonb_build_object(
    'day', to_jsonb(d),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('group_id',l.group_id,'displayed_name',l.displayed_name,'display_order',g.display_order) order by g.display_order),'[]') from public.daily_group_labels l join public.group_configurations g on g.id=l.group_id where l.planning_day_id=d.id),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order,a.id),'[]') from public.daily_assignments a where a.planning_day_id=d.id),
    'dogs', (select coalesce(jsonb_agg(to_jsonb(dog) order by dog.name,dog.id),'[]') from public.dogs dog where not dog.is_archived or exists(select 1 from public.daily_assignments a where a.planning_day_id=d.id and a.dog_id=dog.id))
  ) into result from public.planning_days d where d.local_date=p_date;
  if result is null then raise exception 'Planning day not found'; end if;
  return result;
end; $$;
create function public.add_to_plan(p_day uuid,p_dog uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_plan(p_day);
  perform 1 from public.dogs where id=p_dog and not is_archived for share;
  if not found then raise exception 'Dog is archived or unavailable'; end if;
  insert into public.daily_assignments(planning_day_id,dog_id,sort_order,updated_by)
    select p_day,p_dog,coalesce(max(sort_order)+1,0),auth.uid() from public.daily_assignments where planning_day_id=p_day and group_id is null
    on conflict(planning_day_id,dog_id) do nothing;
  if found then perform public.touch_plan(p_day); end if;
end; $$;
create function public.move_assignment(p_day uuid,p_assignment uuid,p_group uuid,p_before uuid,p_version integer) returns void language plpgsql security definer set search_path = '' as $$
declare current_row public.daily_assignments; ordered uuid[]; target_index integer;
begin
  perform public.lock_plan(p_day);
  select * into current_row from public.daily_assignments where id=p_assignment and planning_day_id=p_day;
  if not found or current_row.version <> p_version or p_version is null then
    raise exception 'This dog was changed by another staff member. The board has refreshed; try again.' using errcode='40001';
  end if;
  if p_group is not null and not exists(select 1 from public.daily_group_labels where planning_day_id=p_day and group_id=p_group) then raise exception 'Invalid destination'; end if;
  if p_before = p_assignment then return; end if;
  select coalesce(array_agg(id order by sort_order,id),'{}') into ordered from public.daily_assignments where planning_day_id=p_day and group_id is not distinct from p_group and id<>p_assignment;
  target_index := array_position(ordered,p_before);
  if p_before is not null and target_index is null then raise exception 'The destination changed. Please try again.' using errcode='40001'; end if;
  if target_index is null then ordered:=array_append(ordered,p_assignment);
  else ordered:=ordered[1:target_index-1] || array[p_assignment] || ordered[target_index:cardinality(ordered)]; end if;
  update public.daily_assignments set group_id=p_group,version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_assignment;
  -- Only reorder the destination lane, calculated from current server rows, never from a stale client array.
  update public.daily_assignments a set sort_order = ranks.pos-1
    from unnest(ordered) with ordinality as ranks(id,pos) where a.id=ranks.id and a.sort_order<>ranks.pos-1;
  perform public.touch_plan(p_day);
end; $$;
create function public.remove_assignment(p_day uuid,p_assignment uuid,p_version integer) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_plan(p_day);
  delete from public.daily_assignments where id=p_assignment and planning_day_id=p_day and version=p_version;
  if not found then raise exception 'This dog has changed. Review the refreshed board and try again.' using errcode='40001'; end if;
  perform public.touch_plan(p_day);
end; $$;
create function public.rename_group(p_day uuid,p_group uuid,p_name text,p_default boolean default false) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(true);
  perform public.lock_plan(p_day);
  update public.daily_group_labels set displayed_name=trim(p_name) where planning_day_id=p_day and group_id=p_group;
  if not found then raise exception 'Group not found'; end if;
  if p_default then update public.group_configurations set default_name=trim(p_name),updated_at=now() where id=p_group; end if;
  perform public.touch_plan(p_day);
end; $$;
create function public.clear_plan(p_day uuid,p_revision integer) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(true);
  perform public.lock_plan(p_day);
  if not exists(select 1 from public.planning_days where id=p_day and revision=p_revision) then raise exception 'The plan has changed. Review it before clearing.' using errcode='40001'; end if;
  delete from public.daily_assignments where planning_day_id=p_day;
  perform public.touch_plan(p_day);
end; $$;
create function public.save_dog(p_id uuid,p_name text,p_photo text,p_archived boolean default false) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(true);
  if p_photo is not null and p_photo not like p_id::text || '/%' then raise exception 'Invalid photo path'; end if;
  insert into public.dogs(id,name,photo_path,is_archived) values(p_id,trim(p_name),p_photo,p_archived)
  on conflict(id) do update set name=excluded.name,photo_path=excluded.photo_path,is_archived=excluded.is_archived,updated_at=now();
end; $$;

-- No RPC is executable by PUBLIC (including anonymous visitors).
revoke all on function public.is_staff(),public.is_manager(),public.require_staff(boolean),public.lock_plan(uuid),public.touch_plan(uuid),public.ensure_planning_day(date),public.planning_snapshot(date),public.add_to_plan(uuid,uuid),public.move_assignment(uuid,uuid,uuid,uuid,integer),public.remove_assignment(uuid,uuid,integer),public.rename_group(uuid,uuid,text,boolean),public.clear_plan(uuid,integer),public.save_dog(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.is_staff(),public.is_manager(),public.ensure_planning_day(date),public.planning_snapshot(date),public.add_to_plan(uuid,uuid),public.move_assignment(uuid,uuid,uuid,uuid,integer),public.remove_assignment(uuid,uuid,integer),public.rename_group(uuid,uuid,text,boolean),public.clear_plan(uuid,integer),public.save_dog(uuid,text,text,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dog-photos','dog-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy staff_view_photos on storage.objects for select to authenticated using(bucket_id='dog-photos' and public.is_staff());
create policy managers_upload_photos on storage.objects for insert to authenticated with check(bucket_id='dog-photos' and public.is_manager());
create policy managers_delete_photos on storage.objects for delete to authenticated using(bucket_id='dog-photos' and public.is_manager());
-- Every assignment/label mutation bumps the day row in the same transaction.
-- Listening to day revisions covers removals/clears without fragile DELETE event filters.
alter publication supabase_realtime add table public.planning_days,public.dogs;
commit;
