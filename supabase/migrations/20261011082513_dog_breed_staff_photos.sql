-- Additive: breed may already exist from the separately applied metadata import.
begin;
alter table public.dogs add column if not exists breed text;
alter table public.dogs add constraint dogs_breed_input_length check (breed is null or length(trim(breed)) between 1 and 160) not valid;

-- Isolated storage lifecycle; no client table grants. Tombstones prevent path reuse.
create schema if not exists private;
create table private.dog_photo_objects (
  path text primary key,
  workspace_id uuid not null references public.workspaces(id),
  dog_id uuid not null references public.dogs(id),
  actor_id uuid,
  state text not null check (state in ('pending','current','retired')),
  created_at timestamptz not null default now(),
  cleanup_after timestamptz not null default now(),
  deleted_at timestamptz
);
alter table private.dog_photo_objects enable row level security;
revoke all on private.dog_photo_objects from public,anon,authenticated;
create index dog_photo_cleanup on private.dog_photo_objects(workspace_id,created_at) where state in ('pending','retired') and deleted_at is null;
insert into private.dog_photo_objects(path,workspace_id,dog_id,state)
select distinct on (photo_path) photo_path,workspace_id,id,'current' from public.dogs where photo_path is not null;

-- Existing profile saves cannot restore a stale image. Photos have a separate API.
create function public.save_dog(p_id uuid,p_name text,p_photo text,p_archived boolean,p_breed text) returns void
language plpgsql security definer set search_path='' as $$
declare existing public.dogs; w uuid;
begin
  perform public.require_staff(); w:=public.current_workspace();
  select * into existing from public.dogs where id=p_id for update;
  if found then
    if existing.workspace_id<>w then raise exception 'Dog unavailable' using errcode='42501'; end if;
    if not public.is_manager() then raise exception 'A manager must edit existing dogs' using errcode='42501'; end if;
    update public.dogs set name=trim(p_name),breed=nullif(trim(p_breed),''),is_archived=p_archived,updated_at=now() where id=p_id;
  else
    if not public.is_manager() and p_archived is distinct from false then raise exception 'A manager must archive dogs' using errcode='42501'; end if;
    if p_photo is not null and (p_photo not like w::text||'/'||p_id::text||'/%' or exists(select 1 from private.dog_photo_objects where path=p_photo)) then raise exception 'Invalid photo path'; end if;
    insert into public.dogs(id,name,photo_path,is_archived,breed) values(p_id,trim(p_name),p_photo,p_archived,nullif(trim(p_breed),'')) on conflict(id) do nothing;
    if not found then raise exception 'Dog already exists; refresh and try again' using errcode='PT409'; end if;
    if p_photo is not null then insert into private.dog_photo_objects(path,workspace_id,dog_id,state) values(p_photo,w,p_id,'current'); end if;
  end if;
end $$;
-- Keep old clients working without clearing newly recorded breeds.
create or replace function public.save_dog(p_id uuid,p_name text,p_photo text,p_archived boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.save_dog(p_id,p_name,p_photo,p_archived,(select breed from public.dogs where id=p_id and workspace_id=public.current_workspace()));
end $$;
revoke all on function public.save_dog(uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.save_dog(uuid,text,text,boolean,text) to authenticated;

-- Service-only endpoints. The Edge Function supplies a verified Auth user ID;
-- membership is checked again inside each transaction, never taken from metadata.
create function public.reserve_dog_photo(p_actor uuid,p_dog uuid,p_extension text) returns text
language plpgsql security definer set search_path='' as $$
declare w uuid; path text;
begin
  select workspace_id into w from public.staff_profiles where id=p_actor;
  if w is null or not exists(select 1 from public.dogs where id=p_dog and workspace_id=w) then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_extension not in ('jpg','png','webp') or p_extension is null then raise exception 'Invalid image type'; end if;
  path:=w::text||'/'||p_dog::text||'/replacement-'||gen_random_uuid()::text||'.'||p_extension;
  insert into private.dog_photo_objects(path,workspace_id,dog_id,actor_id,state) values(path,w,p_dog,p_actor,'pending');
  return path;
end $$;
create function public.commit_dog_photo(p_actor uuid,p_dog uuid,p_path text,p_expected text) returns void
language plpgsql security definer set search_path='' as $$
declare w uuid; old_path text;
begin
  select workspace_id into w from public.staff_profiles where id=p_actor;
  if w is null then raise exception 'Staff access required' using errcode='42501'; end if;
  select photo_path into old_path from public.dogs where id=p_dog and workspace_id=w for update;
  if not found then raise exception 'Dog unavailable' using errcode='42501'; end if;
  -- Locking the pending row serializes commit with expiration/cleanup.
  perform 1 from private.dog_photo_objects where path=p_path and workspace_id=w and dog_id=p_dog and actor_id=p_actor and state='pending' for update;
  if not found then raise exception 'Replacement unavailable' using errcode='PT409'; end if;
  if old_path is distinct from p_expected then raise exception 'Photo changed. Refresh and try again.' using errcode='PT409'; end if;
  if not exists(select 1 from storage.objects where bucket_id='dog-photos' and name=p_path) then raise exception 'Upload is not complete'; end if;
  update public.dogs set photo_path=p_path,photo_kind='profile',updated_at=now() where id=p_dog;
  update private.dog_photo_objects set state='current' where path=p_path;
  update private.dog_photo_objects set state='retired' where path=old_path
    and not exists(select 1 from public.dogs where photo_path=old_path);
end $$;
create function public.retire_dog_photo(p_actor uuid,p_path text) returns void
language plpgsql security definer set search_path='' as $$
begin
  -- On failed/ambiguous upload or commit: never retire an already committed image.
  update private.dog_photo_objects set state='retired',cleanup_after=now()+interval '24 hours' where path=p_path and actor_id=p_actor and state='pending'
    and workspace_id=(select workspace_id from public.staff_profiles where id=p_actor);
end $$;
create function public.dog_photo_cleanup(p_actor uuid) returns setof text
language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
  select workspace_id into w from public.staff_profiles where id=p_actor;
  if w is null then raise exception 'Staff access required' using errcode='42501'; end if;
  update private.dog_photo_objects set state='retired' where workspace_id=w and state='pending' and created_at<now()-interval '24 hours';
  return query select path from private.dog_photo_objects o where workspace_id=w and state='retired' and deleted_at is null and cleanup_after<=now()
    and not exists(select 1 from public.dogs d where d.photo_path=o.path) order by created_at limit 50;
end $$;
create function public.ack_dog_photo_cleanup(p_actor uuid,p_paths text[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  update private.dog_photo_objects set deleted_at=now() where path=any(p_paths) and state='retired'
    and workspace_id=(select workspace_id from public.staff_profiles where id=p_actor);
end $$;
revoke all on function public.reserve_dog_photo(uuid,uuid,text), public.commit_dog_photo(uuid,uuid,text,text), public.retire_dog_photo(uuid,text), public.dog_photo_cleanup(uuid), public.ack_dog_photo_cleanup(uuid,text[]) from public,anon,authenticated;
grant execute on function public.reserve_dog_photo(uuid,uuid,text), public.commit_dog_photo(uuid,uuid,text,text), public.retire_dog_photo(uuid,text), public.dog_photo_cleanup(uuid), public.ack_dog_photo_cleanup(uuid,text[]) to service_role;

-- Uploading a new dog's initial photo stays available. Replacement upload and
-- all deletion now go through the narrow server operation, including managers.
drop policy workspace_photos_insert on storage.objects;
create policy workspace_photos_insert on storage.objects for insert to authenticated with check(
  bucket_id='dog-photos' and public.is_staff() and split_part(name,'/',1)=public.current_workspace()::text
  and split_part(name,'/',2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name,'/',3)<>''
  and not exists(select 1 from public.dogs d where d.workspace_id=public.current_workspace() and d.id::text=split_part(storage.objects.name,'/',2)));
drop policy workspace_photos_delete on storage.objects;
-- Correct qualification of legacy photo references and require active membership.
drop policy workspace_photos_read on storage.objects;
create policy workspace_photos_read on storage.objects for select to authenticated using(
  bucket_id='dog-photos' and public.is_staff() and (split_part(name,'/',1)=public.current_workspace()::text
  or exists(select 1 from public.dogs d where d.photo_path=storage.objects.name and d.workspace_id=public.current_workspace())));
commit;
