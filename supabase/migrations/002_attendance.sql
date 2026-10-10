-- Additive attendance upgrade. Existing daily records become Expected; group placements are preserved.
begin;
alter table public.daily_assignments
  add column attendance_status text not null default 'expected'
    check (attendance_status in ('expected', 'present', 'departed')),
  add column arrived_at timestamptz,
  add column departed_at timestamptz;
alter table public.daily_assignments add constraint attendance_times_consistent check (
  (attendance_status = 'expected' and arrived_at is null and departed_at is null) or
  (attendance_status = 'present' and arrived_at is not null and departed_at is null) or
  (attendance_status = 'departed' and arrived_at is not null and departed_at is not null)
);
-- Prepare for a fourth configured group without adding one to existing workplaces.
alter table public.group_configurations drop constraint group_configurations_display_order_check;
alter table public.group_configurations add constraint group_configurations_display_order_check check (display_order between 1 and 4);

create function public.set_attendance(p_day uuid, p_assignment uuid, p_status text, p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare current_row public.daily_assignments;
begin
  perform public.lock_plan(p_day);
  select * into current_row from public.daily_assignments where id=p_assignment and planning_day_id=p_day;
  if not found or current_row.version <> p_version or p_version is null then
    raise exception 'This dog has changed. Review the refreshed board and try again.' using errcode='40001';
  end if;
  if p_status = current_row.attendance_status then return; end if;
  if p_status is null or not (
    (current_row.attendance_status='expected' and p_status='present') or
    (current_row.attendance_status='present' and p_status='departed') or
    (current_row.attendance_status='departed' and p_status='present')
  ) then raise exception 'Invalid attendance transition'; end if;
  update public.daily_assignments set
    attendance_status=p_status,
    arrived_at=coalesce(arrived_at,now()),
    departed_at=case when p_status='departed' then now() else null end,
    version=version+1, updated_at=now(), updated_by=auth.uid()
  where id=p_assignment;
  perform public.touch_plan(p_day);
end; $$;
revoke all on function public.set_attendance(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.set_attendance(uuid,uuid,text,integer) to authenticated;

create or replace function public.move_assignment(p_day uuid,p_assignment uuid,p_group uuid,p_before uuid,p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare current_row public.daily_assignments; ordered uuid[]; target_index integer;
begin
  perform public.lock_plan(p_day);
  select * into current_row from public.daily_assignments where id=p_assignment and planning_day_id=p_day;
  if not found or current_row.version <> p_version or p_version is null then
    raise exception 'This dog was changed by another staff member. The board has refreshed; try again.' using errcode='40001';
  end if;
  if current_row.attendance_status='departed' then raise exception 'Departed dogs stay in day records. Undo departure before moving.'; end if;
  if p_group is not null and not exists(select 1 from public.daily_group_labels where planning_day_id=p_day and group_id=p_group) then raise exception 'Invalid destination'; end if;
  if p_before = p_assignment then return; end if;
  select coalesce(array_agg(id order by sort_order,id),'{}') into ordered
    from public.daily_assignments where planning_day_id=p_day and group_id is not distinct from p_group
      and id<>p_assignment and attendance_status<>'departed';
  target_index := array_position(ordered,p_before);
  if p_before is not null and target_index is null then raise exception 'The destination changed. Please try again.' using errcode='40001'; end if;
  if target_index is null then ordered:=array_append(ordered,p_assignment);
  else ordered:=ordered[1:target_index-1] || array[p_assignment] || ordered[target_index:cardinality(ordered)]; end if;
  -- Attendance and its timestamps are deliberately untouched.
  update public.daily_assignments set group_id=p_group,version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_assignment;
  update public.daily_assignments a set sort_order=ranks.pos-1
    from unnest(ordered) with ordinality as ranks(id,pos) where a.id=ranks.id and a.sort_order<>ranks.pos-1;
  perform public.touch_plan(p_day);
end; $$;

create or replace function public.remove_assignment(p_day uuid,p_assignment uuid,p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare current_row public.daily_assignments;
begin
  perform public.lock_plan(p_day);
  select * into current_row from public.daily_assignments where id=p_assignment and planning_day_id=p_day;
  if not found or current_row.version<>p_version or p_version is null then
    raise exception 'This dog has changed. Review the refreshed board and try again.' using errcode='40001';
  end if;
  if current_row.attendance_status<>'expected' then raise exception 'Attendance records cannot be removed. Mark a present dog departed instead.'; end if;
  delete from public.daily_assignments where id=p_assignment;
  perform public.touch_plan(p_day);
end; $$;

create or replace function public.clear_plan(p_day uuid,p_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff(true);
  perform public.lock_plan(p_day);
  if not exists(select 1 from public.planning_days where id=p_day and revision=p_revision) then
    raise exception 'The plan has changed. Review it before clearing.' using errcode='40001';
  end if;
  delete from public.daily_assignments where planning_day_id=p_day and attendance_status='expected';
  perform public.touch_plan(p_day);
end; $$;
commit;
