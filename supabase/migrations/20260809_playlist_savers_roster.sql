-- ============================================================
-- Playlist savers roster + tighter RLS — paste in Supabase SQL Editor → Run
-- Requires 20260809_playlist_follows.sql
-- ============================================================

-- Stop open scrape of all saver rows; owners + own follows still readable
drop policy if exists "playlist_follows_select_public" on public.playlist_follows;

-- Public save counts without exposing the full roster
create or replace function public.playlist_save_count(p_playlist_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_public boolean;
  v_owner uuid;
begin
  if p_playlist_id is null then
    return 0;
  end if;

  select p.is_public, p.user_id
  into v_public, v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    return 0;
  end if;

  -- Private mixes: only owner sees a count
  if v_public is distinct from true and v_owner is distinct from auth.uid() then
    return 0;
  end if;

  select count(*)::integer into v_count
  from public.playlist_follows
  where playlist_id = p_playlist_id;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.playlist_save_count(uuid) from public;
grant execute on function public.playlist_save_count(uuid) to authenticated, anon;

notify pgrst, 'reload schema';
