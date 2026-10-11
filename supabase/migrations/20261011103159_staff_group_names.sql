-- Enrolled staff can rename daily groups and optionally set future-day defaults.
create or replace function public.rename_group(p_day uuid,p_group uuid,p_name text,p_default boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff();
  perform public.lock_plan(p_day);
  if p_name is null or length(trim(p_name)) not between 1 and 40 then
    raise exception 'Group name must contain 1 to 40 characters' using errcode='22023';
  end if;
  update public.daily_group_labels set displayed_name=trim(p_name)
    where planning_day_id=p_day and group_id=p_group and workspace_id=public.current_workspace();
  if not found then raise exception 'Group not found'; end if;
  if p_default then
    update public.group_configurations set default_name=trim(p_name),updated_at=now()
      where id=p_group and workspace_id=public.current_workspace();
  end if;
  perform public.touch_plan(p_day);
end; $$;

revoke all on function public.rename_group(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.rename_group(uuid,uuid,text,boolean) to authenticated;
