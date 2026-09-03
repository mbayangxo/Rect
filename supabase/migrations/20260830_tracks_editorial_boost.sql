-- Optional editorial boost for RECT SCORE (0–100). Paste in Supabase SQL Editor → Run.

alter table public.tracks
  add column if not exists editorial_boost smallint not null default 0;

alter table public.tracks
  drop constraint if exists tracks_editorial_boost_check;

alter table public.tracks
  add constraint tracks_editorial_boost_check
  check (editorial_boost >= 0 and editorial_boost <= 100);

notify pgrst, 'reload schema';
