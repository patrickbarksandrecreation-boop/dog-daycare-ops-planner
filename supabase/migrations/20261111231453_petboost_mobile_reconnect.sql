begin;
-- One short-lived browser per workspace. No frontend role can inspect this
-- table or call its routines; the HTTPS endpoint validates a setup capability.
create table public.petboost_mobile_logins (
  workspace_id uuid primary key references public.petboost_sync(workspace_id),
  run_id uuid not null,
  setup_hash text not null check(setup_hash ~ '^[a-f0-9]{64}$'),
  worker_id uuid,
  public_key text check(public_key is null or length(public_key) between 40 and 200),
  expires_at timestamptz not null,
  status text not null check(status in ('starting','ready','busy','saved','failed','cancelled','expired')),
  revision integer not null default 0,
  view jsonb not null default '{}' check(octet_length(view::text)<=16000),
  command text check(command is null or length(command)<=24000),
  verification_id uuid,
  saved_at timestamptz
);
alter table public.petboost_mobile_logins enable row level security;
revoke all on public.petboost_mobile_logins from public,anon,authenticated,service_role;

create function public.petboost_mobile_request(p_workspace uuid,p_hash text,p_op text,p_run uuid,
  p_revision integer default null,p_command text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.petboost_session_setup; m public.petboost_mobile_logins; fresh boolean:=false;
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_run is null or p_op is null
    or p_op not in ('start','read','command','cancel') then return null; end if;
  -- All paths lock setup before mobile, including completion and cancellation.
  select * into s from public.petboost_session_setup where workspace_id=p_workspace for update;
  if not found then return null; end if;
  select * into m from public.petboost_mobile_logins where workspace_id=p_workspace for update;
  if p_op='start' then
    if s.token_hash is distinct from p_hash or s.consumed_at is not null or s.expires_at<=clock_timestamp() then return null; end if;
    if m.run_id is null or m.setup_hash is distinct from p_hash or m.expires_at<=clock_timestamp()
      or m.status in ('failed','cancelled','expired') then
      insert into public.petboost_mobile_logins(workspace_id,run_id,setup_hash,expires_at,status)
        values(p_workspace,p_run,p_hash,least(s.expires_at,clock_timestamp()+interval '7 minutes'),'starting')
        on conflict(workspace_id) do update set run_id=excluded.run_id,setup_hash=excluded.setup_hash,
          expires_at=excluded.expires_at,status='starting',worker_id=null,public_key=null,revision=0,view='{}',command=null,verification_id=null,saved_at=null
        returning * into m;
      fresh:=true;
    end if;
  else
    if m.run_id is distinct from p_run or m.setup_hash is distinct from p_hash then return null; end if;
    if m.status='saved' then
      -- Successful completion consumed this code. A newly issued code fences
      -- even status reads for the previous browser.
      if s.token_hash is not null or s.consumed_at is null then return null; end if;
      if m.saved_at+interval '15 minutes'<=clock_timestamp() then return null; end if;
    else
      if s.token_hash is distinct from p_hash or s.consumed_at is not null then return null; end if;
      if m.expires_at<=clock_timestamp() or s.expires_at<=clock_timestamp() then
        update public.petboost_mobile_logins set status='expired',command=null,view='{}' where workspace_id=p_workspace returning * into m;
      end if;
    end if;
    if p_op='command' then
      if m.status<>'ready' or m.revision is distinct from p_revision or m.command is not null then return jsonb_build_object('conflict',true); end if;
      if p_command is null or length(p_command) not between 20 and 24000 then raise exception 'Invalid login command'; end if;
      update public.petboost_mobile_logins set command=p_command,status='busy' where workspace_id=p_workspace returning * into m;
    elsif p_op='cancel' and m.status in ('starting','ready','busy') then
      update public.petboost_mobile_logins set status='cancelled',command=null,view='{}' where workspace_id=p_workspace returning * into m;
    end if;
  end if;
  return jsonb_build_object('run',m.run_id,'created',fresh,'status',m.status,'revision',m.revision,
    'view',case when m.status='ready' then m.view else '{}'::jsonb end,'expiresAt',m.expires_at,
    'verificationId',m.verification_id,'savedAt',m.saved_at,'publicKey',m.public_key);
end; $$;

create function public.petboost_mobile_worker(p_workspace uuid,p_run uuid,p_worker uuid,p_op text,
  p_view jsonb default null,p_state text default null,p_verification uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.petboost_session_setup; m public.petboost_mobile_logins; pending text;
begin
  if p_run is null or p_worker is null or p_op is null or p_op not in ('claim','take','publish','finish','fail') then return null; end if;
  select * into s from public.petboost_session_setup where workspace_id=p_workspace for update;
  select * into m from public.petboost_mobile_logins where workspace_id=p_workspace for update;
  if m.run_id is distinct from p_run or m.status not in ('starting','ready','busy') then return null; end if;
  if s.token_hash is distinct from m.setup_hash or s.consumed_at is not null or s.expires_at<=clock_timestamp() or m.expires_at<=clock_timestamp() then
    update public.petboost_mobile_logins set status='expired',command=null,view='{}' where workspace_id=p_workspace;
    return null;
  end if;
  if p_op='claim' then
    if m.worker_id is not null then return null; end if;
    if p_view->>'publicKey' is null or length(p_view->>'publicKey') not between 40 and 200 then raise exception 'Invalid login key'; end if;
    update public.petboost_mobile_logins set worker_id=p_worker,public_key=p_view->>'publicKey' where workspace_id=p_workspace;
    return jsonb_build_object('claimed',true);
  end if;
  if m.worker_id is distinct from p_worker then return null; end if;
  if p_op='take' then
    pending:=m.command;
    update public.petboost_mobile_logins set command=null where workspace_id=p_workspace;
    return jsonb_build_object('command',pending,'revision',m.revision);
  elsif p_op='publish' then
    if p_view is null or jsonb_typeof(p_view)<>'object' or octet_length(p_view::text)>16000 then raise exception 'Invalid login screen'; end if;
    -- A request can arrive between a poll and publishing. Never erase it.
    if m.command is not null then return jsonb_build_object('pending',true); end if;
    update public.petboost_mobile_logins set status='ready',view=p_view,revision=revision+1 where workspace_id=p_workspace;
  elsif p_op='finish' then
    if p_verification is null then raise exception 'Missing verification'; end if;
    perform public.complete_petboost_session_setup(p_workspace,m.setup_hash,p_state);
    update public.petboost_mobile_logins set status='saved',command=null,view='{}',verification_id=p_verification,
      saved_at=clock_timestamp() where workspace_id=p_workspace;
  elsif p_op='fail' then
    update public.petboost_mobile_logins set status='failed',command=null,view='{}' where workspace_id=p_workspace;
  end if;
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.petboost_mobile_request(uuid,text,text,uuid,integer,text),
  public.petboost_mobile_worker(uuid,uuid,uuid,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.petboost_mobile_request(uuid,text,text,uuid,integer,text),
  public.petboost_mobile_worker(uuid,uuid,uuid,text,jsonb,text,uuid) to service_role;
commit;
