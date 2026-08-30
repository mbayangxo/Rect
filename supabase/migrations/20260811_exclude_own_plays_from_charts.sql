-- ============================================================
-- Exclude artist self-listens from chart / featured play counts
-- Paste in Supabase SQL Editor → Run (after chart privacy migration)
-- ============================================================

create or replace view public.track_play_counts
with (security_invoker = false)
as
select
  p.track_id,
  count(*)::integer as play_count
from public.plays p
inner join public.tracks t on t.id = p.track_id
left join public.users u on u.id = p.listener_id
where coalesce(u.privacy_show_on_charts, true) = true
  and (p.listener_id is null or p.listener_id <> t.artist_id)
group by p.track_id;

grant select on public.track_play_counts to anon, authenticated;

notify pgrst, 'reload schema';
