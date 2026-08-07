-- Public read of other artists for Portals / discovery
-- (needed when service role is unavailable on the server)

alter table public.users enable row level security;

drop policy if exists "users_select_artists_public" on public.users;
create policy "users_select_artists_public"
  on public.users for select
  to anon, authenticated
  using (
    account_type = 'artist'
    or role = 'artist'
    or id = auth.uid()
  );

-- Aggregate play counts without exposing individual play rows
create or replace view public.track_play_counts
with (security_invoker = false)
as
select
  track_id,
  count(*)::integer as play_count
from public.plays
group by track_id;

grant select on public.track_play_counts to anon, authenticated;
