-- Seed one public demo track so Home can show real Supabase rows.
-- Run in Supabase SQL Editor (bypasses RLS). Safe to re-run.

insert into public.tracks (title, audio_url, genre)
select
  'SoundHelix Demo · RECT',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'afrobeats'
where not exists (
  select 1 from public.tracks where title = 'SoundHelix Demo · RECT'
);

-- Public read for discovery (home / logged-out listeners)
alter table public.tracks enable row level security;

drop policy if exists "tracks_select_public" on public.tracks;
create policy "tracks_select_public"
  on public.tracks for select
  to anon, authenticated
  using (true);

-- Artists can insert their own tracks later (artist_id = auth.uid())
drop policy if exists "tracks_insert_own" on public.tracks;
create policy "tracks_insert_own"
  on public.tracks for insert
  to authenticated
  with check (artist_id is null or artist_id = auth.uid());

drop policy if exists "tracks_update_own" on public.tracks;
create policy "tracks_update_own"
  on public.tracks for update
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());
