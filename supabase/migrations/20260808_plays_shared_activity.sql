-- Shared listening activity — paste in Supabase SQL Editor → Run
-- Lets anyone read plays for listeners who opted into privacy_show_activity.
-- Private journal UX still uses own-select; this powers public “listening now”
-- and artist “recent listeners” when service role is unavailable.

alter table public.plays enable row level security;

drop policy if exists "plays_select_shared_activity" on public.plays;
create policy "plays_select_shared_activity"
  on public.plays for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = listener_id
        and coalesce(u.privacy_show_activity, true) = true
    )
  );

notify pgrst, 'reload schema';
