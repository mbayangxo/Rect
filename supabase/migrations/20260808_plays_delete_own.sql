-- ============================================================
-- Listeners can delete their own play history
-- Paste in Supabase SQL Editor → Run
-- ============================================================

drop policy if exists "plays_delete_own" on public.plays;
create policy "plays_delete_own"
  on public.plays for delete
  to authenticated
  using (listener_id = auth.uid());

notify pgrst, 'reload schema';
