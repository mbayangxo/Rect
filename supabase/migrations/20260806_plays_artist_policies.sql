-- Plays + tracks policies so listening and artist stats actually save/read.
-- Run in Supabase SQL Editor (optional if API uses service role, still recommended).

alter table public.plays enable row level security;

drop policy if exists "plays_insert_own" on public.plays;
create policy "plays_insert_own"
  on public.plays for insert
  to authenticated
  with check (listener_id = auth.uid());

drop policy if exists "plays_select_own" on public.plays;
create policy "plays_select_own"
  on public.plays for select
  to authenticated
  using (listener_id = auth.uid());

drop policy if exists "plays_select_artist_tracks" on public.plays;
create policy "plays_select_artist_tracks"
  on public.plays for select
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id and t.artist_id = auth.uid()
    )
  );

-- Tracks: public read stays; artists manage own rows
alter table public.tracks enable row level security;

drop policy if exists "tracks_select_public" on public.tracks;
create policy "tracks_select_public"
  on public.tracks for select
  to anon, authenticated
  using (true);

drop policy if exists "tracks_insert_own" on public.tracks;
create policy "tracks_insert_own"
  on public.tracks for insert
  to authenticated
  with check (artist_id = auth.uid());

drop policy if exists "tracks_update_own" on public.tracks;
create policy "tracks_update_own"
  on public.tracks for update
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());
