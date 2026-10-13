-- Additive API: existing single-dog drag/reorder and snapshots remain compatible.
begin;
create function public.move_assignments(p_day uuid, p_assignments jsonb, p_group uuid)
returns void language plpgsql security definer set search_path='' as $$
declare selected_ids uuid[]; selected_count integer; ordered uuid[];
begin
  -- Serialize with every existing move/attendance/booking mutation and authorize
  -- the day before reading selection records, including foreign workspace IDs.
  perform public.lock_plan(p_day);
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Select dogs before moving.' using errcode='22023';
  end if;
  selected_count := jsonb_array_length(p_assignments);
  if selected_count = 0 or exists (
    select 1 from jsonb_array_elements(p_assignments) s
    where jsonb_typeof(s) <> 'object' or not (s ?& array['id','version','group_id'])
      or s->>'id' is null or s->>'version' is null
  ) then raise exception 'Invalid dog selection. No selected dogs moved.' using errcode='22023'; end if;
  -- Preserve client selection order rather than relying on JSON object fields.
  select array_agg((s.value->>'id')::uuid order by s.ordinality) into selected_ids
    from jsonb_array_elements(p_assignments) with ordinality s;
  if (select count(distinct id) from unnest(selected_ids) id) <> selected_count then
    raise exception 'Select distinct dogs. No selected dogs moved.' using errcode='22023';
  end if;
  if p_group is not null and not exists (
    select 1 from public.daily_group_labels where planning_day_id=p_day and group_id=p_group
  ) then raise exception 'Invalid destination. No selected dogs moved.' using errcode='22023'; end if;
  -- Validate the entire set before writing anything. NULL is a valid Unassigned
  -- source, but missing versions/locations and departed records are invalid.
  if exists (
    select 1 from jsonb_to_recordset(p_assignments) as s(id uuid, version integer, group_id uuid)
    left join public.daily_assignments a on a.id=s.id and a.planning_day_id=p_day
    where a.id is null or a.version is distinct from s.version
      or a.group_id is distinct from s.group_id or a.attendance_status='departed'
  ) then
    raise exception 'A selected dog changed or is unavailable. No selected dogs moved. Review the refreshed board and select again.' using errcode='PT409';
  end if;
  select coalesce(array_agg(id order by sort_order,id),'{}') into ordered
    from public.daily_assignments where planning_day_id=p_day
      and group_id is not distinct from p_group and attendance_status<>'departed'
      and not (id=any(selected_ids));
  ordered := ordered || selected_ids;
  -- Existing trigger records one attributed movement event per selected dog.
  -- Attendance, timestamps and master profiles remain untouched.
  update public.daily_assignments set group_id=p_group,version=version+1,
    updated_at=now(),updated_by=auth.uid()
    where planning_day_id=p_day and id=any(selected_ids);
  update public.daily_assignments a set sort_order=ranks.pos-1
    from unnest(ordered) with ordinality as ranks(id,pos)
    where a.id=ranks.id and a.planning_day_id=p_day and a.sort_order<>ranks.pos-1;
  perform public.touch_plan(p_day);
end; $$;
revoke all on function public.move_assignments(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.move_assignments(uuid,jsonb,uuid) to authenticated;
commit;
