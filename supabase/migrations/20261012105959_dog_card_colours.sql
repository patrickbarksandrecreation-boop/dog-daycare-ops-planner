-- A dog-wide preference, independent of attendance, markers and handling notes.
alter table public.dogs
  add column card_colour text not null default '#ffffff'
    check (card_colour ~ '^#[0-9a-f]{6}$'),
  add column colour_version integer not null default 1 check (colour_version > 0);

-- Follow the existing membership-checked RPC write boundary. Direct table
-- writes remain denied; staff can change only colour through this operation.
create function public.set_dog_colour(p_dog uuid, p_colour text, p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff();
  if p_colour is null or p_colour !~* '^#[0-9a-f]{6}$' then
    raise exception 'Choose a valid card colour.' using errcode = '22023';
  end if;
  update public.dogs set card_colour = lower(p_colour),
    colour_version = colour_version + 1, updated_at = clock_timestamp()
    where id = p_dog and workspace_id = public.current_workspace()
      and colour_version = p_version;
  if not found then
    raise exception 'Card colour changed or unavailable. Cancel and review the latest colour before trying again.' using errcode = 'PT409';
  end if;
end; $$;
revoke all on function public.set_dog_colour(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.set_dog_colour(uuid, text, integer) to authenticated;

-- planning_snapshot already serialises complete dog rows; existing dogs
-- default to white and colour updates use the existing dogs Realtime stream.
