-- ============================================================
-- Artist play earnings — idempotent bootstrap (type-safe)
-- Paste in Supabase → SQL Editor → Run
--
-- Fixes: uuid = text when playlist_tracks.track_id / tracks.artist_id
-- are text while tracks.id / auth.uid() are uuid.
-- Safe to re-run.
-- ============================================================

alter table public.plays
  add column if not exists listened_secs integer check (listened_secs is null or listened_secs >= 0);

create index if not exists plays_track_listened_idx
  on public.plays (track_id, listened_secs)
  where listened_secs is not null;

create table if not exists public.artist_play_earnings (
  id bigserial primary key,
  artist_id uuid not null references public.users (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  play_id uuid not null,
  listener_id uuid references public.users (id) on delete set null,
  amount_xof integer not null check (amount_xof > 0),
  created_at timestamptz not null default now(),
  constraint artist_play_earnings_play_unique unique (play_id)
);

create index if not exists artist_play_earnings_artist_created_idx
  on public.artist_play_earnings (artist_id, created_at desc);

create index if not exists artist_play_earnings_track_idx
  on public.artist_play_earnings (track_id);

create index if not exists artist_play_earnings_play_idx
  on public.artist_play_earnings (play_id);

alter table public.artist_play_earnings enable row level security;

drop policy if exists "artist_play_earnings_select_own" on public.artist_play_earnings;
create policy "artist_play_earnings_select_own"
  on public.artist_play_earnings for select
  to authenticated
  using (artist_id = auth.uid());

drop function if exists public.record_play_earning(uuid, bigint, integer);
drop function if exists public.record_play_earning(uuid, uuid, integer);

create or replace function public.record_play_earning(
  p_track_id uuid,
  p_play_id uuid,
  p_amount_xof integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_amount integer := greatest(coalesce(p_amount_xof, 10), 1);
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_track_id is null or p_play_id is null then
    raise exception 'track_and_play_required';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = p_track_id::text;

  if v_artist is null then
    raise exception 'track_not_found';
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'own_track');
  end if;

  insert into public.artist_play_earnings (
    artist_id, track_id, play_id, listener_id, amount_xof
  )
  values (v_artist, p_track_id, p_play_id, v_uid, v_amount)
  on conflict (play_id) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', true, 'skipped', 'duplicate');
  end if;

  return jsonb_build_object(
    'ok', true,
    'earning_id', v_id,
    'artist_id', v_artist,
    'amount_xof', v_amount
  );
end;
$$;

revoke all on function public.record_play_earning(uuid, uuid, integer) from public;
grant execute on function public.record_play_earning(uuid, uuid, integer) to authenticated;

drop function if exists public.record_credited_play(uuid);
drop function if exists public.record_credited_play(uuid, integer);

create or replace function public.record_credited_play(
  p_track_id uuid,
  p_starter integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new integer;
  v_play_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null then
    raise exception 'track_required';
  end if;

  if not exists (
    select 1 from public.tracks t where t.id::text = p_track_id::text
  ) then
    raise exception 'track_not_found';
  end if;

  insert into public.user_play_balances (user_id, credits, updated_at)
  values (v_uid, greatest(coalesce(p_starter, 25), 0), now())
  on conflict (user_id) do nothing;

  update public.user_play_balances
  set credits = credits - 1,
      updated_at = now()
  where user_id::text = v_uid::text
    and credits > 0
  returning credits into v_new;

  if not found then
    raise exception 'insufficient_credits';
  end if;

  insert into public.plays (track_id, listener_id, listened_secs)
  values (p_track_id, v_uid, 30)
  returning id into v_play_id;

  return jsonb_build_object(
    'ok', true,
    'play_id', v_play_id,
    'credits_remaining', v_new,
    'listened_secs', 30
  );
end;
$$;

revoke all on function public.record_credited_play(uuid, integer) from public;
grant execute on function public.record_credited_play(uuid, integer) to authenticated;

-- Artists can count playlist saves on their tracks (analytics)
-- Cast both sides: playlist_tracks.track_id is often text; tracks.id is uuid.
drop policy if exists "playlist_tracks_select_artist_tracks" on public.playlist_tracks;
create policy "playlist_tracks_select_artist_tracks"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id::text = playlist_tracks.track_id::text
        and t.artist_id::text = auth.uid()::text
    )
  );

notify pgrst, 'reload schema';
