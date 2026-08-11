-- ============================================================
-- Public playlist sharing — paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.playlists
  add column if not exists is_public boolean not null default false;

create index if not exists playlists_public_idx
  on public.playlists (id)
  where is_public = true;

-- Owners always see their playlists; anyone can read public ones
drop policy if exists "playlists_select_own" on public.playlists;
drop policy if exists "playlists_select_own_or_public" on public.playlists;
drop policy if exists "playlists_select_public_anon" on public.playlists;

create policy "playlists_select_own_or_public"
  on public.playlists for select
  to authenticated
  using (user_id = auth.uid() or is_public = true);

create policy "playlists_select_public_anon"
  on public.playlists for select
  to anon
  using (is_public = true);

-- Playlist tracks readable when the parent playlist is yours or public
drop policy if exists "playlist_tracks_select_own" on public.playlist_tracks;
drop policy if exists "playlist_tracks_select_own_or_public" on public.playlist_tracks;
drop policy if exists "playlist_tracks_select_public_anon" on public.playlist_tracks;

create policy "playlist_tracks_select_own_or_public"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (p.user_id = auth.uid() or p.is_public = true)
    )
  );

create policy "playlist_tracks_select_public_anon"
  on public.playlist_tracks for select
  to anon
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.is_public = true
    )
  );

notify pgrst, 'reload schema';
