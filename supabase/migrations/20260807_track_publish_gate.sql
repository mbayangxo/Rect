-- ============================================================
-- Publish gate — public can only select live tracks
-- Artists still see/edit their own drafts
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.tracks enable row level security;

drop policy if exists "tracks_select_public" on public.tracks;
create policy "tracks_select_public"
  on public.tracks for select
  to anon, authenticated
  using (
    artist_id = auth.uid()
    or coalesce(lower(status), 'published') not in ('pending', 'draft', 'unpublished')
    or status is null
  );

notify pgrst, 'reload schema';
