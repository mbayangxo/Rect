-- ============================================================
-- Public liked songs (opt-in) — paste in Supabase SQL Editor → Run
-- Requires track_likes + user privacy columns
-- ============================================================

alter table public.users
  add column if not exists privacy_show_likes boolean not null default false;

-- When profile is public AND show-likes is on, anyone can read that user's like rows
drop policy if exists "track_likes_select_public_shared" on public.track_likes;
create policy "track_likes_select_public_shared"
  on public.track_likes for select
  to authenticated, anon
  using (
    exists (
      select 1
      from public.users u
      where u.id = track_likes.user_id
        and coalesce(u.privacy_public_profile, true) = true
        and coalesce(u.privacy_show_likes, false) = true
    )
  );

notify pgrst, 'reload schema';
