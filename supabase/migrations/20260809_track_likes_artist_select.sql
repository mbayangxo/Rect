-- ============================================================
-- Artist can list who liked their tracks — paste in Supabase SQL Editor → Run
-- Requires 20260807_track_likes.sql
-- ============================================================

-- Owners read likes on their own tracks (inbox already notifies; this closes the roster loop)
drop policy if exists "track_likes_select_as_artist" on public.track_likes;
create policy "track_likes_select_as_artist"
  on public.track_likes for select
  to authenticated
  using (
    exists (
      select 1
      from public.tracks t
      where t.id::text = track_likes.track_id
        and t.artist_id::text = auth.uid()::text
    )
  );

notify pgrst, 'reload schema';
