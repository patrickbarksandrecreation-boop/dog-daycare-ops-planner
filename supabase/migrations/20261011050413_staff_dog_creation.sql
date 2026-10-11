-- Enrolled staff may create active master dogs; profile updates remain manager-only.
begin;
create or replace function public.save_dog(p_id uuid,p_name text,p_photo text,p_archived boolean default false) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff();
  if exists(select 1 from public.dogs where id=p_id and workspace_id<>public.current_workspace()) then raise exception 'Dog unavailable' using errcode='42501'; end if;
  if p_photo is not null and p_photo not like public.current_workspace()::text || '/' || p_id::text || '/%' and not exists(select 1 from public.dogs where id=p_id and workspace_id=public.current_workspace() and photo_path=p_photo) then raise exception 'Invalid photo path'; end if;
  if not public.is_manager() then
    if p_archived is distinct from false then raise exception 'A manager must archive dogs' using errcode='42501'; end if;
    -- DO NOTHING is essential: an ID collision or concurrent create must never update a profile.
    insert into public.dogs(id,name,photo_path,is_archived) values(p_id,trim(p_name),p_photo,false)
      on conflict(id) do nothing;
    if not found then raise exception 'A manager must edit existing dogs' using errcode='42501'; end if;
    return;
  end if;
  insert into public.dogs(id,name,photo_path,is_archived) values(p_id,trim(p_name),p_photo,p_archived)
  on conflict(id) do update set name=excluded.name,photo_path=excluded.photo_path,is_archived=excluded.is_archived,updated_at=now()
    where public.dogs.workspace_id=public.current_workspace();
  if not found then raise exception 'Dog unavailable' using errcode='42501'; end if;
end; $$;
revoke all on function public.save_dog(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.save_dog(uuid,text,text,boolean) to authenticated;

-- The editor uploads before saving the new record. Existing-dog uploads, replacement
-- and deletion remain manager-only; the bucket stays private and uploads never upsert.
drop policy workspace_photos_insert on storage.objects;
create policy workspace_photos_insert on storage.objects for insert to authenticated with check(
  bucket_id='dog-photos' and public.is_staff()
  and split_part(name,'/',1)=public.current_workspace()::text
  and split_part(name,'/',2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name,'/',3)<>''
  and (public.is_manager() or not exists(
    select 1 from public.dogs d where d.workspace_id=public.current_workspace() and d.id::text=split_part(storage.objects.name,'/',2))));
commit;
