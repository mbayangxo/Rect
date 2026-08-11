-- ============================================================
-- Track duration (seconds) — paste in Supabase SQL Editor → Run
-- Written by upload + playback; shown as mm:ss in the UI
-- ============================================================

alter table public.tracks
  add column if not exists duration_secs integer;

alter table public.tracks
  drop constraint if exists tracks_duration_secs_range;

alter table public.tracks
  add constraint tracks_duration_secs_range
  check (
    duration_secs is null
    or (duration_secs > 0 and duration_secs <= 7200)
  );

notify pgrst, 'reload schema';
