begin;
alter table public.petboost_sync add column worker_mode text not null default 'persistent' check(worker_mode in ('persistent','netlify'));
alter table public.petboost_sync add column netlify_verified_at timestamptz;
alter table public.petboost_sync add column verification_run_id uuid;
alter table public.petboost_sync add column verification_finished_at timestamptz;
create or replace function public.require_petboost_worker_verified(p_workspace uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.petboost_sync where workspace_id=p_workspace and worker_mode='netlify' and netlify_verified_at is null) then
    raise exception 'Verify Petboost session on Netlify before enabling imports';
  end if;
end; $$;
create table public.petboost_sessions (
  workspace_id uuid primary key references public.workspaces,
  encrypted_state text not null check(length(encrypted_state) between 20 and 2000000),
  updated_at timestamptz not null default now()
);
alter table public.petboost_sessions enable row level security;
revoke all on public.petboost_sessions from public,anon,authenticated,service_role;
-- Only the worker's service role can call these routines. No API exposes plaintext.
create function public.read_petboost_session(p_workspace uuid) returns text
language sql security definer set search_path='' as $$
  select encrypted_state from public.petboost_sessions where workspace_id=p_workspace;
$$;
create function public.save_petboost_session(p_workspace uuid,p_state text,p_run uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.petboost_sync where workspace_id=p_workspace for update;
  if not found then raise exception 'Configure Petboost sync first'; end if;
  if p_run is not null and not exists(select 1 from public.petboost_sync where workspace_id=p_workspace and run_id=p_run and lease_until>clock_timestamp()) then
    raise exception 'Expired sync lease';
  end if;
  insert into public.petboost_sessions(workspace_id,encrypted_state) values(p_workspace,p_state)
    on conflict(workspace_id) do update set encrypted_state=excluded.encrypted_state,updated_at=clock_timestamp();
  -- A renewed login fences any older reader before it can overwrite the session.
  if p_run is null then
    update public.petboost_sync set netlify_verified_at=null,run_id=null,lease_until=null,
      verification_run_id=null,verification_finished_at=null,last_error_code=null where workspace_id=p_workspace;
  end if;
end; $$;
revoke all on function public.read_petboost_session(uuid),public.save_petboost_session(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_petboost_session(uuid),public.save_petboost_session(uuid,text,uuid) to service_role;
create function public.petboost_kick_access(p_workspace uuid,p_user uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object(
    'authorized',exists(select 1 from public.staff_profiles where id=p_user and workspace_id=p_workspace),
    'pending',exists(select 1 from public.petboost_sync where workspace_id=p_workspace and enabled
      and requested_at is not null and (claimed_request_at is null or requested_at>claimed_request_at))
  );
$$;
revoke all on function public.petboost_kick_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.petboost_kick_access(uuid,uuid) to service_role;
create function public.claim_petboost_verification(p_workspace uuid,p_run uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.petboost_sync;
begin
  select * into s from public.petboost_sync where workspace_id=p_workspace for update;
  if not found or s.worker_mode<>'netlify' or p_run is null then raise exception 'Configure Netlify verification first'; end if;
  if s.lease_until>clock_timestamp() then return null; end if;
  update public.petboost_sync set run_id=p_run,lease_until=clock_timestamp()+interval '8 minutes',
    verification_run_id=p_run,verification_finished_at=null,netlify_verified_at=null,last_error_code=null
    where workspace_id=p_workspace;
  return p_run;
end; $$;
create function public.finish_petboost_verification(p_workspace uuid,p_run uuid,p_code text default null) returns void
language sql security definer set search_path='' as $$
  update public.petboost_sync set netlify_verified_at=case when p_code is null then clock_timestamp() else null end,
    last_error_code=p_code,verification_finished_at=clock_timestamp(),run_id=null,lease_until=null
    where workspace_id=p_workspace and run_id=p_run and verification_run_id=p_run and lease_until>clock_timestamp();
$$;
create function public.read_petboost_verification(p_workspace uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('run_id',verification_run_id,'finished_at',verification_finished_at,
    'verified_at',netlify_verified_at,'error',last_error_code) from public.petboost_sync where workspace_id=p_workspace;
$$;
revoke all on function public.claim_petboost_verification(uuid,uuid),public.finish_petboost_verification(uuid,uuid,text),public.read_petboost_verification(uuid) from public,anon,authenticated;
grant execute on function public.claim_petboost_verification(uuid,uuid),public.finish_petboost_verification(uuid,uuid,text),public.read_petboost_verification(uuid) to service_role;
commit;
