-- Additive, unapplied locally-generated migration. Existing RPC permissions stay intact.
begin;
alter table public.dogs
  add column handling_notes text not null default '' check(length(handling_notes)<=5000),
  add column notes_version integer not null default 1 check(notes_version>0),
  add column notes_updated_at timestamptz,
  add column notes_updated_by text;

create table public.interaction_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces,
  dog_a uuid not null,
  dog_b uuid not null,
  level text not null check(level in ('hard','soft')),
  note text not null check(length(trim(note)) between 1 and 2000),
  version integer not null default 1 check(version>0),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by text not null,
  check(dog_a < dog_b),
  unique(workspace_id,dog_a,dog_b),
  foreign key(workspace_id,dog_a) references public.dogs(workspace_id,id),
  foreign key(workspace_id,dog_b) references public.dogs(workspace_id,id)
);
create index interaction_rules_dog_b on public.interaction_rules(workspace_id,dog_b);
alter table public.interaction_rules enable row level security;
revoke all on public.interaction_rules from public,anon,authenticated;
grant select on public.interaction_rules to authenticated;
create policy workspace_read on public.interaction_rules for select to authenticated
  using(workspace_id=(select public.current_workspace()));

-- No FK to a mutable staff profile: attribution survives enrollment/name changes.
create table public.behaviour_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces,
  entity_id uuid not null,
  event_type text not null check(event_type in ('notes_edited','rule_added','rule_edited','rule_removed')),
  before_value jsonb,
  after_value jsonb,
  actor_id uuid,
  actor_display_name text,
  occurred_at timestamptz not null default clock_timestamp()
);
create index behaviour_events_workspace on public.behaviour_events(workspace_id,id);
alter table public.behaviour_events enable row level security;
revoke all on public.behaviour_events from public,anon,authenticated;
grant select on public.behaviour_events to authenticated;
create policy workspace_read on public.behaviour_events for select to authenticated
  using(workspace_id=(select public.current_workspace()));
create trigger immutable_behaviour_events before update or delete or truncate on public.behaviour_events
  for each statement execute function public.reject_event_mutation();

create function public.record_behaviour_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb; v_workspace uuid; v_id uuid; v_kind text;
begin
  if TG_TABLE_NAME='dogs' then
    if old.notes_version=new.notes_version then return new; end if;
    v_before:=jsonb_build_object('notes',old.handling_notes,'version',old.notes_version);
    v_after:=jsonb_build_object('notes',new.handling_notes,'version',new.notes_version);
    v_workspace:=new.workspace_id; v_id:=new.id; v_kind:='notes_edited';
  else
    if TG_OP<>'INSERT' then v_before:=to_jsonb(old); end if;
    if TG_OP<>'DELETE' then v_after:=to_jsonb(new); end if;
    v_workspace:=coalesce(new.workspace_id,old.workspace_id); v_id:=coalesce(new.id,old.id);
    v_kind:=case TG_OP when 'INSERT' then 'rule_added' when 'UPDATE' then 'rule_edited' else 'rule_removed' end;
    -- Existing workspace-filtered dog Realtime events notify every date, including
    -- rule deletion. Avoid broadcasting unfilterable DELETE payloads for rules.
    update public.dogs set updated_at=clock_timestamp()
      where workspace_id=v_workspace and id in (coalesce(new.dog_a,old.dog_a),coalesce(new.dog_b,old.dog_b));
  end if;
  insert into public.behaviour_events(workspace_id,entity_id,event_type,before_value,after_value,actor_id,actor_display_name)
    values(v_workspace,v_id,v_kind,v_before,v_after,auth.uid(),(select display_name from public.staff_profiles where id=auth.uid()));
  return coalesce(new,old);
end; $$;
create trigger notes_history after update of notes_version on public.dogs
  for each row execute function public.record_behaviour_change();
create trigger rules_history after insert or update or delete on public.interaction_rules
  for each row execute function public.record_behaviour_change();
revoke all on function public.record_behaviour_change() from public,anon,authenticated;

create function public.set_handling_notes(p_dog uuid,p_notes text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.require_staff();
  if p_notes is null or length(p_notes)>5000 then raise exception 'Handling notes must be at most 5000 characters.' using errcode='22023'; end if;
  update public.dogs set handling_notes=trim(p_notes),notes_version=notes_version+1,
    notes_updated_at=clock_timestamp(),notes_updated_by=(select display_name from public.staff_profiles where id=auth.uid()),updated_at=clock_timestamp()
    where id=p_dog and workspace_id=public.current_workspace() and notes_version=p_version;
  if not found then raise exception 'Handling notes changed or unavailable. Cancel and reopen Edit notes to review the latest version. Your draft has not been saved.' using errcode='PT409'; end if;
end; $$;

create function public.save_interaction_rule(p_id uuid,p_dog_a uuid,p_dog_b uuid,p_level text,p_note text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_workspace uuid; v_a uuid:=least(p_dog_a,p_dog_b); v_b uuid:=greatest(p_dog_a,p_dog_b); v_actor text;
begin
  perform public.require_staff(); v_workspace:=public.current_workspace();
  if p_dog_a is null or p_dog_b is null or p_dog_a=p_dog_b then raise exception 'Choose two different dogs.' using errcode='22023'; end if;
  if p_level is null or p_level not in ('hard','soft') or p_note is null or length(trim(p_note)) not between 1 and 2000 then
    raise exception 'Choose Hard or Soft and enter a note (1–2000 characters).' using errcode='22023';
  end if;
  if (select count(*) from public.dogs where workspace_id=v_workspace and id in (v_a,v_b))<>2 then
    raise exception 'Dogs unavailable in your workspace.' using errcode='42501';
  end if;
  select display_name into v_actor from public.staff_profiles where id=auth.uid();
  if p_id is null then
    if p_version is not null then raise exception 'New rules must not supply a version.' using errcode='22023'; end if;
    insert into public.interaction_rules(workspace_id,dog_a,dog_b,level,note,updated_by)
      values(v_workspace,v_a,v_b,p_level,trim(p_note),v_actor);
  else
    update public.interaction_rules set level=p_level,note=trim(p_note),version=version+1,updated_at=clock_timestamp(),updated_by=v_actor
      where id=p_id and workspace_id=v_workspace and dog_a=v_a and dog_b=v_b and version=p_version;
    if not found then raise exception 'Interaction rule changed or was removed. Cancel and reopen to review it. Your draft has not been saved.' using errcode='PT409'; end if;
  end if;
exception when unique_violation then
  raise exception 'A rule already exists for this pair. Cancel and edit the existing rule.' using errcode='PT409';
end; $$;

create function public.remove_interaction_rule(p_id uuid,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.require_staff();
  delete from public.interaction_rules where id=p_id and workspace_id=public.current_workspace() and version=p_version;
  if not found then raise exception 'Interaction rule changed or was removed. Cancel and review the latest rule before removing it.' using errcode='PT409'; end if;
end; $$;
revoke all on function public.set_handling_notes(uuid,text,integer),public.save_interaction_rule(uuid,uuid,uuid,text,text,integer),public.remove_interaction_rule(uuid,integer) from public,anon,authenticated;
grant execute on function public.set_handling_notes(uuid,text,integer),public.save_interaction_rule(uuid,uuid,uuid,text,text,integer),public.remove_interaction_rule(uuid,integer) to authenticated;

create or replace function public.planning_snapshot(p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.require_staff();
  -- One statement for mutually consistent attendance, notes and pair rules.
  select jsonb_build_object(
    'day',to_jsonb(d),
    'groups',(select coalesce(jsonb_agg(jsonb_build_object('group_id',l.group_id,'displayed_name',l.displayed_name,'display_order',g.display_order,'run',l.run,'run_version',l.run_version) order by g.display_order),'[]') from public.daily_group_labels l join public.group_configurations g on g.id=l.group_id where l.planning_day_id=d.id),
    'assignments',(select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order,a.id),'[]') from public.daily_assignments a where a.planning_day_id=d.id),
    'dogs',(select coalesce(jsonb_agg(to_jsonb(dog) order by dog.name,dog.id),'[]') from public.dogs dog where dog.workspace_id=public.current_workspace() and (not dog.is_archived or exists(select 1 from public.daily_assignments a where a.planning_day_id=d.id and a.dog_id=dog.id) or exists(select 1 from public.interaction_rules r where r.workspace_id=dog.workspace_id and dog.id in (r.dog_a,r.dog_b)))),
    'rules',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'dogs',jsonb_build_array(r.dog_a,r.dog_b),'level',r.level,'note',r.note,'version',r.version,'active',true,'updated_at',r.updated_at,'updated_by',r.updated_by) order by r.id),'[]') from public.interaction_rules r where r.workspace_id=public.current_workspace())
  ) into result from public.planning_days d where d.local_date=p_date and d.workspace_id=public.current_workspace();
  if result is null then raise exception 'Planning day not found'; end if;
  return result;
end; $$;
commit;
