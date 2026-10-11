-- Synthetic pilot: one administrator-assigned workspace per authenticated user.
begin;
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80)
);
insert into public.workspaces values ('00000000-0000-4000-8000-000000000001','Synthetic pilot');
-- Preserve the existing single-workplace installation without guessing membership.
alter table public.staff_profiles add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces;
alter table public.staff_profiles alter column workspace_id drop default;
create function public.current_workspace() returns uuid language sql stable security definer set search_path='' as $$
  select workspace_id from public.staff_profiles where id=auth.uid();
$$;
revoke all on function public.current_workspace() from public,anon,authenticated;
grant execute on function public.current_workspace() to authenticated;

alter table public.dogs add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces;
alter table public.group_configurations add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces;
alter table public.planning_days add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces;
alter table public.daily_group_labels add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces;
alter table public.daily_assignments add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces;
alter table public.dogs alter column workspace_id set default public.current_workspace();
alter table public.group_configurations alter column workspace_id set default public.current_workspace();
alter table public.planning_days alter column workspace_id set default public.current_workspace();
alter table public.daily_group_labels alter column workspace_id set default public.current_workspace();
alter table public.daily_assignments alter column workspace_id set default public.current_workspace();
alter table public.planning_days drop constraint planning_days_local_date_key;
alter table public.planning_days add unique(workspace_id,local_date), add unique(workspace_id,id);
alter table public.group_configurations drop constraint group_configurations_display_order_key;
alter table public.group_configurations add unique(workspace_id,display_order), add unique(workspace_id,id);
alter table public.dogs add unique(workspace_id,id);
alter table public.daily_group_labels add unique(workspace_id,planning_day_id,group_id),
  add foreign key(workspace_id,planning_day_id) references public.planning_days(workspace_id,id),
  add foreign key(workspace_id,group_id) references public.group_configurations(workspace_id,id);
alter table public.daily_assignments
  add foreign key(workspace_id,planning_day_id) references public.planning_days(workspace_id,id),
  add foreign key(workspace_id,dog_id) references public.dogs(workspace_id,id),
  add foreign key(workspace_id,planning_day_id,group_id) references public.daily_group_labels(workspace_id,planning_day_id,group_id);

alter table public.workspaces enable row level security;
revoke all on public.workspaces from public,anon,authenticated;
grant select on public.workspaces to authenticated;
create policy member_read_workspace on public.workspaces for select to authenticated using(id=public.current_workspace());
drop policy staff_read_dogs on public.dogs;
drop policy staff_read_config on public.group_configurations;
drop policy staff_read_days on public.planning_days;
drop policy staff_read_labels on public.daily_group_labels;
drop policy staff_read_assignments on public.daily_assignments;
create policy workspace_read on public.dogs for select to authenticated using(workspace_id=public.current_workspace());
create policy workspace_read on public.group_configurations for select to authenticated using(workspace_id=public.current_workspace());
create policy workspace_read on public.planning_days for select to authenticated using(workspace_id=public.current_workspace());
create policy workspace_read on public.daily_group_labels for select to authenticated using(workspace_id=public.current_workspace());
create policy workspace_read on public.daily_assignments for select to authenticated using(workspace_id=public.current_workspace());

create or replace function public.lock_plan(p_day uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.require_staff();
  perform 1 from public.planning_days where id=p_day and workspace_id=public.current_workspace() for update;
  if not found then raise exception 'Planning day unavailable' using errcode='42501'; end if;
end; $$;
create or replace function public.ensure_planning_day(p_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare v_day uuid;
begin
  perform public.require_staff();
  if p_date is null then raise exception 'A date is required'; end if;
  insert into public.planning_days(local_date) values(p_date) on conflict(workspace_id,local_date) do nothing returning id into v_day;
  if v_day is null then select id into v_day from public.planning_days where local_date=p_date and workspace_id=public.current_workspace(); end if;
  insert into public.daily_group_labels(planning_day_id,group_id,displayed_name)
    select v_day,id,default_name from public.group_configurations where workspace_id=public.current_workspace() on conflict do nothing;
  return v_day;
end; $$;

create table public.movement_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces,
  planning_day_id uuid not null,
  assignment_id uuid not null,
  dog_id uuid not null,
  event_type text not null check(event_type in ('booked','moved','attendance','removed')),
  from_group_id uuid,
  to_group_id uuid,
  from_status text,
  to_status text,
  assignment_version integer not null,
  actor_id uuid,
  actor_display_name text,
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key(workspace_id,planning_day_id) references public.planning_days(workspace_id,id),
  foreign key(workspace_id,dog_id) references public.dogs(workspace_id,id)
);
create index movement_events_day on public.movement_events(workspace_id,planning_day_id,id);
alter table public.movement_events enable row level security;
revoke all on public.movement_events from public,anon,authenticated;
grant select on public.movement_events to authenticated;
create policy workspace_read on public.movement_events for select to authenticated using(workspace_id=public.current_workspace());
create function public.record_movement() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.daily_assignments; kind text;
begin
  if TG_OP='DELETE' then a:=old; kind:='removed';
  elsif TG_OP='INSERT' then a:=new; kind:='booked';
  else
    a:=new;
    -- Lane rank normalisation alone does not represent a user's move.
    if new.version=old.version then return new; end if;
    kind:=case when new.attendance_status<>old.attendance_status then 'attendance' else 'moved' end;
  end if;
  insert into public.movement_events(workspace_id,planning_day_id,assignment_id,dog_id,event_type,
    from_group_id,to_group_id,from_status,to_status,assignment_version,actor_id,actor_display_name)
  values(a.workspace_id,a.planning_day_id,a.id,a.dog_id,kind,
    case when TG_OP<>'INSERT' then old.group_id end,case when TG_OP<>'DELETE' then new.group_id end,
    case when TG_OP<>'INSERT' then old.attendance_status end,case when TG_OP<>'DELETE' then new.attendance_status end,
    a.version,auth.uid(),(select display_name from public.staff_profiles where id=auth.uid()));
  return coalesce(new,old);
end; $$;
create trigger assignment_history after insert or update or delete on public.daily_assignments for each row execute function public.record_movement();
create function public.reject_event_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Movement history is append-only'; end; $$;
create trigger immutable_events before update or delete or truncate on public.movement_events for each statement execute function public.reject_event_mutation();
revoke all on function public.record_movement(),public.reject_event_mutation() from public,anon,authenticated;

-- Prefix new object paths with workspace/dog. Legacy paths remain readable only
-- when referenced by a dog in the caller's workspace; no cross-tenant fallback.
drop policy staff_view_photos on storage.objects;
drop policy managers_upload_photos on storage.objects;
drop policy managers_delete_photos on storage.objects;
create policy workspace_photos_read on storage.objects for select to authenticated using(
  bucket_id='dog-photos' and (split_part(name,'/',1)=public.current_workspace()::text or
  exists(select 1 from public.dogs d where d.photo_path=name and d.workspace_id=public.current_workspace())));
create policy workspace_photos_insert on storage.objects for insert to authenticated with check(
  bucket_id='dog-photos' and public.is_manager() and split_part(name,'/',1)=public.current_workspace()::text);
create policy workspace_photos_delete on storage.objects for delete to authenticated using(
  bucket_id='dog-photos' and public.is_manager() and split_part(name,'/',1)=public.current_workspace()::text);

-- Scoped snapshot and master-record RPC replacements follow.
create or replace function public.planning_snapshot(p_date date) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.require_staff();
  -- Single statement snapshot: counts and roster derive from this same assignment set.
  select jsonb_build_object(
    'day', to_jsonb(d),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('group_id',l.group_id,'displayed_name',l.displayed_name,'display_order',g.display_order) order by g.display_order),'[]') from public.daily_group_labels l join public.group_configurations g on g.id=l.group_id where l.planning_day_id=d.id),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order,a.id),'[]') from public.daily_assignments a where a.planning_day_id=d.id),
    'dogs', (select coalesce(jsonb_agg(to_jsonb(dog) order by dog.name,dog.id),'[]') from public.dogs dog where dog.workspace_id=public.current_workspace() and (not dog.is_archived or exists(select 1 from public.daily_assignments a where a.planning_day_id=d.id and a.dog_id=dog.id)))
  ) into result from public.planning_days d where d.local_date=p_date and d.workspace_id=public.current_workspace();
  if result is null then raise exception 'Planning day not found'; end if;
  return result;
end; $$;
create or replace function public.save_dog(p_id uuid,p_name text,p_photo text,p_archived boolean default false) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(true);
  if exists(select 1 from public.dogs where id=p_id and workspace_id<>public.current_workspace()) then raise exception 'Dog unavailable' using errcode='42501'; end if;
  if p_photo is not null and p_photo not like public.current_workspace()::text || '/' || p_id::text || '/%' and not exists(select 1 from public.dogs where id=p_id and workspace_id=public.current_workspace() and photo_path=p_photo) then raise exception 'Invalid photo path'; end if;
  insert into public.dogs(id,name,photo_path,is_archived) values(p_id,trim(p_name),p_photo,p_archived)
  on conflict(id) do update set name=excluded.name,photo_path=excluded.photo_path,is_archived=excluded.is_archived,updated_at=now()
    where public.dogs.workspace_id=public.current_workspace();
  if not found then raise exception 'Dog unavailable' using errcode='42501'; end if;
end; $$;
create or replace function public.add_to_plan(p_day uuid,p_dog uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_plan(p_day);
  perform 1 from public.dogs where id=p_dog and workspace_id=public.current_workspace() and not is_archived for share;
  if not found then raise exception 'Dog is archived or unavailable'; end if;
  insert into public.daily_assignments(planning_day_id,dog_id,sort_order,updated_by)
    select p_day,p_dog,coalesce(max(sort_order)+1,0),auth.uid() from public.daily_assignments where planning_day_id=p_day and group_id is null
    on conflict(planning_day_id,dog_id) do nothing;
  if found then perform public.touch_plan(p_day); end if;
end; $$;
commit;
