-- ============================================================
-- Artists can delete their own tracks — paste in SQL Editor → Run
-- ============================================================

alter table public.tracks enable row level security;

drop policy if exists "tracks_delete_own" on public.tracks;
create policy "tracks_delete_own"
  on public.tracks for delete
  to authenticated
  using (artist_id = auth.uid());

notify pgrst, 'reload schema';
