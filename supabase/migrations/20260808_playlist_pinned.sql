-- Pin playlists to top of Your mixes — paste in Supabase SQL Editor → Run

alter table public.playlists
  add column if not exists pinned_at timestamptz null;

create index if not exists playlists_user_pinned_idx
  on public.playlists (user_id, pinned_at desc nulls last, updated_at desc);

notify pgrst, 'reload schema';
