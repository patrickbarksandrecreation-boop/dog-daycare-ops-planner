-- Operational dog markers and daily group locations. Apply after 003.
begin;
alter table public.dogs
  add column groomed boolean not null default false,
  add column no_waterpark boolean not null default false,
  add column marker_version integer not null default 1;
alter table public.daily_group_labels
  add column run text check(run in ('Water park','Playground','Farm','Small indoor','A-Frame')),
  add column run_version integer not null default 1;

create function public.set_dog_markers(p_dog uuid,p_groomed boolean,p_no_waterpark boolean,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.require_staff();
  update public.dogs set groomed=p_groomed,no_waterpark=p_no_waterpark,
    marker_version=marker_version+1,updated_at=now()
    where id=p_dog and workspace_id=public.current_workspace() and marker_version=p_version;
  if not found then raise exception 'Dog markers changed or unavailable. Refresh and try again.' using errcode='40001'; end if;
end; $$;
create function public.set_group_run(p_day uuid,p_group uuid,p_run text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.lock_plan(p_day);
  update public.daily_group_labels set run=p_run,run_version=run_version+1
    where planning_day_id=p_day and group_id=p_group and workspace_id=public.current_workspace() and run_version=p_version;
  if not found then raise exception 'Group run changed or unavailable. Refresh and try again.' using errcode='40001'; end if;
  perform public.touch_plan(p_day);
end; $$;
revoke all on function public.set_dog_markers(uuid,boolean,boolean,integer),public.set_group_run(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.set_dog_markers(uuid,boolean,boolean,integer),public.set_group_run(uuid,uuid,text,integer) to authenticated;

create or replace function public.planning_snapshot(p_date date) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.require_staff();
  -- Single statement snapshot: counts and roster derive from this same assignment set.
  select jsonb_build_object(
    'day', to_jsonb(d),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('group_id',l.group_id,'displayed_name',l.displayed_name,'display_order',g.display_order,'run',l.run,'run_version',l.run_version) order by g.display_order),'[]') from public.daily_group_labels l join public.group_configurations g on g.id=l.group_id where l.planning_day_id=d.id),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order,a.id),'[]') from public.daily_assignments a where a.planning_day_id=d.id),
    'dogs', (select coalesce(jsonb_agg(to_jsonb(dog) order by dog.name,dog.id),'[]') from public.dogs dog where dog.workspace_id=public.current_workspace() and (not dog.is_archived or exists(select 1 from public.daily_assignments a where a.planning_day_id=d.id and a.dog_id=dog.id)))
  ) into result from public.planning_days d where d.local_date=p_date and d.workspace_id=public.current_workspace();
  if result is null then raise exception 'Planning day not found'; end if;
  return result;
end; $$;
commit;
