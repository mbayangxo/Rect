-- ============================================================
-- Track language — paste in Supabase SQL Editor → Run
-- Powers language chips on upload/edit + taste-aware discovery
-- ============================================================

alter table public.tracks
  add column if not exists language text;

create index if not exists tracks_language_idx
  on public.tracks (language)
  where language is not null;

notify pgrst, 'reload schema';
