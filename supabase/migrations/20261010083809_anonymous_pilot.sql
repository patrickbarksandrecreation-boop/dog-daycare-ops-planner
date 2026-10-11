begin;
alter table public.workspaces add column anonymous_pilot_enabled boolean not null default false;
-- Only the deliberately fictional pilot accepts self-enrolment.
update public.workspaces set anonymous_pilot_enabled=true where id='00000000-0000-4000-8000-000000000001';
create table public.pilot_enrollments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enrolled_at timestamptz not null default now()
);
alter table public.pilot_enrollments enable row level security;
revoke all on public.pilot_enrollments from public,anon,authenticated;
create function public.join_synthetic_pilot(p_display_name text) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_workspace uuid;
begin
  if v_user is null or not exists(select 1 from auth.users where id=v_user and is_anonymous) then
    raise exception 'An anonymous pilot session is required' using errcode='42501';
  end if;
  if p_display_name is null or length(trim(p_display_name)) not between 1 and 80 then raise exception 'Enter a display name (1–80 characters)'; end if;
  -- Serialize repeated enrolment requests for one identity, without allowing
  -- the caller to choose a workspace or role. Existing memberships are untouched.
  perform 1 from auth.users where id=v_user for update;
  if exists(select 1 from public.staff_profiles where id=v_user) then return; end if;
  if exists(select 1 from public.pilot_enrollments where user_id=v_user) then
    raise exception 'Pilot access was removed. Contact the project owner.' using errcode='42501';
  end if;
  select id into v_workspace from public.workspaces
    where id='00000000-0000-4000-8000-000000000001' and anonymous_pilot_enabled for share;
  if v_workspace is null then raise exception 'Pilot enrolment is closed' using errcode='42501'; end if;
  insert into public.staff_profiles(id,display_name,role,workspace_id) values(v_user,trim(p_display_name),'staff',v_workspace);
  insert into public.pilot_enrollments(user_id) values(v_user);
end; $$;
revoke all on function public.join_synthetic_pilot(text) from public,anon,authenticated;
grant execute on function public.join_synthetic_pilot(text) to authenticated;
commit;
