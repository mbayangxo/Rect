-- Track lyrics (plain text / timed-line friendly). Safe to re-run.

alter table public.tracks
  add column if not exists lyrics text;

comment on column public.tracks.lyrics is
  'Song lyrics as plain text. Artist-owned; visible with the track to fans.';

notify pgrst, 'reload schema';
