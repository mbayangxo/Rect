-- ============================================================
-- Chart privacy — exclude opted-out listeners from rankings
-- Paste in Supabase SQL Editor → Run
-- ============================================================

-- Ensure columns exist (no-op if already applied)
alter table public.users
  add column if not exists privacy_public_profile boolean not null default true,
  add column if not exists privacy_show_activity boolean not null default true,
  add column if not exists privacy_show_on_charts boolean not null default true;

-- Rebuild aggregate so charts / featured honor privacy_show_on_charts
create or replace view public.track_play_counts
with (security_invoker = false)
as
select
  p.track_id,
  count(*)::integer as play_count
from public.plays p
left join public.users u on u.id = p.listener_id
where coalesce(u.privacy_show_on_charts, true) = true
group by p.track_id;

grant select on public.track_play_counts to anon, authenticated;

notify pgrst, 'reload schema';
