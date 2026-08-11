-- Playlist descriptions — paste in Supabase SQL Editor → Run
-- Optional blurb for private + public playlists

alter table public.playlists
  add column if not exists description text;

alter table public.playlists
  drop constraint if exists playlists_description_len;

alter table public.playlists
  add constraint playlists_description_len
  check (
    description is null
    or char_length(description) <= 280
  );
