-- ============================================================
-- Discovery trending — songs, portals, Live Rooms by geo
-- Paste after live_rooms migrations
-- ============================================================

create or replace function public.trending_tracks(p_limit integer default 20)
returns table (
  track_id uuid,
  title text,
  artist_id uuid,
  play_count bigint,
  cover_art_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id as track_id,
    t.title,
    t.artist_id,
    coalesce(c.play_count, 0)::bigint as play_count,
    t.cover_art_url
  from public.tracks t
  left join public.track_play_counts c on c.track_id = t.id
  where coalesce(t.status, 'live') in ('live', 'published')
    and t.audio_url is not null
  order by coalesce(c.play_count, 0) desc, t.created_at desc nulls last
  limit greatest(least(coalesce(p_limit, 20), 50), 1);
$$;

revoke all on function public.trending_tracks(integer) from public;
grant execute on function public.trending_tracks(integer) to anon, authenticated;

create or replace function public.trending_portals(p_limit integer default 12)
returns table (
  release_id uuid,
  artist_id uuid,
  title text,
  cover_url text,
  kind text,
  media_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if to_regclass('public.portal_releases') is null then
    return;
  end if;

  return query
  select
    r.id as release_id,
    r.artist_id,
    r.title,
    r.cover_url,
    r.kind,
    (
      select count(*)::bigint
      from public.portal_release_media m
      where m.release_id = r.id
    ) as media_count
  from public.portal_releases r
  where r.published = true
  order by (
      select count(*) from public.portal_release_media m where m.release_id = r.id
    ) desc,
    r.updated_at desc nulls last,
    r.created_at desc nulls last
  limit greatest(least(coalesce(p_limit, 12), 40), 1);
end;
$$;

revoke all on function public.trending_portals(integer) from public;
grant execute on function public.trending_portals(integer) to anon, authenticated;

create or replace function public.trending_live_rooms_by_place(
  p_country text default null,
  p_city text default null,
  p_neighborhood text default null,
  p_limit integer default 16
)
returns table (
  live_room_id uuid,
  artist_id uuid,
  title text,
  mode text,
  viewer_count integer,
  country text,
  city text,
  neighborhood text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id as live_room_id,
    r.artist_id,
    r.title,
    r.mode,
    r.viewer_count,
    r.country,
    r.city,
    r.neighborhood
  from public.live_rooms r
  where r.status = 'live'
    and r.visibility = 'public'
    and r.host = 'world'
    and (
      p_country is null
      or nullif(trim(p_country), '') is null
      or lower(coalesce(r.country, '')) = lower(trim(p_country))
    )
    and (
      p_city is null
      or nullif(trim(p_city), '') is null
      or lower(coalesce(r.city, '')) = lower(trim(p_city))
    )
    and (
      p_neighborhood is null
      or nullif(trim(p_neighborhood), '') is null
      or lower(coalesce(r.neighborhood, '')) = lower(trim(p_neighborhood))
    )
  order by r.viewer_count desc, r.started_at desc nulls last
  limit greatest(least(coalesce(p_limit, 16), 40), 1);
$$;

revoke all on function public.trending_live_rooms_by_place(text, text, text, integer) from public;
grant execute on function public.trending_live_rooms_by_place(text, text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
