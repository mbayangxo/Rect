-- Public listener + artist profiles readable when privacy_public_profile is on.
-- Paste in Supabase SQL Editor → Run
-- (Keeps own-row access; discovery already used artist-only select.)

alter table public.users enable row level security;

drop policy if exists "users_select_artists_public" on public.users;
drop policy if exists "users_select_public_profiles" on public.users;

create policy "users_select_public_profiles"
  on public.users for select
  to anon, authenticated
  using (
    id = auth.uid()
    or coalesce(privacy_public_profile, true) = true
  );

notify pgrst, 'reload schema';
