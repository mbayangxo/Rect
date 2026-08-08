-- ============================================================
-- Public track like counts — paste in Supabase SQL Editor → Run
-- ============================================================

create or replace view public.track_like_counts
with (security_invoker = false)
as
select
  track_id,
  count(*)::integer as like_count
from public.track_likes
group by track_id;

grant select on public.track_like_counts to anon, authenticated;

notify pgrst, 'reload schema';
