begin;
alter table public.petboost_sync drop constraint petboost_sync_last_error_code_check;
alter table public.petboost_sync add constraint petboost_sync_last_error_code_check
  check(last_error_code in ('login_required','incomplete_fetch','identity_review','worker_error','ai_unavailable'));
-- A legacy scraper verification does not establish AI-reader acceptance.
update public.petboost_sync set netlify_verified_at=null,run_id=null,lease_until=null,
  verification_run_id=null,verification_finished_at=null;

-- Reuse the existing fenced, atomic ID importer. Its transaction retains the
-- workspace/day locks until the arrival updates below have also committed.
create function public.apply_petboost_ai_sync(p_workspace uuid,p_run uuid,p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare day_id uuid; updated_count integer;
begin
  if p_snapshot->>'readerVersion' is distinct from '2'
    or p_snapshot->>'model' is distinct from 'gpt-6.1-terra'
    or p_snapshot->>'reasoning' is distinct from 'low'
    or jsonb_typeof(p_snapshot->'bookings') is distinct from 'array' then
    raise exception 'Verified Terra snapshot required';
  end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'bookings') b
    where jsonb_typeof(b->'arrived') is distinct from 'boolean') then
    raise exception 'Explicit arrival observation required';
  end if;
  perform public.apply_petboost_sync(p_workspace,p_run,p_snapshot);
  select id into day_id from public.planning_days where workspace_id=p_workspace
    and local_date=(clock_timestamp() at time zone 'Australia/Brisbane')::date;
  update public.daily_assignments a set attendance_status='present',
    arrived_at=coalesce(a.arrived_at,(p_snapshot->>'fetchedAt')::timestamptz),
    version=a.version+1,updated_at=clock_timestamp(),updated_by=null
    where a.workspace_id=p_workspace and a.planning_day_id=day_id and a.attendance_status='expected'
      and exists(select 1 from public.dogs d, jsonb_array_elements(p_snapshot->'bookings') b
        where d.workspace_id=p_workspace and d.id=a.dog_id and d.source_system='petboost'
          and d.source_pet_id=b->>'petId' and b->>'arrived'='true');
  get diagnostics updated_count = row_count;
  if updated_count>0 then perform public.touch_plan(day_id); end if;
  -- No group/order changes, attendance resets, departures or profile deletions.
  -- The existing history trigger records each versioned attendance transition.
end; $$;
revoke all on function public.apply_petboost_ai_sync(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_petboost_ai_sync(uuid,uuid,jsonb) to service_role;
commit;
