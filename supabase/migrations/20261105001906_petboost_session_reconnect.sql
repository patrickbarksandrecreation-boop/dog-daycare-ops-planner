begin;
-- No frontend or direct service table access. Only an owner/service-issued,
-- expiring SHA-256 capability can replace the encrypted worker login once.
create table public.petboost_session_setup (
  workspace_id uuid primary key references public.petboost_sync(workspace_id),
  token_hash text check(token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table public.petboost_session_setup enable row level security;
revoke all on public.petboost_session_setup from public,anon,authenticated,service_role;
create function public.prepare_petboost_session_setup(p_workspace uuid,p_hash text,p_minutes integer default 30) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_minutes is null or p_minutes not between 1 and 60 then
    raise exception 'Invalid reconnect configuration';
  end if;
  insert into public.petboost_session_setup(workspace_id,token_hash,expires_at)
    values(p_workspace,p_hash,clock_timestamp()+make_interval(mins=>p_minutes))
    on conflict(workspace_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,consumed_at=null;
end; $$;
create function public.check_petboost_session_setup(p_workspace uuid,p_hash text) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from public.petboost_session_setup where workspace_id=p_workspace
    and token_hash=p_hash and consumed_at is null and expires_at>clock_timestamp());
$$;
create function public.complete_petboost_session_setup(p_workspace uuid,p_hash text,p_state text) returns void
language plpgsql security definer set search_path='' as $$
declare setup public.petboost_session_setup;
begin
  select * into setup from public.petboost_session_setup where workspace_id=p_workspace for update;
  if not found or p_hash is null or setup.token_hash is distinct from p_hash
    or setup.consumed_at is not null or setup.expires_at<=clock_timestamp() then
    raise exception 'Reconnect code is missing or expired';
  end if;
  perform public.save_petboost_session(p_workspace,p_state,null);
  update public.petboost_session_setup set token_hash=null,consumed_at=clock_timestamp() where workspace_id=p_workspace;
end; $$;
revoke all on function public.prepare_petboost_session_setup(uuid,text,integer),public.check_petboost_session_setup(uuid,text),public.complete_petboost_session_setup(uuid,text,text) from public,anon,authenticated;
grant execute on function public.prepare_petboost_session_setup(uuid,text,integer),public.check_petboost_session_setup(uuid,text),public.complete_petboost_session_setup(uuid,text,text) to service_role;
commit;
