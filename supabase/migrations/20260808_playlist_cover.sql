-- Playlist cover art — paste in Supabase SQL Editor → Run

alter table public.playlists
  add column if not exists cover_art_url text;
