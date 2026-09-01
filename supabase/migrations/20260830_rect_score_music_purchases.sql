-- RECT SCORE — music purchase signals (album, CD, vinyl) on merch items
-- Song downloads use track_download_purchases (monetization_stack migration).

alter table public.artist_merch_items
  add column if not exists music_format text
  check (music_format is null or music_format in ('album', 'cd', 'vinyl'));

alter table public.artist_merch_items
  add column if not exists track_id uuid references public.tracks (id) on delete set null;

create index if not exists artist_merch_items_track_id_idx
  on public.artist_merch_items (track_id)
  where track_id is not null;

create index if not exists artist_merch_items_music_format_idx
  on public.artist_merch_items (music_format)
  where music_format is not null;
