-- Listener behavior affinity — learn genres/languages/places/dayparts from plays + likes.
-- Feeds For You / Wave soft-rank (merged with declared onboarding taste).
-- Also: allow listeners to update listened_secs on their own plays (real completion).
-- Safe to re-run.

-- Progress updates so studio completion / affinity weights reflect actual listen length.
drop policy if exists "plays_update_own_listened_secs" on public.plays;
create policy "plays_update_own_listened_secs"
  on public.plays for update
  to authenticated
  using (listener_id = auth.uid())
  with check (listener_id = auth.uid());

create or replace function public.update_play_listened_secs(
  p_play_id uuid,
  p_listened_secs integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_secs integer;
  v_row public.plays%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_play_id is null then
    raise exception 'play_id required';
  end if;
  v_secs := greatest(0, least(coalesce(p_listened_secs, 0), 86400));

  update public.plays
  set listened_secs = greatest(coalesce(listened_secs, 0), v_secs)
  where id = p_play_id
    and listener_id = uid
  returning * into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'play_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'play_id', v_row.id,
    'listened_secs', v_row.listened_secs
  );
end;
$$;

revoke all on function public.update_play_listened_secs(uuid, integer) from public;
grant execute on function public.update_play_listened_secs(uuid, integer) to authenticated;

-- Affinity rollup for the signed-in listener (security: auth.uid() only).
create or replace function public.listener_behavior_affinity(
  p_days integer default 90
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_days integer := greatest(7, least(coalesce(p_days, 90), 365));
  v_since timestamptz := now() - make_interval(days => v_days);
  v_genres jsonb := '[]'::jsonb;
  v_languages jsonb := '[]'::jsonb;
  v_countries jsonb := '[]'::jsonb;
  v_times jsonb := '[]'::jsonb;
  v_artists jsonb := '[]'::jsonb;
  v_plays integer := 0;
  v_likes integer := 0;
begin
  if uid is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_authenticated',
      'window_days', v_days
    );
  end if;

  select count(*)::integer into v_plays
  from public.plays p
  where p.listener_id = uid
    and p.created_at >= v_since;

  select count(*)::integer into v_likes
  from public.track_likes tl
  where tl.user_id = uid
    and tl.created_at >= v_since;

  -- Genre weights: plays (listened_secs / 30, floor 1) + likes * 3
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.score desc), '[]'::jsonb)
  into v_genres
  from (
    select name, round(sum(w)::numeric, 2) as score
    from (
      select
        nullif(trim(t.genre), '') as name,
        greatest(1.0, coalesce(p.listened_secs, 30)::float / 30.0) as w
      from public.plays p
      join public.tracks t on t.id = p.track_id
      where p.listener_id = uid
        and p.created_at >= v_since
        and coalesce(t.content_kind, 'music') <> 'podcast'
        and nullif(trim(t.genre), '') is not null
      union all
      select
        nullif(trim(t.genre), '') as name,
        3.0 as w
      from public.track_likes tl
      join public.tracks t on t.id = tl.track_id
      where tl.user_id = uid
        and tl.created_at >= v_since
        and coalesce(t.content_kind, 'music') <> 'podcast'
        and nullif(trim(t.genre), '') is not null
    ) raw
    where name is not null
    group by name
    order by sum(w) desc
    limit 12
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.score desc), '[]'::jsonb)
  into v_languages
  from (
    select name, round(sum(w)::numeric, 2) as score
    from (
      select
        nullif(trim(t.language), '') as name,
        greatest(1.0, coalesce(p.listened_secs, 30)::float / 30.0) as w
      from public.plays p
      join public.tracks t on t.id = p.track_id
      where p.listener_id = uid
        and p.created_at >= v_since
        and coalesce(t.content_kind, 'music') <> 'podcast'
        and nullif(trim(t.language), '') is not null
      union all
      select
        nullif(trim(t.language), '') as name,
        3.0 as w
      from public.track_likes tl
      join public.tracks t on t.id = tl.track_id
      where tl.user_id = uid
        and tl.created_at >= v_since
        and coalesce(t.content_kind, 'music') <> 'podcast'
        and nullif(trim(t.language), '') is not null
    ) raw
    where name is not null
    group by name
    order by sum(w) desc
    limit 12
  ) x;

  -- Places from artists of played tracks (users.countries text[])
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.score desc), '[]'::jsonb)
  into v_countries
  from (
    select name, round(sum(w)::numeric, 2) as score
    from (
      select
        nullif(trim(c), '') as name,
        greatest(1.0, coalesce(p.listened_secs, 30)::float / 30.0) as w
      from public.plays p
      join public.tracks t on t.id = p.track_id
      join public.users u on u.id = t.artist_id
      cross join lateral unnest(coalesce(u.countries, '{}'::text[])) as c
      where p.listener_id = uid
        and p.created_at >= v_since
        and coalesce(t.content_kind, 'music') <> 'podcast'
    ) raw
    where name is not null
    group by name
    order by sum(w) desc
    limit 12
  ) x;

  -- Dayparts from play hour (listener local approx = UTC; still useful signal)
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.score desc), '[]'::jsonb)
  into v_times
  from (
    select
      case
        when extract(hour from p.created_at at time zone 'UTC') >= 5
          and extract(hour from p.created_at at time zone 'UTC') < 12 then 'morning'
        when extract(hour from p.created_at at time zone 'UTC') >= 12
          and extract(hour from p.created_at at time zone 'UTC') < 17 then 'afternoon'
        when extract(hour from p.created_at at time zone 'UTC') >= 17
          and extract(hour from p.created_at at time zone 'UTC') < 21 then 'evening'
        else 'night'
      end as name,
      round(sum(greatest(1.0, coalesce(p.listened_secs, 30)::float / 30.0))::numeric, 2) as score
    from public.plays p
    join public.tracks t on t.id = p.track_id
    where p.listener_id = uid
      and p.created_at >= v_since
      and coalesce(t.content_kind, 'music') <> 'podcast'
    group by 1
    order by 2 desc
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.score desc), '[]'::jsonb)
  into v_artists
  from (
    select
      t.artist_id::text as id,
      round(sum(greatest(1.0, coalesce(p.listened_secs, 30)::float / 30.0))::numeric, 2) as score
    from public.plays p
    join public.tracks t on t.id = p.track_id
    where p.listener_id = uid
      and p.created_at >= v_since
      and t.artist_id is not null
      and coalesce(t.content_kind, 'music') <> 'podcast'
    group by t.artist_id
    order by 2 desc
    limit 20
  ) x;

  return jsonb_build_object(
    'ok', true,
    'window_days', v_days,
    'play_count', v_plays,
    'like_count', v_likes,
    'genres', v_genres,
    'languages', v_languages,
    'countries', v_countries,
    'listening_times', v_times,
    'artists', v_artists
  );
exception
  when undefined_column then
    -- content_kind / countries / language missing — return empty ok so app falls back
    return jsonb_build_object(
      'ok', true,
      'window_days', v_days,
      'play_count', 0,
      'like_count', 0,
      'genres', '[]'::jsonb,
      'languages', '[]'::jsonb,
      'countries', '[]'::jsonb,
      'listening_times', '[]'::jsonb,
      'artists', '[]'::jsonb,
      'degraded', true
    );
end;
$$;

revoke all on function public.listener_behavior_affinity(integer) from public;
grant execute on function public.listener_behavior_affinity(integer) to authenticated;

notify pgrst, 'reload schema';
