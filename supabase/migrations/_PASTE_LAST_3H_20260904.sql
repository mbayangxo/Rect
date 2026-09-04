-- ============================================================
-- RECT — paste these 3 migrations (last ~3 hours), in order
-- Supabase → SQL Editor → Run once each (or this whole file once)
-- Safe to re-run.
-- ============================================================

-- 1) Hearing Aids + RECT Punch
-- 2) Listener behavior affinity + play progress
-- 3) Label revenue split → wallet

-- Content kind: music (default) vs podcast (Hearing Aids).
alter table public.tracks
  add column if not exists content_kind text;

alter table public.tracks
  drop constraint if exists tracks_content_kind_check;

alter table public.tracks
  add constraint tracks_content_kind_check
  check (
    content_kind is null
    or content_kind in ('music', 'podcast')
  );

update public.tracks
set content_kind = 'music'
where content_kind is null;

alter table public.tracks
  alter column content_kind set default 'music';

create index if not exists tracks_content_kind_live_idx
  on public.tracks (content_kind, status, created_at desc);

comment on column public.tracks.content_kind is
  'music = catalog/Wave; podcast = Hearing Aids on-demand talk';

-- RECT Punch mastering request (optional after Upload QC).
alter table public.tracks
  add column if not exists punch_status text;

alter table public.tracks
  drop constraint if exists tracks_punch_status_check;

alter table public.tracks
  add constraint tracks_punch_status_check
  check (
    punch_status is null
    or punch_status in ('requested', 'processing', 'ready', 'failed', 'skipped')
  );

alter table public.tracks
  add column if not exists punch_audio_url text;

alter table public.tracks
  add column if not exists punch_requested_at timestamptz;

alter table public.tracks
  add column if not exists punch_ready_at timestamptz;

alter table public.tracks
  add column if not exists punch_notes text;

comment on column public.tracks.punch_status is
  'RECT Punch mastering: requested→processing→ready; Delivery prefers punch_audio_url when ready';


-- ========== 2) listener behavior ==========

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


-- ========== 3) label split wallet ==========

-- ============================================================
-- RECT Label revenue split → artist + label owner wallets
-- Paste in Supabase SQL Editor after 20260903_rect_labels.sql
-- Safe to re-run.
-- ============================================================

-- When an accepted label membership exists, credit_artist_wallet splits
-- p_amount_xof by revenue_split_label_pct (label share) / remainder (artist).

create or replace function public.credit_artist_wallet(
  p_artist_id uuid,
  p_amount_xof integer,
  p_kind text,
  p_reference_id text default null,
  p_description text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_kind text := coalesce(nullif(trim(p_kind), ''), 'adjustment');
  v_label_owner uuid;
  v_split numeric(5,2);
  v_label_amt integer;
  v_artist_amt integer;
  v_ref text := nullif(trim(coalesce(p_reference_id, '')), '');
  v_desc text := nullif(trim(coalesce(p_description, '')), '');
begin
  if p_artist_id is null or p_amount_xof is null or p_amount_xof = 0 then
    return null;
  end if;

  -- Do not re-split label_split / adjustment ledger lines.
  if v_kind in ('label_split', 'label_split_reversal') then
    perform public.ensure_artist_wallet(p_artist_id);
    insert into public.artist_wallet_ledger (
      artist_id, kind, amount_xof, reference_id, description
    )
    values (p_artist_id, v_kind, p_amount_xof, v_ref, v_desc)
    returning id into v_id;
    update public.artist_wallets
      set updated_at = now()
      where artist_id = p_artist_id;
    return v_id;
  end if;

  v_label_owner := null;
  v_split := 0;

  if to_regclass('public.rect_label_memberships') is not null
     and to_regclass('public.rect_labels') is not null then
    select l.owner_id, coalesce(m.revenue_split_label_pct, 0)
      into v_label_owner, v_split
    from public.rect_label_memberships m
    join public.rect_labels l on l.id = m.label_id
    where m.artist_id = p_artist_id
      and m.status = 'accepted'
      and l.owner_id is not null
      and l.owner_id <> p_artist_id
    order by m.artist_accepted_at desc nulls last, m.created_at desc
    limit 1;
  end if;

  if v_label_owner is not null
     and v_split is not null
     and v_split > 0
     and p_amount_xof > 0 then
    v_label_amt := floor(p_amount_xof * least(greatest(v_split, 0), 100) / 100.0)::integer;
    if v_label_amt < 0 then
      v_label_amt := 0;
    end if;
    if v_label_amt > abs(p_amount_xof) then
      v_label_amt := abs(p_amount_xof);
    end if;
    -- Preserve sign for negative adjustments
    if p_amount_xof < 0 then
      v_label_amt := -v_label_amt;
    end if;
    v_artist_amt := p_amount_xof - v_label_amt;

    -- Artist share
    if v_artist_amt <> 0 then
      perform public.ensure_artist_wallet(p_artist_id);
      insert into public.artist_wallet_ledger (
        artist_id, kind, amount_xof, reference_id, description
      )
      values (
        p_artist_id,
        v_kind,
        v_artist_amt,
        v_ref,
        coalesce(v_desc, 'Artist share after label split')
      )
      returning id into v_id;
      update public.artist_wallets
        set updated_at = now()
        where artist_id = p_artist_id;
    end if;

    -- Label owner share
    if v_label_amt <> 0 then
      perform public.ensure_artist_wallet(v_label_owner);
      insert into public.artist_wallet_ledger (
        artist_id, kind, amount_xof, reference_id, description
      )
      values (
        v_label_owner,
        'label_split',
        v_label_amt,
        coalesce(v_ref, p_artist_id::text),
        coalesce(
          v_desc,
          format('Label split %s%% from artist %s', v_split::text, p_artist_id::text)
        )
      );
      update public.artist_wallets
        set updated_at = now()
        where artist_id = v_label_owner;
    end if;

    return v_id;
  end if;

  -- No label membership — full amount to artist
  perform public.ensure_artist_wallet(p_artist_id);

  insert into public.artist_wallet_ledger (
    artist_id, kind, amount_xof, reference_id, description
  )
  values (
    p_artist_id,
    v_kind,
    p_amount_xof,
    v_ref,
    v_desc
  )
  returning id into v_id;

  update public.artist_wallets
  set updated_at = now()
  where artist_id = p_artist_id;

  return v_id;
end;
$$;

revoke all on function public.credit_artist_wallet(uuid, integer, text, text, text) from public;
grant execute on function public.credit_artist_wallet(uuid, integer, text, text, text) to service_role;

notify pgrst, 'reload schema';
