begin;
alter table public.dogs
  add column first_name text check (first_name is null or length(trim(first_name)) between 1 and 80),
  add column last_initial text check (last_initial is null or last_initial ~ '^[A-Z]$'),
  add column breed text check (breed is null or length(trim(breed)) between 1 and 160),
  add column source_system text,
  add column source_pet_id text,
  add column photo_kind text check (photo_kind is null or photo_kind in ('profile','breed_placeholder','missing')),
  add constraint dogs_source_identity_pair check (
    (source_system is null and source_pet_id is null) or
    (source_system is not null and source_pet_id is not null and
     length(trim(source_system)) between 1 and 40 and length(trim(source_pet_id)) between 1 and 160));
create unique index dogs_workspace_source_identity on public.dogs(workspace_id,source_system,source_pet_id)
  where source_system is not null and source_pet_id is not null;
comment on column public.dogs.breed is 'Source breed description; display support can be added independently.';
comment on column public.dogs.photo_kind is 'Import provenance: supplied profile image, generic breed placeholder, or missing image.';
commit;
