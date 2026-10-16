-- Disabled until the worker host has independently verified its Petboost session.
begin;
create table public.petboost_sync (
  workspace_id uuid primary key references public.workspaces,
  enabled boolean not null default false,
  last_success_at timestamptz,
  last_success_date date,
  last_error_code text check(last_error_code in ('login_required','incomplete_fetch','identity_review','worker_error')),
  last_attempt_at timestamptz,
  heartbeat_at timestamptz,
  requested_at timestamptz,
  claimed_request_at timestamptz,
  run_id uuid,
  lease_until timestamptz,
  last_slot text
);
create table public.petboost_bookings (
  workspace_id uuid not null references public.workspaces,
  local_date date not null,
  booking_id text not null check(booking_id ~ '^[a-f0-9]{24}$'),
  pet_id text not null check(pet_id ~ '^[a-f0-9]{24}$'),
  dog_id uuid not null,
  active boolean not null,
  seen_at timestamptz not null default now(),
  primary key(workspace_id,local_date,booking_id,pet_id),
  foreign key(workspace_id,dog_id) references public.dogs(workspace_id,id)
);
alter table public.petboost_sync enable row level security;
alter table public.petboost_bookings enable row level security;
revoke all on public.petboost_sync,public.petboost_bookings from public,anon,authenticated;
grant select on public.petboost_sync,public.petboost_bookings to authenticated;
create policy workspace_read on public.petboost_sync for select to authenticated using(workspace_id=public.current_workspace());
create policy workspace_read on public.petboost_bookings for select to authenticated using(workspace_id=public.current_workspace());

create function public.request_petboost_sync() returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.require_staff();
  update public.petboost_sync set requested_at=clock_timestamp()
    where workspace_id=public.current_workspace() and enabled
      and (requested_at is null or requested_at < now()-interval '1 minute');
  if not found and not exists(select 1 from public.petboost_sync where workspace_id=public.current_workspace() and enabled) then
    raise exception 'Petboost worker is not configured';
  end if;
end; $$;
revoke all on function public.request_petboost_sync() from public,anon,authenticated;
grant execute on function public.request_petboost_sync() to authenticated;

-- Service-only endpoints: never granted to frontend roles. The lease serializes
-- manual and scheduled runs and fences off a late result from a crashed worker.
create function public.claim_petboost_sync(p_workspace uuid,p_slot text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.petboost_sync; local_now timestamp := clock_timestamp() at time zone 'Australia/Brisbane'; token uuid;
begin
  select * into s from public.petboost_sync where workspace_id=p_workspace for update;
  if not found or not s.enabled then return null; end if;
  update public.petboost_sync set heartbeat_at=clock_timestamp() where workspace_id=p_workspace;
  if s.lease_until > clock_timestamp() then return null; end if;
  if p_slot is not null then
    if p_slot !~ '^\d{4}-\d{2}-\d{2}T(06|07|08|09|10|11):30$'
      or left(p_slot,10)<>local_now::date::text
      or extract(isodow from local_now)>5
      or p_slot::timestamp > local_now
      or p_slot::timestamp < local_now-interval '10 minutes' then raise exception 'Invalid schedule slot'; end if;
  end if;
  if (p_slot is null or p_slot=s.last_slot) and (s.requested_at is null or s.requested_at<=coalesce(s.claimed_request_at,'-infinity')) then return null; end if;
  token:=gen_random_uuid();
  update public.petboost_sync set run_id=token,lease_until=clock_timestamp()+interval '8 minutes',
    last_attempt_at=clock_timestamp(),claimed_request_at=requested_at,last_slot=coalesce(p_slot,last_slot),last_error_code=null
    where workspace_id=p_workspace;
  return token;
end; $$;

create function public.fail_petboost_sync(p_workspace uuid,p_run uuid,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.petboost_sync set last_error_code=p_code,lease_until=null,run_id=null
    where workspace_id=p_workspace and run_id=p_run;
end; $$;

create function public.require_petboost_worker_verified(p_workspace uuid) returns void
language plpgsql security definer set search_path='' as $$ begin return; end; $$;
revoke all on function public.require_petboost_worker_verified(uuid) from public,anon,authenticated;

create function public.apply_petboost_sync(p_workspace uuid,p_run uuid,p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare s public.petboost_sync; d date := (clock_timestamp() at time zone 'Australia/Brisbane')::date;
  day_id uuid; r jsonb; dog uuid; previously_seen boolean; changed boolean := false; inserted_count integer;
begin
  select * into s from public.petboost_sync where workspace_id=p_workspace for update;
  if not found or not s.enabled or p_run is null or s.run_id is distinct from p_run or s.lease_until is null or s.lease_until<=clock_timestamp() then raise exception 'Expired sync lease'; end if;
  perform public.require_petboost_worker_verified(p_workspace);
  if exists(select 1 from public.workspaces where id=p_workspace and anonymous_pilot_enabled) then
    raise exception 'Workplace access review required before importing real bookings';
  end if;
  if p_snapshot->>'date' is distinct from d::text or p_snapshot->>'complete' is distinct from 'true'
    or jsonb_typeof(p_snapshot->'bookings') is distinct from 'array'
    or (p_snapshot->>'expectedCount')::integer is distinct from (p_snapshot->>'observedCount')::integer
    or (p_snapshot->>'expectedCount')::integer is null
    or (p_snapshot->>'expectedCount')::integer < jsonb_array_length(p_snapshot->'bookings')
    or (p_snapshot->>'fetchedAt')::timestamptz < clock_timestamp()-interval '7 minutes'
    or (p_snapshot->>'fetchedAt')::timestamptz > clock_timestamp()+interval '1 minute'
    or p_snapshot->>'fetchedAt' is null then raise exception 'Incomplete or stale Petboost snapshot'; end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'bookings') b
    where coalesce(b->>'bookingId','') !~ '^[a-f0-9]{24}$' or coalesce(b->>'petId','') !~ '^[a-f0-9]{24}$'
      or length(trim(coalesce(b->>'name',''))) not between 1 and 80)
    or exists(select 1 from jsonb_array_elements(p_snapshot->'bookings') b group by b->>'bookingId',b->>'petId' having count(*)>1)
    then raise exception 'Invalid Petboost identity'; end if;
  insert into public.planning_days(workspace_id,local_date) values(p_workspace,d) on conflict do nothing;
  select id into day_id from public.planning_days where workspace_id=p_workspace and local_date=d for update;
  insert into public.daily_group_labels(workspace_id,planning_day_id,group_id,displayed_name)
    select p_workspace,day_id,id,default_name from public.group_configurations where workspace_id=p_workspace on conflict do nothing;
  -- The same day row lock is used by all existing staff mutations.
  for r in select value from jsonb_array_elements(p_snapshot->'bookings') loop
    select id into dog from public.dogs where workspace_id=p_workspace and source_system='petboost' and source_pet_id=r->>'petId';
    if dog is null then
      -- Never guess that an existing manually-created dog is a different dog.
      -- An operator must link the stable ID before retrying an ambiguous import.
      if exists(select 1 from public.dogs where workspace_id=p_workspace
        and lower(split_part(trim(name),' ',1))=lower(split_part(trim(r->>'name'),' ',1))) then
        raise exception 'Identity review required' using errcode='P0002';
      end if;
      insert into public.dogs(workspace_id,name,source_system,source_pet_id)
        values(p_workspace,trim(r->>'name'),'petboost',r->>'petId') returning id into dog;
    end if;
    if exists(select 1 from public.dogs where id=dog and is_archived) then raise exception 'Identity review required' using errcode='P0002'; end if;
    select exists(select 1 from public.petboost_bookings where workspace_id=p_workspace and local_date=d and pet_id=r->>'petId') into previously_seen;
    if not previously_seen and not exists(select 1 from public.movement_events
      where workspace_id=p_workspace and planning_day_id=day_id and dog_id=dog and event_type='removed') then
      insert into public.daily_assignments(workspace_id,planning_day_id,dog_id,sort_order)
        select p_workspace,day_id,dog,coalesce(max(sort_order)+1,0) from public.daily_assignments where planning_day_id=day_id and group_id is null
        on conflict(planning_day_id,dog_id) do nothing;
      get diagnostics inserted_count = row_count;
      changed:=changed or inserted_count>0;
    end if;
    insert into public.petboost_bookings(workspace_id,local_date,booking_id,pet_id,dog_id,active)
      values(p_workspace,d,r->>'bookingId',r->>'petId',dog,true)
      on conflict(workspace_id,local_date,booking_id,pet_id) do update set active=true,seen_at=clock_timestamp();
  end loop;
  -- Missing bookings are review flags only. Never delete, reset or re-add an
  -- assignment; manual removals, arrivals, departures and allocations survive.
  update public.petboost_bookings b set active=false where b.workspace_id=p_workspace and b.local_date=d
    and not exists(select 1 from jsonb_array_elements(p_snapshot->'bookings') item where item->>'bookingId'=b.booking_id and item->>'petId'=b.pet_id);
  if changed then perform public.touch_plan(day_id); end if;
  update public.petboost_sync set last_success_at=clock_timestamp(),last_success_date=d,last_error_code=null,run_id=null,lease_until=null where workspace_id=p_workspace;
end; $$;
revoke all on function public.claim_petboost_sync(uuid,text),public.fail_petboost_sync(uuid,uuid,text),public.apply_petboost_sync(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_petboost_sync(uuid,text),public.fail_petboost_sync(uuid,uuid,text),public.apply_petboost_sync(uuid,uuid,jsonb) to service_role;
commit;
