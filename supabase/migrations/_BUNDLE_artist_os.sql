-- RECT — Artist OS monetization + delivery (one paste)
-- Generated: 2026-09-04T01:21:31.773Z
-- Files: 26
-- Supabase SQL Editor → paste this entire file → Run

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_artist_play_earnings_bootstrap.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260830_artist_play_earnings_bootstrap.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_plays_listened_secs.sql
-- ═══════════════════════════════════════════════════════════
-- Track how much of each credited play was listened to (for completion rate analytics).
-- Safe to re-run.

alter table public.plays
  add column if not exists listened_secs integer check (listened_secs is null or listened_secs >= 0);

create index if not exists plays_track_listened_idx
  on public.plays (track_id, listened_secs)
  where listened_secs is not null;

-- Credit threshold matches lib/dashboard/analytics-time.ts CREDIT_LISTEN_SECS
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
  v_credit_secs integer := 30;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null then
    raise exception 'track_required';
  end if;

  if not exists (select 1 from public.tracks t where t.id = p_track_id) then
    raise exception 'track_not_found';
  end if;

  insert into public.user_play_balances (user_id, credits, updated_at)
  values (v_uid, greatest(coalesce(p_starter, 25), 0), now())
  on conflict (user_id) do nothing;

  update public.user_play_balances
  set credits = credits - 1,
      updated_at = now()
  where user_id = v_uid
    and credits > 0
  returning credits into v_new;

  if not found then
    raise exception 'insufficient_credits';
  end if;

  insert into public.plays (track_id, listener_id, listened_secs)
  values (p_track_id, v_uid, v_credit_secs)
  returning id into v_play_id;

  return jsonb_build_object(
    'ok', true,
    'play_id', v_play_id,
    'credits_remaining', v_new,
    'listened_secs', v_credit_secs
  );
end;
$$;

revoke all on function public.record_credited_play(uuid, integer) from public;
grant execute on function public.record_credited_play(uuid, integer) to authenticated;

notify pgrst, 'reload schema';

-- END 20260830_plays_listened_secs.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_tracks_taali_fields.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Optional nullable columns on tracks (storage only — no external TAALI DB/API)
-- ============================================================

alter table public.tracks
  add column if not exists taali_registry_id text,
  add column if not exists isrc_code text,
  add column if not exists writer_splits jsonb,
  add column if not exists master_owner text,
  add column if not exists territory_of_origin char(2);

alter table public.tracks
  drop constraint if exists tracks_territory_of_origin_check;

alter table public.tracks
  add constraint tracks_territory_of_origin_check
  check (
    territory_of_origin is null
    or territory_of_origin ~ '^[A-Za-z]{2}$'
  );

notify pgrst, 'reload schema';

-- END 20260830_tracks_taali_fields.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_monetization_stack.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- RECT monetization stack — wallet, downloads, fan club, portal, fan charts
-- All money flows through JOKO. Safe to re-run (idempotent where possible).
-- ============================================================

-- ── Song download pricing ─────────────────────────────────────
alter table public.tracks
  add column if not exists download_price_xof integer
  check (download_price_xof is null or download_price_xof >= 0);

create table if not exists public.track_download_purchases (
  id bigserial primary key,
  track_id uuid not null references public.tracks (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  price_xof integer not null check (price_xof >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'failed')),
  payment_method text not null default 'joko',
  payment_phone text,
  joko_reference text,
  created_at timestamptz not null default now()
);

create index if not exists track_download_purchases_track_idx
  on public.track_download_purchases (track_id);

create index if not exists track_download_purchases_artist_idx
  on public.track_download_purchases (artist_id, created_at desc);

alter table public.track_download_purchases enable row level security;

drop policy if exists "track_download_purchases_select_parties" on public.track_download_purchases;
create policy "track_download_purchases_select_parties"
  on public.track_download_purchases for select
  to authenticated
  using (buyer_id = auth.uid() or artist_id = auth.uid());

-- ── Artist wallet + JOKO payouts ──────────────────────────────
create table if not exists public.artist_wallets (
  artist_id uuid primary key references auth.users (id) on delete cascade,
  payout_phone text,
  next_payout_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artist_wallet_ledger (
  id bigserial primary key,
  artist_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'stream', 'download', 'merch', 'fan_club', 'tip', 'payout', 'adjustment'
  )),
  amount_xof integer not null,
  reference_id text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists artist_wallet_ledger_artist_idx
  on public.artist_wallet_ledger (artist_id, created_at desc);

create table if not exists public.artist_joko_payouts (
  id bigserial primary key,
  artist_id uuid not null references auth.users (id) on delete cascade,
  amount_xof integer not null check (amount_xof > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed')),
  payout_phone text not null,
  joko_reference text,
  scheduled_for timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists artist_joko_payouts_artist_idx
  on public.artist_joko_payouts (artist_id, created_at desc);

alter table public.artist_wallets enable row level security;
alter table public.artist_wallet_ledger enable row level security;
alter table public.artist_joko_payouts enable row level security;

drop policy if exists "artist_wallets_select_own" on public.artist_wallets;
create policy "artist_wallets_select_own"
  on public.artist_wallets for select
  to authenticated
  using (artist_id = auth.uid());

drop policy if exists "artist_wallets_upsert_own" on public.artist_wallets;
create policy "artist_wallets_upsert_own"
  on public.artist_wallets for all
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "artist_wallet_ledger_select_own" on public.artist_wallet_ledger;
create policy "artist_wallet_ledger_select_own"
  on public.artist_wallet_ledger for select
  to authenticated
  using (artist_id = auth.uid());

drop policy if exists "artist_joko_payouts_select_own" on public.artist_joko_payouts;
create policy "artist_joko_payouts_select_own"
  on public.artist_joko_payouts for select
  to authenticated
  using (artist_id = auth.uid());

-- ── Fan club tiers ────────────────────────────────────────────
create table if not exists public.fan_club_tiers (
  id bigserial primary key,
  artist_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  price_xof_month integer not null check (price_xof_month >= 0),
  perks jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fan_club_tiers_artist_idx
  on public.fan_club_tiers (artist_id, sort_order);

create table if not exists public.fan_club_members (
  id bigserial primary key,
  tier_id bigint not null references public.fan_club_tiers (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  fan_id uuid not null references auth.users (id) on delete cascade,
  price_xof integer not null check (price_xof >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'cancelled')),
  payment_method text not null default 'joko',
  payment_phone text,
  joko_reference text,
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint fan_club_members_unique unique (fan_id, tier_id)
);

create index if not exists fan_club_members_artist_idx
  on public.fan_club_members (artist_id, status);

alter table public.fan_club_tiers enable row level security;
alter table public.fan_club_members enable row level security;

drop policy if exists "fan_club_tiers_select_public" on public.fan_club_tiers;
create policy "fan_club_tiers_select_public"
  on public.fan_club_tiers for select
  to anon, authenticated
  using (active = true);

drop policy if exists "fan_club_tiers_manage_own" on public.fan_club_tiers;
create policy "fan_club_tiers_manage_own"
  on public.fan_club_tiers for all
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "fan_club_members_select_parties" on public.fan_club_members;
create policy "fan_club_members_select_parties"
  on public.fan_club_members for select
  to authenticated
  using (fan_id = auth.uid() or artist_id = auth.uid());

-- ── Portal releases (separate artist world) ───────────────────
create table if not exists public.portal_releases (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  slug text,
  kind text not null default 'release'
    check (kind in ('release', 'remix', 'visual', 'personal', 'world')),
  description text,
  cover_url text,
  theme_color text default '#1DB954',
  portal_audio_url text,
  track_id uuid references public.tracks (id) on delete set null,
  published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_releases_artist_idx
  on public.portal_releases (artist_id, sort_order);

create table if not exists public.portal_release_media (
  id bigserial primary key,
  release_id uuid not null references public.portal_releases (id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists portal_release_media_release_idx
  on public.portal_release_media (release_id, sort_order);

alter table public.portal_releases enable row level security;
alter table public.portal_release_media enable row level security;

drop policy if exists "portal_releases_select_public" on public.portal_releases;
create policy "portal_releases_select_public"
  on public.portal_releases for select
  to anon, authenticated
  using (published = true);

drop policy if exists "portal_releases_manage_own" on public.portal_releases;
create policy "portal_releases_manage_own"
  on public.portal_releases for all
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "portal_release_media_select_public" on public.portal_release_media;
create policy "portal_release_media_select_public"
  on public.portal_release_media for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.portal_releases r
      where r.id = release_id and (r.published = true or r.artist_id = auth.uid())
    )
  );

drop policy if exists "portal_release_media_manage_own" on public.portal_release_media;
create policy "portal_release_media_manage_own"
  on public.portal_release_media for all
  to authenticated
  using (
    exists (
      select 1 from public.portal_releases r
      where r.id = release_id and r.artist_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.portal_releases r
      where r.id = release_id and r.artist_id = auth.uid()
    )
  );

-- ── Personal fan charts ───────────────────────────────────────
create table if not exists public.fan_charts (
  id uuid primary key default gen_random_uuid(),
  fan_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'My Chart',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fan_chart_entries (
  id bigserial primary key,
  chart_id uuid not null references public.fan_charts (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  position integer not null check (position > 0),
  added_at timestamptz not null default now(),
  constraint fan_chart_entries_unique unique (chart_id, track_id)
);

create index if not exists fan_charts_fan_idx on public.fan_charts (fan_id);
create index if not exists fan_chart_entries_chart_idx on public.fan_chart_entries (chart_id, position);

alter table public.fan_charts enable row level security;
alter table public.fan_chart_entries enable row level security;

drop policy if exists "fan_charts_select" on public.fan_charts;
create policy "fan_charts_select"
  on public.fan_charts for select
  to authenticated
  using (fan_id = auth.uid() or is_public = true);

drop policy if exists "fan_charts_manage_own" on public.fan_charts;
create policy "fan_charts_manage_own"
  on public.fan_charts for all
  to authenticated
  using (fan_id = auth.uid())
  with check (fan_id = auth.uid());

drop policy if exists "fan_chart_entries_select" on public.fan_chart_entries;
create policy "fan_chart_entries_select"
  on public.fan_chart_entries for select
  to authenticated
  using (
    exists (
      select 1 from public.fan_charts c
      where c.id = chart_id and (c.fan_id = auth.uid() or c.is_public = true)
    )
  );

drop policy if exists "fan_chart_entries_manage_own" on public.fan_chart_entries;
create policy "fan_chart_entries_manage_own"
  on public.fan_chart_entries for all
  to authenticated
  using (
    exists (
      select 1 from public.fan_charts c
      where c.id = chart_id and c.fan_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.fan_charts c
      where c.id = chart_id and c.fan_id = auth.uid()
    )
  );

-- ── Wallet helpers ────────────────────────────────────────────
create or replace function public.ensure_artist_wallet(p_artist_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist uuid := coalesce(p_artist_id, auth.uid());
  v_next timestamptz;
begin
  if v_artist is null then
    raise exception 'not_authenticated';
  end if;

  v_next := date_trunc('month', now()) + interval '1 month';

  insert into public.artist_wallets (artist_id, next_payout_at)
  values (v_artist, v_next)
  on conflict (artist_id) do nothing;

  return jsonb_build_object('ok', true, 'artist_id', v_artist);
end;
$$;

revoke all on function public.ensure_artist_wallet(uuid) from public;
grant execute on function public.ensure_artist_wallet(uuid) to authenticated;

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
begin
  if p_artist_id is null or p_amount_xof is null or p_amount_xof = 0 then
    return null;
  end if;

  perform public.ensure_artist_wallet(p_artist_id);

  insert into public.artist_wallet_ledger (
    artist_id, kind, amount_xof, reference_id, description
  )
  values (
    p_artist_id,
    coalesce(nullif(trim(p_kind), ''), 'adjustment'),
    p_amount_xof,
    nullif(trim(p_reference_id), ''),
    nullif(trim(p_description), '')
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

-- ── Track download purchase ───────────────────────────────────
create or replace function public.purchase_track_download(
  p_track_id uuid,
  p_payment_method text default 'joko',
  p_payment_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_track public.tracks%rowtype;
  v_price integer;
  v_purchase_id bigint;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_track from public.tracks where id = p_track_id;
  if not found then
    raise exception 'track_not_found';
  end if;

  if v_track.artist_id = v_uid then
    raise exception 'own_track';
  end if;

  v_price := coalesce(v_track.download_price_xof, 0);
  if v_price <= 0 then
    raise exception 'download_not_for_sale';
  end if;

  if exists (
    select 1 from public.track_download_purchases
    where track_id = p_track_id and buyer_id = v_uid and status = 'confirmed'
  ) then
    raise exception 'already_purchased';
  end if;

  insert into public.track_download_purchases (
    track_id, buyer_id, artist_id, price_xof, status, payment_method, payment_phone
  )
  values (
    p_track_id, v_uid, v_track.artist_id, v_price, 'pending', v_method, v_phone
  )
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase_id,
    'price_xof', v_price,
    'track_id', p_track_id,
    'artist_id', v_track.artist_id,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.purchase_track_download(uuid, text, text) from public;
grant execute on function public.purchase_track_download(uuid, text, text) to authenticated;

create or replace function public.confirm_track_download_system(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.track_download_purchases%rowtype;
begin
  select * into v_row
  from public.track_download_purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'skipped', 'already_confirmed');
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  update public.track_download_purchases set status = 'confirmed' where id = v_row.id;

  perform public.credit_artist_wallet(
    v_row.artist_id,
    v_row.price_xof,
    'download',
    v_row.id::text,
    'Track download'
  );

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_row.id,
    'track_id', v_row.track_id,
    'price_xof', v_row.price_xof
  );
end;
$$;

revoke all on function public.confirm_track_download_system(bigint) from public;
grant execute on function public.confirm_track_download_system(bigint) to service_role;

create or replace function public.set_track_download_joko_reference(
  p_purchase_id bigint,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.track_download_purchases
  set joko_reference = nullif(trim(p_reference), '')
  where id = p_purchase_id and buyer_id = v_uid;

  if not found then raise exception 'purchase_not_found'; end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_track_download_joko_reference(bigint, text) from public;
grant execute on function public.set_track_download_joko_reference(bigint, text) to authenticated;

-- ── Fan club subscribe ────────────────────────────────────────
create or replace function public.subscribe_fan_club_tier(
  p_tier_id bigint,
  p_payment_method text default 'joko',
  p_payment_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tier public.fan_club_tiers%rowtype;
  v_member_id bigint;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_tier from public.fan_club_tiers
  where id = p_tier_id and active = true;

  if not found then raise exception 'tier_not_found'; end if;
  if v_tier.artist_id = v_uid then raise exception 'own_tier'; end if;

  insert into public.fan_club_members (
    tier_id, artist_id, fan_id, price_xof, status, payment_method, payment_phone
  )
  values (
    v_tier.id, v_tier.artist_id, v_uid, v_tier.price_xof_month, 'pending', v_method, v_phone
  )
  on conflict (fan_id, tier_id) do update
    set status = 'pending',
        payment_method = excluded.payment_method,
        payment_phone = excluded.payment_phone,
        price_xof = excluded.price_xof
  returning id into v_member_id;

  return jsonb_build_object(
    'ok', true,
    'member_id', v_member_id,
    'tier_id', v_tier.id,
    'artist_id', v_tier.artist_id,
    'price_xof', v_tier.price_xof_month,
    'tier_name', v_tier.name,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.subscribe_fan_club_tier(bigint, text, text) from public;
grant execute on function public.subscribe_fan_club_tier(bigint, text, text) to authenticated;

create or replace function public.confirm_fan_club_member_system(p_member_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fan_club_members%rowtype;
begin
  select * into v_row from public.fan_club_members where id = p_member_id for update;
  if not found then raise exception 'member_not_found'; end if;
  if v_row.status = 'active' then
    return jsonb_build_object('ok', true, 'skipped', 'already_active');
  end if;
  if v_row.status <> 'pending' then raise exception 'member_not_pending'; end if;

  update public.fan_club_members
  set status = 'active',
      started_at = now(),
      expires_at = now() + interval '30 days'
  where id = v_row.id;

  perform public.credit_artist_wallet(
    v_row.artist_id,
    v_row.price_xof,
    'fan_club',
    v_row.id::text,
    'Fan club membership'
  );

  return jsonb_build_object('ok', true, 'member_id', v_row.id);
end;
$$;

revoke all on function public.confirm_fan_club_member_system(bigint) from public;
grant execute on function public.confirm_fan_club_member_system(bigint) to service_role;

create or replace function public.set_fan_club_joko_reference(
  p_member_id bigint,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.fan_club_members
  set joko_reference = nullif(trim(p_reference), '')
  where id = p_member_id and fan_id = v_uid;

  if not found then raise exception 'member_not_found'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_fan_club_joko_reference(bigint, text) from public;
grant execute on function public.set_fan_club_joko_reference(bigint, text) to authenticated;

-- ── JOKO payout request ───────────────────────────────────────
create or replace function public.request_joko_payout(
  p_amount_xof integer,
  p_payout_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer := 0;
  v_payout_id bigint;
  v_phone text := nullif(trim(coalesce(p_payout_phone, '')), '');
  v_next timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_amount_xof is null or p_amount_xof < 500 then
    raise exception 'minimum_payout_500';
  end if;
  if v_phone is null or length(v_phone) < 8 then
    raise exception 'payout_phone_required';
  end if;

  perform public.ensure_artist_wallet(v_uid);

  select coalesce(sum(amount_xof), 0) into v_balance
  from public.artist_wallet_ledger
  where artist_id = v_uid;

  if v_balance < p_amount_xof then
    raise exception 'insufficient_balance';
  end if;

  v_next := date_trunc('month', now()) + interval '1 month';

  insert into public.artist_joko_payouts (
    artist_id, amount_xof, status, payout_phone, scheduled_for
  )
  values (v_uid, p_amount_xof, 'pending', v_phone, v_next)
  returning id into v_payout_id;

  perform public.credit_artist_wallet(
    v_uid,
    -p_amount_xof,
    'payout',
    v_payout_id::text,
    'JOKO payout request'
  );

  update public.artist_wallets
  set payout_phone = v_phone,
      next_payout_at = v_next,
      updated_at = now()
  where artist_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'payout_id', v_payout_id,
    'amount_xof', p_amount_xof,
    'scheduled_for', v_next,
    'balance_after', v_balance - p_amount_xof
  );
end;
$$;

revoke all on function public.request_joko_payout(integer, text) from public;
grant execute on function public.request_joko_payout(integer, text) to authenticated;

-- Credit wallet when play earning recorded (if earnings table exists)
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
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_track_id is null or p_play_id is null then
    raise exception 'track_and_play_required';
  end if;

  select t.artist_id into v_artist from public.tracks t where t.id = p_track_id;
  if v_artist is null then raise exception 'track_not_found'; end if;
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

  if to_regclass('public.artist_wallet_ledger') is not null then
    perform public.credit_artist_wallet(
      v_artist, v_amount, 'stream', v_id::text, 'Play credit earning'
    );
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

notify pgrst, 'reload schema';

-- END 20260830_monetization_stack.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_joko_play_pack_payment.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- JOKO mobile-money metadata on play pack purchases
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.play_pack_purchases
  add column if not exists payment_phone text;

alter table public.play_pack_purchases
  add column if not exists joko_reference text;

drop function if exists public.purchase_play_pack(bigint);

create or replace function public.purchase_play_pack(
  p_pack_id bigint,
  p_payment_method text default 'joko',
  p_payment_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pack public.play_packs%rowtype;
  v_credits integer;
  v_purchase_id bigint;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_pack
  from public.play_packs
  where id = p_pack_id
    and coalesce(active, true) = true;

  if not found then
    raise exception 'pack_not_found';
  end if;

  v_credits := coalesce(v_pack.play_credits, v_pack.play_count, 0);
  if v_credits <= 0 then
    raise exception 'pack_has_no_credits';
  end if;

  insert into public.play_pack_purchases (
    user_id,
    pack_id,
    credits_granted,
    price_xof,
    status,
    payment_method,
    payment_phone
  )
  values (
    v_uid,
    v_pack.id,
    v_credits,
    v_pack.price_xof,
    'pending',
    v_method,
    v_phone
  )
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'purchase_id', v_purchase_id,
    'credits_granted', 0,
    'credits_pending', v_credits,
    'balance', null,
    'pack_code', v_pack.code,
    'pack_name', v_pack.name,
    'price_xof', v_pack.price_xof,
    'price_label', v_pack.price_label,
    'payment_method', v_method,
    'payment_phone', v_phone
  );
end;
$$;

revoke all on function public.purchase_play_pack(bigint, text, text) from public;
grant execute on function public.purchase_play_pack(bigint, text, text) to authenticated;

create or replace function public.set_play_pack_joko_reference(
  p_purchase_id bigint,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.play_pack_purchases
  set joko_reference = nullif(trim(p_reference), '')
  where id = p_purchase_id
    and user_id = v_uid;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  return jsonb_build_object('ok', true, 'purchase_id', p_purchase_id);
end;
$$;

revoke all on function public.set_play_pack_joko_reference(bigint, text) from public;
grant execute on function public.set_play_pack_joko_reference(bigint, text) to authenticated;

-- JOKO webhook / server-side confirm (no auth.uid — service role only)
create or replace function public.confirm_play_pack_purchase_system(
  p_purchase_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.play_pack_purchases%rowtype;
  v_new_balance integer;
  v_pack_name text;
  v_pack_code text;
begin
  select * into v_row
  from public.play_pack_purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    select credits into v_new_balance
    from public.user_play_balances
    where user_id = v_row.user_id;

    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'purchase_id', v_row.id,
      'credits_granted', v_row.credits_granted,
      'balance', coalesce(v_new_balance, 0),
      'skipped', 'already_confirmed'
    );
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  update public.play_pack_purchases
  set status = 'confirmed'
  where id = v_row.id;

  insert into public.user_play_balances (user_id, credits, updated_at)
  values (v_row.user_id, v_row.credits_granted, now())
  on conflict (user_id) do update
    set credits = public.user_play_balances.credits + excluded.credits,
        updated_at = now()
  returning credits into v_new_balance;

  select code, name into v_pack_code, v_pack_name
  from public.play_packs
  where id = v_row.pack_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'confirmed',
    'purchase_id', v_row.id,
    'credits_granted', v_row.credits_granted,
    'balance', v_new_balance,
    'pack_code', v_pack_code,
    'pack_name', v_pack_name
  );
end;
$$;

revoke all on function public.confirm_play_pack_purchase_system(bigint) from public;
grant execute on function public.confirm_play_pack_purchase_system(bigint) to service_role;

notify pgrst, 'reload schema';

-- END 20260830_joko_play_pack_payment.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_artist_merch_store.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist merch store — items, purchases, sales counts
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.artist_merch_items (
  id bigserial primary key,
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text,
  price_xof integer not null check (price_xof >= 0),
  image_urls jsonb not null default '[]'::jsonb,
  category text not null default 'physical'
    check (category in ('clothing', 'digital', 'physical')),
  quantity_available integer check (quantity_available is null or quantity_available >= 0),
  sales_count integer not null default 0 check (sales_count >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artist_merch_items_artist_id_idx
  on public.artist_merch_items (artist_id);

create index if not exists artist_merch_items_active_idx
  on public.artist_merch_items (artist_id, active);

create table if not exists public.merch_purchases (
  id bigserial primary key,
  merch_item_id bigint not null references public.artist_merch_items (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  price_xof integer not null check (price_xof >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'failed')),
  payment_method text not null default 'joko',
  payment_phone text,
  joko_reference text,
  created_at timestamptz not null default now()
);

create index if not exists merch_purchases_item_id_idx
  on public.merch_purchases (merch_item_id);

create index if not exists merch_purchases_buyer_id_idx
  on public.merch_purchases (buyer_id);

alter table public.artist_merch_items enable row level security;
alter table public.merch_purchases enable row level security;

drop policy if exists "artist_merch_items_select_public" on public.artist_merch_items;
create policy "artist_merch_items_select_public"
  on public.artist_merch_items for select
  to anon, authenticated
  using (active = true);

drop policy if exists "artist_merch_items_select_own" on public.artist_merch_items;
create policy "artist_merch_items_select_own"
  on public.artist_merch_items for select
  to authenticated
  using (artist_id = auth.uid());

drop policy if exists "artist_merch_items_insert_own" on public.artist_merch_items;
create policy "artist_merch_items_insert_own"
  on public.artist_merch_items for insert
  to authenticated
  with check (artist_id = auth.uid());

drop policy if exists "artist_merch_items_update_own" on public.artist_merch_items;
create policy "artist_merch_items_update_own"
  on public.artist_merch_items for update
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "artist_merch_items_delete_own" on public.artist_merch_items;
create policy "artist_merch_items_delete_own"
  on public.artist_merch_items for delete
  to authenticated
  using (artist_id = auth.uid());

drop policy if exists "merch_purchases_select_buyer" on public.merch_purchases;
create policy "merch_purchases_select_buyer"
  on public.merch_purchases for select
  to authenticated
  using (buyer_id = auth.uid() or artist_id = auth.uid());

-- Start merch purchase (pending)
create or replace function public.purchase_merch_item(
  p_merch_id bigint,
  p_payment_method text default 'joko',
  p_payment_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.artist_merch_items%rowtype;
  v_purchase_id bigint;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_item
  from public.artist_merch_items
  where id = p_merch_id
    and active = true
  for update;

  if not found then
    raise exception 'merch_not_found';
  end if;

  if v_item.artist_id = v_uid then
    raise exception 'cannot_buy_own_merch';
  end if;

  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  insert into public.merch_purchases (
    merch_item_id,
    buyer_id,
    artist_id,
    price_xof,
    status,
    payment_method,
    payment_phone
  )
  values (
    v_item.id,
    v_uid,
    v_item.artist_id,
    v_item.price_xof,
    'pending',
    v_method,
    v_phone
  )
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'purchase_id', v_purchase_id,
    'merch_id', v_item.id,
    'title', v_item.title,
    'price_xof', v_item.price_xof,
    'payment_method', v_method,
    'payment_phone', v_phone
  );
end;
$$;

revoke all on function public.purchase_merch_item(bigint, text, text) from public;
grant execute on function public.purchase_merch_item(bigint, text, text) to authenticated;

create or replace function public.set_merch_joko_reference(
  p_purchase_id bigint,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.merch_purchases
  set joko_reference = nullif(trim(p_reference), '')
  where id = p_purchase_id
    and buyer_id = v_uid;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  return jsonb_build_object('ok', true, 'purchase_id', p_purchase_id);
end;
$$;

revoke all on function public.set_merch_joko_reference(bigint, text) from public;
grant execute on function public.set_merch_joko_reference(bigint, text) to authenticated;

create or replace function public.confirm_merch_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.merch_purchases%rowtype;
  v_item public.artist_merch_items%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
  from public.merch_purchases
  where id = p_purchase_id
    and buyer_id = v_uid
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    select * into v_item from public.artist_merch_items where id = v_row.merch_item_id;
    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'purchase_id', v_row.id,
      'merch_id', v_row.merch_item_id,
      'title', v_item.title,
      'skipped', 'already_confirmed'
    );
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  select * into v_item
  from public.artist_merch_items
  where id = v_row.merch_item_id
  for update;

  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  update public.merch_purchases
  set status = 'confirmed'
  where id = v_row.id;

  update public.artist_merch_items
  set
    sales_count = sales_count + 1,
    quantity_available = case
      when quantity_available is null then null
      else greatest(quantity_available - 1, 0)
    end,
    updated_at = now()
  where id = v_item.id;

  return jsonb_build_object(
    'ok', true,
    'status', 'confirmed',
    'purchase_id', v_row.id,
    'merch_id', v_row.merch_item_id,
    'title', v_item.title,
    'price_xof', v_row.price_xof
  );
end;
$$;

revoke all on function public.confirm_merch_purchase(bigint) from public;
grant execute on function public.confirm_merch_purchase(bigint) to authenticated;

create or replace function public.confirm_merch_purchase_system(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.merch_purchases%rowtype;
  v_item public.artist_merch_items%rowtype;
begin
  select * into v_row
  from public.merch_purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    select * into v_item from public.artist_merch_items where id = v_row.merch_item_id;
    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'purchase_id', v_row.id,
      'skipped', 'already_confirmed'
    );
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  select * into v_item
  from public.artist_merch_items
  where id = v_row.merch_item_id
  for update;

  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  update public.merch_purchases set status = 'confirmed' where id = v_row.id;

  update public.artist_merch_items
  set
    sales_count = sales_count + 1,
    quantity_available = case
      when quantity_available is null then null
      else greatest(quantity_available - 1, 0)
    end,
    updated_at = now()
  where id = v_item.id;

  return jsonb_build_object(
    'ok', true,
    'status', 'confirmed',
    'purchase_id', v_row.id,
    'merch_id', v_row.merch_item_id,
    'title', v_item.title
  );
end;
$$;

revoke all on function public.confirm_merch_purchase_system(bigint) from public;
grant execute on function public.confirm_merch_purchase_system(bigint) to service_role;

notify pgrst, 'reload schema';

-- END 20260830_artist_merch_store.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_merch_wallet_credit.sql
-- ═══════════════════════════════════════════════════════════
-- Merch purchase confirm → credit artist wallet (JOKO earnings)

create or replace function public.confirm_merch_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.merch_purchases%rowtype;
  v_item public.artist_merch_items%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
  from public.merch_purchases
  where id = p_purchase_id
    and buyer_id = v_uid
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    select * into v_item from public.artist_merch_items where id = v_row.merch_item_id;
    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'purchase_id', v_row.id,
      'merch_id', v_row.merch_item_id,
      'title', v_item.title,
      'skipped', 'already_confirmed'
    );
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  select * into v_item
  from public.artist_merch_items
  where id = v_row.merch_item_id
  for update;

  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  update public.merch_purchases
  set status = 'confirmed'
  where id = v_row.id;

  update public.artist_merch_items
  set
    sales_count = sales_count + 1,
    quantity_available = case
      when quantity_available is null then null
      else greatest(quantity_available - 1, 0)
    end,
    updated_at = now()
  where id = v_item.id;

  if to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null then
    perform public.credit_artist_wallet(
      v_row.artist_id,
      v_row.price_xof,
      'merch',
      v_row.id::text,
      coalesce(v_item.title, 'Merch sale')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'confirmed',
    'purchase_id', v_row.id,
    'merch_id', v_row.merch_item_id,
    'title', v_item.title,
    'price_xof', v_row.price_xof
  );
end;
$$;

create or replace function public.confirm_merch_purchase_system(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.merch_purchases%rowtype;
  v_item public.artist_merch_items%rowtype;
begin
  select * into v_row
  from public.merch_purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    select * into v_item from public.artist_merch_items where id = v_row.merch_item_id;
    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'purchase_id', v_row.id,
      'skipped', 'already_confirmed'
    );
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  select * into v_item
  from public.artist_merch_items
  where id = v_row.merch_item_id
  for update;

  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  update public.merch_purchases set status = 'confirmed' where id = v_row.id;

  update public.artist_merch_items
  set
    sales_count = sales_count + 1,
    quantity_available = case
      when quantity_available is null then null
      else greatest(quantity_available - 1, 0)
    end,
    updated_at = now()
  where id = v_item.id;

  if to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null then
    perform public.credit_artist_wallet(
      v_row.artist_id,
      v_row.price_xof,
      'merch',
      v_row.id::text,
      coalesce(v_item.title, 'Merch sale')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'confirmed',
    'purchase_id', v_row.id,
    'merch_id', v_row.merch_item_id,
    'title', v_item.title,
    'price_xof', v_row.price_xof
  );
end;
$$;

revoke all on function public.confirm_merch_purchase(bigint) from public;
grant execute on function public.confirm_merch_purchase(bigint) to authenticated;

revoke all on function public.confirm_merch_purchase_system(bigint) from public;
grant execute on function public.confirm_merch_purchase_system(bigint) to service_role;

notify pgrst, 'reload schema';

-- END 20260830_merch_wallet_credit.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_rect_score_music_purchases.sql
-- ═══════════════════════════════════════════════════════════
-- RECT SCORE — music purchase signals (album, CD, vinyl) on merch items
-- Song downloads use track_download_purchases (monetization_stack migration).

alter table public.artist_merch_items
  add column if not exists music_format text
  check (music_format is null or music_format in ('album', 'cd', 'vinyl'));

alter table public.artist_merch_items
  add column if not exists track_id uuid references public.tracks (id) on delete set null;

create index if not exists artist_merch_items_track_id_idx
  on public.artist_merch_items (track_id)
  where track_id is not null;

create index if not exists artist_merch_items_music_format_idx
  on public.artist_merch_items (music_format)
  where music_format is not null;

-- END 20260830_rect_score_music_purchases.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_tour_demand_fekk.sql
-- ═══════════════════════════════════════════════════════════
-- Tour demand (fan city requests) + FEKK-linked events / tickets
-- Paste in Supabase SQL Editor → Run

-- ── Fan: request artist to a city ─────────────────────────────
create table if not exists public.artist_city_requests (
  id bigserial primary key,
  artist_id uuid not null references auth.users (id) on delete cascade,
  fan_id uuid not null references auth.users (id) on delete cascade,
  city text not null check (char_length(trim(city)) > 0),
  place text,
  note text,
  created_at timestamptz not null default now(),
  unique (artist_id, fan_id, city)
);

create index if not exists artist_city_requests_artist_idx
  on public.artist_city_requests (artist_id, created_at desc);

create index if not exists artist_city_requests_city_idx
  on public.artist_city_requests (artist_id, city);

alter table public.artist_city_requests enable row level security;

drop policy if exists "artist_city_requests_select_parties" on public.artist_city_requests;
create policy "artist_city_requests_select_parties"
  on public.artist_city_requests for select
  to authenticated
  using (artist_id = auth.uid() or fan_id = auth.uid());

drop policy if exists "artist_city_requests_insert_fan" on public.artist_city_requests;
create policy "artist_city_requests_insert_fan"
  on public.artist_city_requests for insert
  to authenticated
  with check (fan_id = auth.uid() and artist_id <> auth.uid());

drop policy if exists "artist_city_requests_delete_own" on public.artist_city_requests;
create policy "artist_city_requests_delete_own"
  on public.artist_city_requests for delete
  to authenticated
  using (fan_id = auth.uid() or artist_id = auth.uid());

-- ── Artist tour / event shows (FEKK-linked) ───────────────────
create table if not exists public.artist_tour_events (
  id bigserial primary key,
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text,
  city text not null check (char_length(trim(city)) > 0),
  venue text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  ticket_price_xof integer check (ticket_price_xof is null or ticket_price_xof >= 0),
  capacity integer check (capacity is null or capacity >= 0),
  tickets_sold integer not null default 0 check (tickets_sold >= 0),
  fekk_event_id text,
  fekk_checkout_url text,
  cover_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artist_tour_events_artist_idx
  on public.artist_tour_events (artist_id, starts_at);

create index if not exists artist_tour_events_active_idx
  on public.artist_tour_events (artist_id, active, starts_at);

alter table public.artist_tour_events enable row level security;

drop policy if exists "artist_tour_events_select_public" on public.artist_tour_events;
create policy "artist_tour_events_select_public"
  on public.artist_tour_events for select
  to anon, authenticated
  using (active = true or artist_id = auth.uid());

drop policy if exists "artist_tour_events_insert_own" on public.artist_tour_events;
create policy "artist_tour_events_insert_own"
  on public.artist_tour_events for insert
  to authenticated
  with check (artist_id = auth.uid());

drop policy if exists "artist_tour_events_update_own" on public.artist_tour_events;
create policy "artist_tour_events_update_own"
  on public.artist_tour_events for update
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "artist_tour_events_delete_own" on public.artist_tour_events;
create policy "artist_tour_events_delete_own"
  on public.artist_tour_events for delete
  to authenticated
  using (artist_id = auth.uid());

-- ── Ticket purchases (FEKK checkout + confirm) ────────────────
create table if not exists public.tour_ticket_purchases (
  id bigserial primary key,
  event_id bigint not null references public.artist_tour_events (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0 and quantity <= 20),
  price_xof integer not null check (price_xof >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'failed', 'cancelled')),
  fekk_reference text,
  fekk_ticket_id text,
  payment_method text not null default 'fekk',
  payment_phone text,
  created_at timestamptz not null default now()
);

create index if not exists tour_ticket_purchases_event_idx
  on public.tour_ticket_purchases (event_id);

create index if not exists tour_ticket_purchases_artist_idx
  on public.tour_ticket_purchases (artist_id, created_at desc);

create index if not exists tour_ticket_purchases_buyer_idx
  on public.tour_ticket_purchases (buyer_id);

alter table public.tour_ticket_purchases enable row level security;

drop policy if exists "tour_ticket_purchases_select_parties" on public.tour_ticket_purchases;
create policy "tour_ticket_purchases_select_parties"
  on public.tour_ticket_purchases for select
  to authenticated
  using (buyer_id = auth.uid() or artist_id = auth.uid());

-- Wallet ledger: allow ticket kind (safe when table exists)
do $$
begin
  if to_regclass('public.artist_wallet_ledger') is not null then
    alter table public.artist_wallet_ledger drop constraint if exists artist_wallet_ledger_kind_check;
    alter table public.artist_wallet_ledger
      add constraint artist_wallet_ledger_kind_check
      check (kind in (
        'stream', 'download', 'merch', 'fan_club', 'tip', 'payout', 'adjustment', 'ticket'
      ));
  end if;
end $$;

-- ── RPCs ──────────────────────────────────────────────────────
create or replace function public.request_artist_city(
  p_artist_id uuid,
  p_city text,
  p_place text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_city text := trim(p_city);
  v_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_artist_id is null or p_artist_id = v_uid then
    raise exception 'invalid_artist';
  end if;
  if v_city is null or char_length(v_city) < 2 then
    raise exception 'city_required';
  end if;

  insert into public.artist_city_requests (
    artist_id, fan_id, city, place, note
  )
  values (
    p_artist_id,
    v_uid,
    v_city,
    nullif(trim(coalesce(p_place, '')), ''),
    nullif(trim(coalesce(p_note, '')), '')
  )
  on conflict (artist_id, fan_id, city) do update
    set place = excluded.place,
        note = excluded.note
  returning id into v_id;

  return jsonb_build_object('ok', true, 'request_id', v_id, 'city', v_city);
end;
$$;

revoke all on function public.request_artist_city(uuid, text, text, text) from public;
grant execute on function public.request_artist_city(uuid, text, text, text) to authenticated;

create or replace function public.purchase_tour_ticket(
  p_event_id bigint,
  p_quantity integer default 1,
  p_payment_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.artist_tour_events%rowtype;
  v_qty integer := greatest(1, least(coalesce(p_quantity, 1), 20));
  v_price integer;
  v_purchase_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_event
  from public.artist_tour_events
  where id = p_event_id
  for update;

  if not found or v_event.active = false then
    raise exception 'event_not_found';
  end if;

  if v_event.artist_id = v_uid then
    raise exception 'own_event';
  end if;

  if v_event.starts_at < now() - interval '6 hours' then
    raise exception 'event_passed';
  end if;

  if v_event.capacity is not null
     and v_event.tickets_sold + v_qty > v_event.capacity then
    raise exception 'sold_out';
  end if;

  v_price := coalesce(v_event.ticket_price_xof, 0) * v_qty;
  if v_price <= 0 then
    raise exception 'tickets_not_for_sale';
  end if;

  insert into public.tour_ticket_purchases (
    event_id, artist_id, buyer_id, quantity, price_xof, status, payment_phone
  )
  values (
    v_event.id, v_event.artist_id, v_uid, v_qty, v_price, 'pending',
    nullif(trim(coalesce(p_payment_phone, '')), '')
  )
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase_id,
    'event_id', v_event.id,
    'title', v_event.title,
    'city', v_event.city,
    'quantity', v_qty,
    'price_xof', v_price,
    'fekk_event_id', v_event.fekk_event_id,
    'fekk_checkout_url', v_event.fekk_checkout_url
  );
end;
$$;

revoke all on function public.purchase_tour_ticket(bigint, integer, text) from public;
grant execute on function public.purchase_tour_ticket(bigint, integer, text) to authenticated;

create or replace function public.set_tour_ticket_fekk_reference(
  p_purchase_id bigint,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.tour_ticket_purchases
  set fekk_reference = nullif(trim(p_reference), '')
  where id = p_purchase_id and buyer_id = v_uid;

  if not found then raise exception 'purchase_not_found'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_tour_ticket_fekk_reference(bigint, text) from public;
grant execute on function public.set_tour_ticket_fekk_reference(bigint, text) to authenticated;

create or replace function public.confirm_tour_ticket_system(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tour_ticket_purchases%rowtype;
  v_event public.artist_tour_events%rowtype;
begin
  select * into v_row
  from public.tour_ticket_purchases
  where id = p_purchase_id
  for update;

  if not found then raise exception 'purchase_not_found'; end if;

  if v_row.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'skipped', 'already_confirmed');
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  select * into v_event
  from public.artist_tour_events
  where id = v_row.event_id
  for update;

  if v_event.capacity is not null
     and v_event.tickets_sold + v_row.quantity > v_event.capacity then
    raise exception 'sold_out';
  end if;

  update public.tour_ticket_purchases
  set status = 'confirmed'
  where id = v_row.id;

  update public.artist_tour_events
  set
    tickets_sold = tickets_sold + v_row.quantity,
    updated_at = now()
  where id = v_event.id;

  if to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null then
    perform public.credit_artist_wallet(
      v_row.artist_id,
      v_row.price_xof,
      'ticket',
      v_row.id::text,
      coalesce(v_event.title, 'Tour ticket')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_row.id,
    'event_id', v_row.event_id,
    'price_xof', v_row.price_xof
  );
end;
$$;

revoke all on function public.confirm_tour_ticket_system(bigint) from public;
grant execute on function public.confirm_tour_ticket_system(bigint) to service_role;

notify pgrst, 'reload schema';

-- END 20260830_tour_demand_fekk.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_hardening_monetization.sql
-- ═══════════════════════════════════════════════════════════
-- Hardening patch: fan-club rejoin, ticket ledger kind, wallet ownership, play earning clamp
-- Apply AFTER monetization_stack / merch / tour migrations.

-- Ticket kind on wallet ledger (safe if already present)
do $$
begin
  if to_regclass('public.artist_wallet_ledger') is not null then
    alter table public.artist_wallet_ledger drop constraint if exists artist_wallet_ledger_kind_check;
    alter table public.artist_wallet_ledger
      add constraint artist_wallet_ledger_kind_check
      check (kind in (
        'stream', 'download', 'merch', 'fan_club', 'tip', 'payout', 'adjustment', 'ticket'
      ));
  end if;
end $$;

-- Fan club subscribe: do not demote active members to pending
create or replace function public.subscribe_fan_club_tier(
  p_tier_id bigint,
  p_payment_method text default 'joko',
  p_payment_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tier public.fan_club_tiers%rowtype;
  v_existing public.fan_club_members%rowtype;
  v_member_id bigint;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_tier from public.fan_club_tiers
  where id = p_tier_id and active = true;

  if not found then raise exception 'tier_not_found'; end if;
  if v_tier.artist_id = v_uid then raise exception 'own_tier'; end if;

  select * into v_existing
  from public.fan_club_members
  where fan_id = v_uid and tier_id = v_tier.id;

  if found and v_existing.status = 'active'
     and (v_existing.expires_at is null or v_existing.expires_at > now()) then
    return jsonb_build_object(
      'ok', true,
      'member_id', v_existing.id,
      'tier_id', v_tier.id,
      'artist_id', v_tier.artist_id,
      'price_xof', v_existing.price_xof,
      'tier_name', v_tier.name,
      'status', 'active',
      'skipped', 'already_active'
    );
  end if;

  insert into public.fan_club_members (
    tier_id, artist_id, fan_id, price_xof, status, payment_method, payment_phone
  )
  values (
    v_tier.id, v_tier.artist_id, v_uid, v_tier.price_xof_month, 'pending', v_method, v_phone
  )
  on conflict (fan_id, tier_id) do update
    set status = 'pending',
        payment_method = excluded.payment_method,
        payment_phone = excluded.payment_phone,
        price_xof = excluded.price_xof
  returning id into v_member_id;

  return jsonb_build_object(
    'ok', true,
    'member_id', v_member_id,
    'tier_id', v_tier.id,
    'artist_id', v_tier.artist_id,
    'price_xof', v_tier.price_xof_month,
    'tier_name', v_tier.name,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.subscribe_fan_club_tier(bigint, text, text) from public;
grant execute on function public.subscribe_fan_club_tier(bigint, text, text) to authenticated;

-- ensure_artist_wallet: authenticated callers may only ensure *their* wallet.
-- Internal credit_artist_wallet creates rows directly (does not rely on this for others).
create or replace function public.ensure_artist_wallet(p_artist_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid := coalesce(p_artist_id, v_uid);
  v_next timestamptz := date_trunc('week', now() + interval '7 days') + interval '1 day';
begin
  if v_artist is null then
    raise exception 'not_authenticated';
  end if;

  -- JWT sessions: only own wallet. Service role / null jwt may ensure any artist
  -- (used by payout tooling). Wallet credits for buyers go through credit_artist_wallet.
  if v_uid is not null and v_uid <> v_artist then
    raise exception 'forbidden';
  end if;

  insert into public.artist_wallets (artist_id, next_payout_at)
  values (v_artist, v_next)
  on conflict (artist_id) do nothing;

  return jsonb_build_object('ok', true, 'artist_id', v_artist);
end;
$$;

revoke all on function public.ensure_artist_wallet(uuid) from public;
grant execute on function public.ensure_artist_wallet(uuid) to authenticated;
grant execute on function public.ensure_artist_wallet(uuid) to service_role;

-- credit_artist_wallet must create the wallet row itself so buyer-side confirm
-- RPCs (auth.uid = fan) can credit the artist without hitting ensure forbidden.
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
  v_next timestamptz := date_trunc('week', now() + interval '7 days') + interval '1 day';
begin
  if p_artist_id is null or p_amount_xof is null or p_amount_xof = 0 then
    return null;
  end if;

  insert into public.artist_wallets (artist_id, next_payout_at)
  values (p_artist_id, v_next)
  on conflict (artist_id) do nothing;

  insert into public.artist_wallet_ledger (
    artist_id, kind, amount_xof, reference_id, description
  )
  values (
    p_artist_id,
    coalesce(nullif(trim(p_kind), ''), 'adjustment'),
    p_amount_xof,
    nullif(trim(p_reference_id), ''),
    nullif(trim(p_description), '')
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

-- City demand aggregate for artists (security definer; fans can't see others' votes)
create or replace function public.artist_city_demand(p_artist_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist uuid := coalesce(p_artist_id, auth.uid());
  v_rows jsonb;
begin
  if v_artist is null then raise exception 'not_authenticated'; end if;
  if auth.uid() is not null and auth.uid() <> v_artist then
    raise exception 'forbidden';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.request_count desc), '[]'::jsonb)
  into v_rows
  from (
    select
      city,
      max(place) filter (where place is not null) as place,
      count(*)::int as request_count,
      count(distinct fan_id)::int as unique_fans
    from public.artist_city_requests
    where artist_id = v_artist
    group by city
  ) t;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$$;

revoke all on function public.artist_city_demand(uuid) from public;
grant execute on function public.artist_city_demand(uuid) to authenticated;

-- Merch confirm always credits wallet (idempotent with merch_wallet_credit.sql)
create or replace function public.confirm_merch_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.merch_purchases%rowtype;
  v_item public.artist_merch_items%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_row
  from public.merch_purchases
  where id = p_purchase_id and buyer_id = v_uid
  for update;

  if not found then raise exception 'purchase_not_found'; end if;

  if v_row.status = 'confirmed' then
    select * into v_item from public.artist_merch_items where id = v_row.merch_item_id;
    return jsonb_build_object(
      'ok', true, 'status', 'confirmed', 'purchase_id', v_row.id,
      'merch_id', v_row.merch_item_id, 'title', v_item.title,
      'skipped', 'already_confirmed'
    );
  end if;

  if v_row.status <> 'pending' then raise exception 'purchase_not_pending'; end if;

  select * into v_item from public.artist_merch_items where id = v_row.merch_item_id for update;
  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  update public.merch_purchases set status = 'confirmed' where id = v_row.id;
  update public.artist_merch_items
  set sales_count = sales_count + 1,
      quantity_available = case
        when quantity_available is null then null
        else greatest(quantity_available - 1, 0)
      end,
      updated_at = now()
  where id = v_item.id;

  if to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null then
    perform public.credit_artist_wallet(
      v_row.artist_id, v_row.price_xof, 'merch', v_row.id::text,
      coalesce(v_item.title, 'Merch sale')
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'status', 'confirmed', 'purchase_id', v_row.id,
    'merch_id', v_row.merch_item_id, 'title', v_item.title, 'price_xof', v_row.price_xof
  );
end;
$$;

create or replace function public.confirm_merch_purchase_system(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.merch_purchases%rowtype;
  v_item public.artist_merch_items%rowtype;
begin
  select * into v_row from public.merch_purchases where id = p_purchase_id for update;
  if not found then raise exception 'purchase_not_found'; end if;

  if v_row.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'status', 'confirmed', 'purchase_id', v_row.id, 'skipped', 'already_confirmed');
  end if;
  if v_row.status <> 'pending' then raise exception 'purchase_not_pending'; end if;

  select * into v_item from public.artist_merch_items where id = v_row.merch_item_id for update;
  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  update public.merch_purchases set status = 'confirmed' where id = v_row.id;
  update public.artist_merch_items
  set sales_count = sales_count + 1,
      quantity_available = case
        when quantity_available is null then null
        else greatest(quantity_available - 1, 0)
      end,
      updated_at = now()
  where id = v_item.id;

  if to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null then
    perform public.credit_artist_wallet(
      v_row.artist_id, v_row.price_xof, 'merch', v_row.id::text,
      coalesce(v_item.title, 'Merch sale')
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'status', 'confirmed', 'purchase_id', v_row.id,
    'merch_id', v_row.merch_item_id, 'title', v_item.title, 'price_xof', v_row.price_xof
  );
end;
$$;

revoke all on function public.confirm_merch_purchase(bigint) from public;
grant execute on function public.confirm_merch_purchase(bigint) to authenticated;
revoke all on function public.confirm_merch_purchase_system(bigint) from public;
grant execute on function public.confirm_merch_purchase_system(bigint) to service_role;

-- record_play_earning: verify play ownership, clamp amount (no client-chosen windfall)
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
  v_play_listener uuid;
  v_play_track uuid;
  v_amount integer := least(greatest(coalesce(p_amount_xof, 10), 1), 25);
  v_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_track_id is null or p_play_id is null then
    raise exception 'track_and_play_required';
  end if;

  select p.listener_id, p.track_id
  into v_play_listener, v_play_track
  from public.plays p
  where p.id::text = p_play_id::text;

  if not found then raise exception 'play_not_found'; end if;
  if v_play_listener is distinct from v_uid then raise exception 'play_not_owned'; end if;
  if v_play_track::text is distinct from p_track_id::text then
    raise exception 'play_track_mismatch';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = p_track_id::text;
  if v_artist is null then raise exception 'track_not_found'; end if;
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

  if to_regclass('public.artist_wallet_ledger') is not null then
    perform public.credit_artist_wallet(
      v_artist, v_amount, 'stream', v_id::text, 'Play credit earning'
    );
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

notify pgrst, 'reload schema';

-- Wallet totals for studio (full ledger, not truncated)
create or replace function public.artist_wallet_balance_breakdown(p_artist_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid := coalesce(p_artist_id, v_uid);
  v_balance integer := 0;
  v_streams integer := 0;
  v_downloads integer := 0;
  v_merch integer := 0;
  v_fan_club integer := 0;
  v_tips integer := 0;
  v_tickets integer := 0;
begin
  if v_artist is null then raise exception 'not_authenticated'; end if;
  if v_uid is not null and v_uid <> v_artist then
    raise exception 'forbidden';
  end if;

  select
    coalesce(sum(amount_xof), 0),
    coalesce(sum(case when kind = 'stream' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'download' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'merch' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'fan_club' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'tip' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'ticket' and amount_xof > 0 then amount_xof else 0 end), 0)
  into v_balance, v_streams, v_downloads, v_merch, v_fan_club, v_tips, v_tickets
  from public.artist_wallet_ledger
  where artist_id = v_artist;

  return jsonb_build_object(
    'ok', true,
    'balance_xof', v_balance,
    'streams_xof', v_streams,
    'downloads_xof', v_downloads,
    'merch_xof', v_merch,
    'fan_club_xof', v_fan_club,
    'tips_xof', v_tips,
    'tickets_xof', v_tickets
  );
end;
$$;

revoke all on function public.artist_wallet_balance_breakdown(uuid) from public;
grant execute on function public.artist_wallet_balance_breakdown(uuid) to authenticated;
grant execute on function public.artist_wallet_balance_breakdown(uuid) to service_role;

-- Merch: hold inventory against pending purchases
create or replace function public.purchase_merch_item(
  p_merch_id bigint,
  p_payment_method text default 'joko',
  p_payment_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.artist_merch_items%rowtype;
  v_purchase_id bigint;
  v_pending integer := 0;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_item
  from public.artist_merch_items
  where id = p_merch_id and active = true
  for update;

  if not found then raise exception 'merch_not_found'; end if;
  if v_item.artist_id = v_uid then raise exception 'cannot_buy_own_merch'; end if;

  if v_item.quantity_available is not null then
    select count(*)::int into v_pending
    from public.merch_purchases
    where merch_item_id = v_item.id and status = 'pending';
    if v_item.quantity_available - v_pending <= 0 then
      raise exception 'merch_sold_out';
    end if;
  end if;

  insert into public.merch_purchases (
    merch_item_id, buyer_id, artist_id, price_xof, status, payment_method, payment_phone
  )
  values (v_item.id, v_uid, v_item.artist_id, v_item.price_xof, 'pending', v_method, v_phone)
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true, 'status', 'pending', 'purchase_id', v_purchase_id,
    'merch_id', v_item.id, 'title', v_item.title, 'price_xof', v_item.price_xof,
    'payment_method', v_method, 'payment_phone', v_phone
  );
end;
$$;

revoke all on function public.purchase_merch_item(bigint, text, text) from public;
grant execute on function public.purchase_merch_item(bigint, text, text) to authenticated;

create or replace function public.cancel_merch_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.merch_purchases%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.merch_purchases
  where id = p_purchase_id and buyer_id = v_uid for update;
  if not found then raise exception 'purchase_not_found'; end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'not_pending');
  end if;
  update public.merch_purchases set status = 'cancelled' where id = v_row.id;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_merch_purchase(bigint) from public;
grant execute on function public.cancel_merch_purchase(bigint) to authenticated;

-- Tickets: count pending holds toward capacity
create or replace function public.purchase_tour_ticket(
  p_event_id bigint,
  p_quantity integer default 1,
  p_payment_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.artist_tour_events%rowtype;
  v_qty integer := greatest(1, least(coalesce(p_quantity, 1), 20));
  v_price integer;
  v_purchase_id bigint;
  v_pending_qty integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_event
  from public.artist_tour_events
  where id = p_event_id
  for update;

  if not found or v_event.active = false then raise exception 'event_not_found'; end if;
  if v_event.artist_id = v_uid then raise exception 'own_event'; end if;
  if v_event.starts_at < now() - interval '6 hours' then raise exception 'event_passed'; end if;

  select coalesce(sum(quantity), 0)::int into v_pending_qty
  from public.tour_ticket_purchases
  where event_id = v_event.id and status = 'pending';

  if v_event.capacity is not null
     and v_event.tickets_sold + v_pending_qty + v_qty > v_event.capacity then
    raise exception 'sold_out';
  end if;

  v_price := coalesce(v_event.ticket_price_xof, 0) * v_qty;
  if v_price <= 0 then raise exception 'tickets_not_for_sale'; end if;

  insert into public.tour_ticket_purchases (
    event_id, artist_id, buyer_id, quantity, price_xof, status, payment_phone
  )
  values (
    v_event.id, v_event.artist_id, v_uid, v_qty, v_price, 'pending',
    nullif(trim(coalesce(p_payment_phone, '')), '')
  )
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true, 'purchase_id', v_purchase_id, 'event_id', v_event.id,
    'title', v_event.title, 'city', v_event.city, 'quantity', v_qty,
    'price_xof', v_price, 'fekk_event_id', v_event.fekk_event_id,
    'fekk_checkout_url', v_event.fekk_checkout_url
  );
end;
$$;

revoke all on function public.purchase_tour_ticket(bigint, integer, text) from public;
grant execute on function public.purchase_tour_ticket(bigint, integer, text) to authenticated;

create or replace function public.cancel_tour_ticket_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.tour_ticket_purchases%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.tour_ticket_purchases
  where id = p_purchase_id and buyer_id = v_uid for update;
  if not found then raise exception 'purchase_not_found'; end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'not_pending');
  end if;
  update public.tour_ticket_purchases set status = 'cancelled' where id = v_row.id;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_tour_ticket_purchase(bigint) from public;
grant execute on function public.cancel_tour_ticket_purchase(bigint) to authenticated;

-- Downloads: reuse pending purchase; cancel helper
create or replace function public.purchase_track_download(
  p_track_id uuid,
  p_payment_method text default 'joko',
  p_payment_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_track public.tracks%rowtype;
  v_price integer;
  v_purchase_id bigint;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_track from public.tracks where id = p_track_id;
  if not found then raise exception 'track_not_found'; end if;
  if v_track.artist_id = v_uid then raise exception 'own_track'; end if;

  v_price := coalesce(v_track.download_price_xof, 0);
  if v_price <= 0 then raise exception 'download_not_for_sale'; end if;

  if exists (
    select 1 from public.track_download_purchases
    where track_id = p_track_id and buyer_id = v_uid and status = 'confirmed'
  ) then
    raise exception 'already_purchased';
  end if;

  select id into v_purchase_id
  from public.track_download_purchases
  where track_id = p_track_id and buyer_id = v_uid and status = 'pending'
  order by created_at desc
  limit 1;

  if found then
    update public.track_download_purchases
    set payment_method = v_method, payment_phone = v_phone, price_xof = v_price
    where id = v_purchase_id;
    return jsonb_build_object(
      'ok', true, 'status', 'pending', 'purchase_id', v_purchase_id,
      'track_id', p_track_id, 'price_xof', v_price, 'reused', true
    );
  end if;

  insert into public.track_download_purchases (
    track_id, buyer_id, artist_id, price_xof, status, payment_method, payment_phone
  )
  values (p_track_id, v_uid, v_track.artist_id, v_price, 'pending', v_method, v_phone)
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true, 'status', 'pending', 'purchase_id', v_purchase_id,
    'track_id', p_track_id, 'price_xof', v_price
  );
end;
$$;

revoke all on function public.purchase_track_download(uuid, text, text) from public;
grant execute on function public.purchase_track_download(uuid, text, text) to authenticated;

create or replace function public.cancel_track_download_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.track_download_purchases%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.track_download_purchases
  where id = p_purchase_id and buyer_id = v_uid for update;
  if not found then raise exception 'purchase_not_found'; end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'not_pending');
  end if;
  update public.track_download_purchases set status = 'cancelled' where id = v_row.id;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_track_download_purchase(bigint) from public;
grant execute on function public.cancel_track_download_purchase(bigint) to authenticated;

notify pgrst, 'reload schema';

-- Clients must not confirm unpaid purchases; only service_role / webhooks / demo admin.
revoke all on function public.confirm_merch_purchase(bigint) from public;
revoke all on function public.confirm_merch_purchase(bigint) from authenticated;
grant execute on function public.confirm_merch_purchase_system(bigint) to service_role;

do $$
begin
  if to_regprocedure('public.confirm_play_pack_purchase(bigint)') is not null then
    revoke all on function public.confirm_play_pack_purchase(bigint) from public;
    revoke all on function public.confirm_play_pack_purchase(bigint) from authenticated;
  end if;
end $$;

-- Fan club: cancel pending subscribe (restore slot / avoid orphan)
create or replace function public.cancel_fan_club_subscribe(p_member_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.fan_club_members%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.fan_club_members
  where id = p_member_id and fan_id = v_uid for update;
  if not found then raise exception 'member_not_found'; end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'not_pending');
  end if;
  update public.fan_club_members set status = 'cancelled' where id = v_row.id;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_fan_club_subscribe(bigint) from public;
grant execute on function public.cancel_fan_club_subscribe(bigint) to authenticated;

notify pgrst, 'reload schema';

-- END 20260830_hardening_monetization.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_track_lyrics.sql
-- ═══════════════════════════════════════════════════════════
-- Track lyrics (plain text / timed-line friendly). Safe to re-run.

alter table public.tracks
  add column if not exists lyrics text;

comment on column public.tracks.lyrics is
  'Song lyrics as plain text. Artist-owned; visible with the track to fans.';

notify pgrst, 'reload schema';

-- END 20260830_track_lyrics.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_play_pack_prices.sql
-- ═══════════════════════════════════════════════════════════
-- Correct SN play pack prices to product spec: 100 / 200 / 500 XOF.
-- Safe to re-run.

update public.play_packs
set
  name = 'Micro',
  description = 'Quick listens for the day',
  price_label = '100 XOF',
  price_xof = 100,
  play_credits = 50,
  play_count = 50,
  sort_order = 1,
  active = true,
  updated_at = now()
where country = 'SN' and code = 'micro';

update public.play_packs
set
  name = 'Standard',
  description = 'Your weekly sound diet',
  price_label = '200 XOF',
  price_xof = 200,
  play_credits = 120,
  play_count = 120,
  sort_order = 2,
  active = true,
  updated_at = now()
where country = 'SN' and code = 'standard';

update public.play_packs
set
  name = 'Mega',
  description = 'Deep catalog access',
  price_label = '500 XOF',
  price_xof = 500,
  play_credits = 350,
  play_count = 350,
  sort_order = 3,
  active = true,
  updated_at = now()
where country = 'SN' and code = 'mega';

-- Ensure rows exist even if seed never ran
insert into public.play_packs (
  country, code, name, description, price_label, price_xof,
  play_credits, play_count, sort_order, active, updated_at
)
values
  ('SN', 'micro', 'Micro', 'Quick listens for the day', '100 XOF', 100, 50, 50, 1, true, now()),
  ('SN', 'standard', 'Standard', 'Your weekly sound diet', '200 XOF', 200, 120, 120, 2, true, now()),
  ('SN', 'mega', 'Mega', 'Deep catalog access', '500 XOF', 500, 350, 350, 3, true, now())
on conflict (country, code) do update set
  name = excluded.name,
  description = excluded.description,
  price_label = excluded.price_label,
  price_xof = excluded.price_xof,
  play_credits = excluded.play_credits,
  play_count = excluded.play_count,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

notify pgrst, 'reload schema';

-- END 20260830_play_pack_prices.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_live_rooms.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Live Rooms (casual) — Phase 1 of RECT presence
-- Paste in Supabase SQL Editor → Run
--
-- RECT Live (pro performances) = later phase, separate table.
-- Live Room = everyday go-live in Artist World:
--   mode: video | photos | audio
-- ============================================================

create table if not exists public.live_rooms (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Live Room',
  status text not null default 'offline'
    check (status in ('offline', 'live', 'ended')),
  mode text not null default 'video'
    check (mode in ('video', 'photos', 'audio')),
  visibility text not null default 'public'
    check (visibility in ('public', 'fan_club', 'private')),
  -- world = Artist World (default). portal = song/art portal (later).
  host text not null default 'world'
    check (host in ('world', 'portal')),
  portal_release_id uuid,
  country text,
  city text,
  neighborhood text,
  viewer_count integer not null default 0 check (viewer_count >= 0),
  stage_photo_url text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_rooms_artist_status_idx
  on public.live_rooms (artist_id, status);

create index if not exists live_rooms_live_viewers_idx
  on public.live_rooms (status, viewer_count desc)
  where status = 'live';

create index if not exists live_rooms_live_geo_idx
  on public.live_rooms (country, city)
  where status = 'live';

-- One active live room per artist
create unique index if not exists live_rooms_one_live_per_artist
  on public.live_rooms (artist_id)
  where status = 'live';

create table if not exists public.live_room_viewers (
  live_room_id uuid not null references public.live_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (live_room_id, user_id)
);

create index if not exists live_room_viewers_active_idx
  on public.live_room_viewers (live_room_id)
  where left_at is null;

create table if not exists public.live_room_messages (
  id bigserial primary key,
  live_room_id uuid not null references public.live_rooms (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null
    check (char_length(trim(body)) > 0 and char_length(body) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists live_room_messages_room_created_idx
  on public.live_room_messages (live_room_id, created_at desc);

create table if not exists public.live_room_photos (
  id bigserial primary key,
  live_room_id uuid not null references public.live_rooms (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  photo_url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists live_room_photos_room_idx
  on public.live_room_photos (live_room_id, sort_order, created_at);

alter table public.live_rooms enable row level security;
alter table public.live_room_viewers enable row level security;
alter table public.live_room_messages enable row level security;
alter table public.live_room_photos enable row level security;

drop policy if exists "live_rooms_select_visible" on public.live_rooms;
create policy "live_rooms_select_visible"
  on public.live_rooms for select
  to authenticated, anon
  using (
    artist_id = auth.uid()
    or status = 'live'
    or status = 'ended'
  );

drop policy if exists "live_room_viewers_select_participant" on public.live_room_viewers;
create policy "live_room_viewers_select_participant"
  on public.live_room_viewers for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id and r.artist_id = auth.uid()
    )
  );

drop policy if exists "live_room_messages_select" on public.live_room_messages;
create policy "live_room_messages_select"
  on public.live_room_messages for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id
        and (r.status in ('live', 'ended') or r.artist_id = auth.uid())
    )
  );

drop policy if exists "live_room_photos_select" on public.live_room_photos;
create policy "live_room_photos_select"
  on public.live_room_photos for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id
        and (r.status in ('live', 'ended') or r.artist_id = auth.uid())
    )
  );

-- Allow live_room notification kind (drop strict list if present)
alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

create or replace function public.start_live_room(
  p_title text default 'Live Room',
  p_mode text default 'video',
  p_visibility text default 'public',
  p_country text default null,
  p_city text default null,
  p_neighborhood text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := left(trim(coalesce(nullif(trim(p_title), ''), 'Live Room')), 120);
  v_mode text := lower(trim(coalesce(p_mode, 'video')));
  v_vis text := lower(trim(coalesce(p_visibility, 'public')));
  v_id uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if v_mode not in ('video', 'photos', 'audio') then
    raise exception 'invalid_mode';
  end if;
  if v_vis not in ('public', 'fan_club', 'private') then
    raise exception 'invalid_visibility';
  end if;

  select id into v_existing
  from public.live_rooms
  where artist_id = v_uid and status = 'live'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'live_room_id', v_existing,
      'skipped', 'already_live'
    );
  end if;

  insert into public.live_rooms (
    artist_id, title, status, mode, visibility, host,
    country, city, neighborhood, started_at, updated_at
  )
  values (
    v_uid, v_title, 'live', v_mode, v_vis, 'world',
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_neighborhood, '')), ''),
    now(), now()
  )
  returning id into v_id;

  -- Notify followers (best-effort)
  begin
    insert into public.artist_notifications (recipient_id, actor_id, kind, body)
    select f.follower_id, v_uid, 'live_room', left(v_title, 200)
    from public.artist_follows f
    where f.artist_id = v_uid
      and f.follower_id <> v_uid
    limit 200;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'live_room_id', v_id,
    'title', v_title,
    'mode', v_mode,
    'visibility', v_vis,
    'status', 'live'
  );
end;
$$;

revoke all on function public.start_live_room(text, text, text, text, text, text) from public;
grant execute on function public.start_live_room(text, text, text, text, text, text) to authenticated;

create or replace function public.end_live_room(p_live_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_live_room_id is null then raise exception 'room_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.artist_id <> v_uid then raise exception 'not_owner'; end if;
  if v_row.status <> 'live' then
    return jsonb_build_object('ok', true, 'skipped', 'not_live', 'status', v_row.status);
  end if;

  update public.live_rooms
  set status = 'ended',
      ended_at = now(),
      updated_at = now(),
      viewer_count = 0
  where id = p_live_room_id;

  update public.live_room_viewers
  set left_at = coalesce(left_at, now())
  where live_room_id = p_live_room_id and left_at is null;

  return jsonb_build_object('ok', true, 'live_room_id', p_live_room_id, 'status', 'ended');
end;
$$;

revoke all on function public.end_live_room(uuid) from public;
grant execute on function public.end_live_room(uuid) to authenticated;

create or replace function public.join_live_room(p_live_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
  v_member boolean := false;
  v_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_live_room_id is null then raise exception 'room_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.status <> 'live' then raise exception 'not_live'; end if;

  if v_row.visibility = 'private' and v_row.artist_id <> v_uid then
    raise exception 'private_room';
  end if;

  if v_row.visibility = 'fan_club' and v_row.artist_id <> v_uid then
    if to_regclass('public.fan_club_members') is not null then
      select exists (
        select 1 from public.fan_club_members m
        where m.artist_id = v_row.artist_id
          and m.fan_id = v_uid
          and m.status = 'active'
          and (m.expires_at is null or m.expires_at > now())
      ) into v_member;
    end if;
    if not v_member then raise exception 'fan_club_required'; end if;
  end if;

  insert into public.live_room_viewers (live_room_id, user_id, joined_at, left_at)
  values (p_live_room_id, v_uid, now(), null)
  on conflict (live_room_id, user_id) do update
    set joined_at = now(), left_at = null;

  select count(*)::integer into v_count
  from public.live_room_viewers
  where live_room_id = p_live_room_id and left_at is null;

  update public.live_rooms
  set viewer_count = v_count, updated_at = now()
  where id = p_live_room_id;

  return jsonb_build_object(
    'ok', true,
    'live_room_id', p_live_room_id,
    'viewer_count', v_count,
    'mode', v_row.mode,
    'title', v_row.title,
    'artist_id', v_row.artist_id
  );
end;
$$;

revoke all on function public.join_live_room(uuid) from public;
grant execute on function public.join_live_room(uuid) to authenticated;

create or replace function public.leave_live_room(p_live_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.live_room_viewers
  set left_at = now()
  where live_room_id = p_live_room_id
    and user_id = v_uid
    and left_at is null;

  select count(*)::integer into v_count
  from public.live_room_viewers
  where live_room_id = p_live_room_id and left_at is null;

  update public.live_rooms
  set viewer_count = v_count, updated_at = now()
  where id = p_live_room_id and status = 'live';

  return jsonb_build_object('ok', true, 'viewer_count', v_count);
end;
$$;

revoke all on function public.leave_live_room(uuid) from public;
grant execute on function public.leave_live_room(uuid) to authenticated;

create or replace function public.send_live_room_message(
  p_live_room_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
  v_body text := left(trim(coalesce(p_body, '')), 500);
  v_id bigint;
  v_created timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(v_body) = 0 then raise exception 'body_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.status <> 'live' then raise exception 'not_live'; end if;

  if v_row.artist_id <> v_uid then
    if not exists (
      select 1 from public.live_room_viewers v
      where v.live_room_id = p_live_room_id
        and v.user_id = v_uid
        and v.left_at is null
    ) then
      raise exception 'not_in_room';
    end if;
  end if;

  insert into public.live_room_messages (live_room_id, sender_id, body)
  values (p_live_room_id, v_uid, v_body)
  returning id, created_at into v_id, v_created;

  return jsonb_build_object(
    'ok', true,
    'message_id', v_id,
    'body', v_body,
    'sender_id', v_uid,
    'created_at', v_created
  );
end;
$$;

revoke all on function public.send_live_room_message(uuid, text) from public;
grant execute on function public.send_live_room_message(uuid, text) to authenticated;

create or replace function public.push_live_room_photo(
  p_live_room_id uuid,
  p_photo_url text,
  p_caption text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
  v_url text := trim(coalesce(p_photo_url, ''));
  v_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(v_url) < 8 then raise exception 'photo_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.artist_id <> v_uid then raise exception 'not_owner'; end if;
  if v_row.status <> 'live' then raise exception 'not_live'; end if;

  insert into public.live_room_photos (
    live_room_id, artist_id, photo_url, caption, sort_order
  )
  values (
    p_live_room_id, v_uid, left(v_url, 2000),
    nullif(left(trim(coalesce(p_caption, '')), 200), ''),
    (select coalesce(max(sort_order), 0) + 1 from public.live_room_photos where live_room_id = p_live_room_id)
  )
  returning id into v_id;

  update public.live_rooms
  set stage_photo_url = left(v_url, 2000), updated_at = now()
  where id = p_live_room_id;

  return jsonb_build_object('ok', true, 'photo_id', v_id, 'photo_url', v_url);
end;
$$;

revoke all on function public.push_live_room_photo(uuid, text, text) from public;
grant execute on function public.push_live_room_photo(uuid, text, text) to authenticated;

-- Realtime for chat / photos / status
do $$
begin
  begin
    alter publication supabase_realtime add table public.live_rooms;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.live_room_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.live_room_photos;
  exception when duplicate_object then null;
  end;
end $$;

notify pgrst, 'reload schema';

-- END 20260830_live_rooms.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_live_rooms_hardening.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Live Rooms hardening — visibility, notifs, kind check
-- Apply AFTER 20260830_live_rooms.sql
-- ============================================================

-- Deep-link for Hearing Aid / inbox
alter table public.artist_notifications
  add column if not exists live_room_id uuid;

create index if not exists artist_notifications_live_room_idx
  on public.artist_notifications (live_room_id)
  where live_room_id is not null;

-- Restore kind check including live_room (best-effort; widen list)
alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

-- Tighter SELECT: don't leak private / fan_club content to everyone
drop policy if exists "live_rooms_select_visible" on public.live_rooms;
create policy "live_rooms_select_visible"
  on public.live_rooms for select
  to authenticated, anon
  using (
    artist_id = auth.uid()
    or (
      status in ('live', 'ended')
      and visibility = 'public'
    )
    or (
      status in ('live', 'ended')
      and visibility = 'fan_club'
      and auth.uid() is not null
      and (
        artist_id = auth.uid()
        or exists (
          select 1 from public.fan_club_members m
          where m.artist_id = live_rooms.artist_id
            and m.fan_id = auth.uid()
            and m.status = 'active'
            and (m.expires_at is null or m.expires_at > now())
        )
      )
    )
  );

drop policy if exists "live_room_messages_select" on public.live_room_messages;
create policy "live_room_messages_select"
  on public.live_room_messages for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id
        and (
          r.artist_id = auth.uid()
          or (
            r.status in ('live', 'ended')
            and r.visibility = 'public'
          )
          or (
            r.status in ('live', 'ended')
            and r.visibility = 'fan_club'
            and auth.uid() is not null
            and exists (
              select 1 from public.fan_club_members m
              where m.artist_id = r.artist_id
                and m.fan_id = auth.uid()
                and m.status = 'active'
                and (m.expires_at is null or m.expires_at > now())
            )
          )
        )
    )
  );

drop policy if exists "live_room_photos_select" on public.live_room_photos;
create policy "live_room_photos_select"
  on public.live_room_photos for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id
        and (
          r.artist_id = auth.uid()
          or (
            r.status in ('live', 'ended')
            and r.visibility = 'public'
          )
          or (
            r.status in ('live', 'ended')
            and r.visibility = 'fan_club'
            and auth.uid() is not null
            and exists (
              select 1 from public.fan_club_members m
              where m.artist_id = r.artist_id
                and m.fan_id = auth.uid()
                and m.status = 'active'
                and (m.expires_at is null or m.expires_at > now())
            )
          )
        )
    )
  );

-- Fix start_live_room to store live_room_id on notifications
create or replace function public.start_live_room(
  p_title text default 'Live Room',
  p_mode text default 'video',
  p_visibility text default 'public',
  p_country text default null,
  p_city text default null,
  p_neighborhood text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := left(trim(coalesce(nullif(trim(p_title), ''), 'Live Room')), 120);
  v_mode text := lower(trim(coalesce(p_mode, 'photos')));
  v_vis text := lower(trim(coalesce(p_visibility, 'public')));
  v_id uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if v_mode not in ('video', 'photos', 'audio') then
    raise exception 'invalid_mode';
  end if;
  if v_vis not in ('public', 'fan_club', 'private') then
    raise exception 'invalid_visibility';
  end if;

  select id into v_existing
  from public.live_rooms
  where artist_id = v_uid and status = 'live'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'live_room_id', v_existing,
      'skipped', 'already_live'
    );
  end if;

  insert into public.live_rooms (
    artist_id, title, status, mode, visibility, host,
    country, city, neighborhood, started_at, updated_at
  )
  values (
    v_uid, v_title, 'live', v_mode, v_vis, 'world',
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_neighborhood, '')), ''),
    now(), now()
  )
  returning id into v_id;

  begin
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, live_room_id
    )
    select f.follower_id, v_uid, 'live_room', left(v_title, 200), v_id
    from public.artist_follows f
    where f.artist_id = v_uid
      and f.follower_id <> v_uid
    limit 200;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'live_room_id', v_id,
    'title', v_title,
    'mode', v_mode,
    'visibility', v_vis,
    'status', 'live'
  );
end;
$$;

revoke all on function public.start_live_room(text, text, text, text, text, text) from public;
grant execute on function public.start_live_room(text, text, text, text, text, text) to authenticated;

-- Validate photo URLs (https only)
create or replace function public.push_live_room_photo(
  p_live_room_id uuid,
  p_photo_url text,
  p_caption text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
  v_url text := trim(coalesce(p_photo_url, ''));
  v_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(v_url) < 12 then raise exception 'photo_required'; end if;
  if v_url !~* '^https://' then raise exception 'photo_https_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.artist_id <> v_uid then raise exception 'not_owner'; end if;
  if v_row.status <> 'live' then raise exception 'not_live'; end if;

  insert into public.live_room_photos (
    live_room_id, artist_id, photo_url, caption, sort_order
  )
  values (
    p_live_room_id, v_uid, left(v_url, 2000),
    nullif(left(trim(coalesce(p_caption, '')), 200), ''),
    (select coalesce(max(sort_order), 0) + 1 from public.live_room_photos where live_room_id = p_live_room_id)
  )
  returning id into v_id;

  update public.live_rooms
  set stage_photo_url = left(v_url, 2000), updated_at = now()
  where id = p_live_room_id;

  return jsonb_build_object('ok', true, 'photo_id', v_id, 'photo_url', v_url);
end;
$$;

revoke all on function public.push_live_room_photo(uuid, text, text) from public;
grant execute on function public.push_live_room_photo(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260830_live_rooms_hardening.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_rect_live.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- RECT Live — professional performances (Phase 3)
-- Separate from casual Live Rooms.
-- Paste after live_rooms migrations.
-- ============================================================

create table if not exists public.rect_lives (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'RECT Live',
  status text not null default 'offline'
    check (status in ('offline', 'live', 'ended')),
  visibility text not null default 'public'
    check (visibility in ('public', 'fan_club', 'private')),
  -- world default; portal = premiere / unlock party (Phase 4)
  host text not null default 'world'
    check (host in ('world', 'portal')),
  portal_release_id uuid,
  viewer_count integer not null default 0 check (viewer_count >= 0),
  country text,
  city text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rect_lives_one_live_per_artist
  on public.rect_lives (artist_id)
  where status = 'live';

create index if not exists rect_lives_live_idx
  on public.rect_lives (status, viewer_count desc)
  where status = 'live';

alter table public.rect_lives enable row level security;

drop policy if exists "rect_lives_select_visible" on public.rect_lives;
create policy "rect_lives_select_visible"
  on public.rect_lives for select
  to authenticated, anon
  using (
    artist_id = auth.uid()
    or (status in ('live', 'ended') and visibility = 'public')
    or (
      status in ('live', 'ended')
      and visibility = 'fan_club'
      and auth.uid() is not null
      and exists (
        select 1 from public.fan_club_members m
        where m.artist_id = rect_lives.artist_id
          and m.fan_id = auth.uid()
          and m.status = 'active'
          and (m.expires_at is null or m.expires_at > now())
      )
    )
  );

create or replace function public.start_rect_live(
  p_title text default 'RECT Live',
  p_visibility text default 'public',
  p_host text default 'world',
  p_portal_release_id uuid default null,
  p_country text default null,
  p_city text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := left(trim(coalesce(nullif(trim(p_title), ''), 'RECT Live')), 120);
  v_vis text := lower(trim(coalesce(p_visibility, 'public')));
  v_host text := lower(trim(coalesce(p_host, 'world')));
  v_id uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_vis not in ('public', 'fan_club', 'private') then raise exception 'invalid_visibility'; end if;
  if v_host not in ('world', 'portal') then raise exception 'invalid_host'; end if;
  if v_host = 'portal' and p_portal_release_id is null then
    raise exception 'portal_required';
  end if;

  -- Can't run casual Live Room and RECT Live at once
  if exists (
    select 1 from public.live_rooms
    where artist_id = v_uid and status = 'live'
  ) then
    raise exception 'live_room_active';
  end if;

  select id into v_existing
  from public.rect_lives
  where artist_id = v_uid and status = 'live'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'rect_live_id', v_existing, 'skipped', 'already_live');
  end if;

  insert into public.rect_lives (
    artist_id, title, status, visibility, host, portal_release_id,
    country, city, started_at, updated_at
  )
  values (
    v_uid, v_title, 'live', v_vis, v_host, p_portal_release_id,
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    now(), now()
  )
  returning id into v_id;

  begin
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body
    )
    select f.follower_id, v_uid, 'live_room',
           left('RECT Live · ' || v_title, 200)
    from public.artist_follows f
    where f.artist_id = v_uid and f.follower_id <> v_uid
    limit 200;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'rect_live_id', v_id,
    'title', v_title,
    'status', 'live',
    'host', v_host
  );
end;
$$;

revoke all on function public.start_rect_live(text, text, text, uuid, text, text) from public;
grant execute on function public.start_rect_live(text, text, text, uuid, text, text) to authenticated;

create or replace function public.end_rect_live(p_rect_live_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.rect_lives%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.rect_lives where id = p_rect_live_id;
  if not found then raise exception 'not_found'; end if;
  if v_row.artist_id <> v_uid then raise exception 'not_owner'; end if;
  if v_row.status <> 'live' then
    return jsonb_build_object('ok', true, 'skipped', 'not_live');
  end if;

  update public.rect_lives
  set status = 'ended', ended_at = now(), updated_at = now(), viewer_count = 0
  where id = p_rect_live_id;

  return jsonb_build_object('ok', true, 'status', 'ended');
end;
$$;

revoke all on function public.end_rect_live(uuid) from public;
grant execute on function public.end_rect_live(uuid) to authenticated;

-- Phase 4: casual Live Room can host in a portal
create or replace function public.start_live_room(
  p_title text default 'Live Room',
  p_mode text default 'photos',
  p_visibility text default 'public',
  p_country text default null,
  p_city text default null,
  p_neighborhood text default null,
  p_host text default 'world',
  p_portal_release_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := left(trim(coalesce(nullif(trim(p_title), ''), 'Live Room')), 120);
  v_mode text := lower(trim(coalesce(p_mode, 'photos')));
  v_vis text := lower(trim(coalesce(p_visibility, 'public')));
  v_host text := lower(trim(coalesce(p_host, 'world')));
  v_id uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_mode not in ('video', 'photos', 'audio') then raise exception 'invalid_mode'; end if;
  if v_vis not in ('public', 'fan_club', 'private') then raise exception 'invalid_visibility'; end if;
  if v_host not in ('world', 'portal') then raise exception 'invalid_host'; end if;
  if v_host = 'portal' and p_portal_release_id is null then
    raise exception 'portal_required';
  end if;

  if exists (
    select 1 from public.rect_lives where artist_id = v_uid and status = 'live'
  ) then
    raise exception 'rect_live_active';
  end if;

  select id into v_existing
  from public.live_rooms
  where artist_id = v_uid and status = 'live'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'live_room_id', v_existing, 'skipped', 'already_live');
  end if;

  insert into public.live_rooms (
    artist_id, title, status, mode, visibility, host, portal_release_id,
    country, city, neighborhood, started_at, updated_at
  )
  values (
    v_uid, v_title, 'live', v_mode, v_vis, v_host, p_portal_release_id,
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_neighborhood, '')), ''),
    now(), now()
  )
  returning id into v_id;

  begin
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, live_room_id
    )
    select f.follower_id, v_uid, 'live_room', left(v_title, 200), v_id
    from public.artist_follows f
    where f.artist_id = v_uid and f.follower_id <> v_uid
    limit 200;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'live_room_id', v_id,
    'title', v_title,
    'mode', v_mode,
    'visibility', v_vis,
    'host', v_host,
    'status', 'live'
  );
end;
$$;

-- Drop old 6-arg overload if present, grant new 8-arg
drop function if exists public.start_live_room(text, text, text, text, text, text);
revoke all on function public.start_live_room(text, text, text, text, text, text, text, uuid) from public;
grant execute on function public.start_live_room(text, text, text, text, text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260830_rect_live.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_discovery_trending.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260830_discovery_trending.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_direct_messages.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Direct messages (1:1) — paste in Supabase SQL Editor → Run
-- Requires: user_blocks.users_are_blocked, auth.users
-- Safe to re-run.
-- ============================================================

create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  -- Canonical pair for uniqueness (lower uuid first)
  participant_low uuid not null references auth.users (id) on delete cascade,
  participant_high uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dm_conversations_ordered check (participant_low < participant_high),
  constraint dm_conversations_pair_unique unique (participant_low, participant_high)
);

create index if not exists dm_conversations_updated_idx
  on public.dm_conversations (updated_at desc);

create table if not exists public.dm_participants (
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists dm_participants_user_idx
  on public.dm_participants (user_id);

create table if not exists public.dm_messages (
  id bigserial primary key,
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null
    check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_conv_created_idx
  on public.dm_messages (conversation_id, created_at desc);

alter table public.dm_conversations enable row level security;
alter table public.dm_participants enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists "dm_conversations_select_participant" on public.dm_conversations;
create policy "dm_conversations_select_participant"
  on public.dm_conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants p
      where p.conversation_id = id and p.user_id = auth.uid()
    )
  );

drop policy if exists "dm_participants_select_own_thread" on public.dm_participants;
create policy "dm_participants_select_own_thread"
  on public.dm_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants me
      where me.conversation_id = conversation_id
        and me.user_id = auth.uid()
    )
  );

drop policy if exists "dm_participants_update_own" on public.dm_participants;
create policy "dm_participants_update_own"
  on public.dm_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "dm_messages_select_participant" on public.dm_messages;
create policy "dm_messages_select_participant"
  on public.dm_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants p
      where p.conversation_id = conversation_id
        and p.user_id = auth.uid()
    )
  );

-- No client inserts on conversations/messages — RPCs only.

create or replace function public.open_or_get_dm(p_other_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_other_id is null then
    raise exception 'user_required';
  end if;
  if p_other_id = v_uid then
    raise exception 'cannot_dm_self';
  end if;

  if to_regclass('public.user_blocks') is not null
     and public.users_are_blocked(v_uid, p_other_id) then
    raise exception 'blocked';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_other_id) then
    raise exception 'user_not_found';
  end if;

  if p_other_id < v_uid then
    v_low := p_other_id;
    v_high := v_uid;
  else
    v_low := v_uid;
    v_high := p_other_id;
  end if;

  select c.id into v_id
  from public.dm_conversations c
  where c.participant_low = v_low and c.participant_high = v_high;

  if v_id is null then
    begin
      insert into public.dm_conversations (participant_low, participant_high)
      values (v_low, v_high)
      returning id into v_id;
    exception
      when unique_violation then
        select c.id into v_id
        from public.dm_conversations c
        where c.participant_low = v_low and c.participant_high = v_high;
    end;

    insert into public.dm_participants (conversation_id, user_id, last_read_at)
    values
      (v_id, v_uid, now()),
      (v_id, p_other_id, null)
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', v_id,
    'other_id', p_other_id
  );
end;
$$;

revoke all on function public.open_or_get_dm(uuid) from public;
grant execute on function public.open_or_get_dm(uuid) to authenticated;

create or replace function public.send_dm(
  p_conversation_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
  v_body text := left(trim(coalesce(p_body, '')), 2000);
  v_id bigint;
  v_created timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;
  if length(v_body) = 0 then
    raise exception 'body_required';
  end if;

  if not exists (
    select 1 from public.dm_participants p
    where p.conversation_id = p_conversation_id and p.user_id = v_uid
  ) then
    raise exception 'not_participant';
  end if;

  select p.user_id into v_other
  from public.dm_participants p
  where p.conversation_id = p_conversation_id
    and p.user_id <> v_uid
  limit 1;

  if v_other is null then
    raise exception 'conversation_invalid';
  end if;

  if to_regclass('public.user_blocks') is not null
     and public.users_are_blocked(v_uid, v_other) then
    raise exception 'blocked';
  end if;

  insert into public.dm_messages (conversation_id, sender_id, body)
  values (p_conversation_id, v_uid, v_body)
  returning id, created_at into v_id, v_created;

  update public.dm_conversations
  set updated_at = v_created
  where id = p_conversation_id;

  update public.dm_participants
  set last_read_at = v_created
  where conversation_id = p_conversation_id and user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'message_id', v_id,
    'conversation_id', p_conversation_id,
    'sender_id', v_uid,
    'body', v_body,
    'created_at', v_created
  );
end;
$$;

revoke all on function public.send_dm(uuid, text) from public;
grant execute on function public.send_dm(uuid, text) to authenticated;

create or replace function public.mark_dm_read(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  update public.dm_participants
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and user_id = v_uid;

  if not found then
    raise exception 'not_participant';
  end if;

  return jsonb_build_object('ok', true, 'conversation_id', p_conversation_id);
end;
$$;

revoke all on function public.mark_dm_read(uuid) from public;
grant execute on function public.mark_dm_read(uuid) to authenticated;

-- Extend block: keep history but DMs cannot continue (send/open check blocked).
-- Also drop people/artist/playlist follows (same as prior block migrations).
create or replace function public.toggle_user_block(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_user_id is null then
    raise exception 'user_required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_block_self';
  end if;

  select exists (
    select 1 from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id
  ) into v_exists;

  if v_exists then
    delete from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id;
    return jsonb_build_object(
      'blocked', false,
      'user_id', p_user_id
    );
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id)
  on conflict do nothing;

  if to_regclass('public.people_follows') is not null then
    delete from public.people_follows
    where (follower_id = v_uid and person_id = p_user_id)
       or (follower_id = p_user_id and person_id = v_uid);
  end if;

  if to_regclass('public.artist_follows') is not null then
    delete from public.artist_follows
    where (follower_id = v_uid and artist_id = p_user_id)
       or (follower_id = p_user_id and artist_id = v_uid);
  end if;

  if to_regclass('public.playlist_follows') is not null
     and to_regclass('public.playlists') is not null then
    delete from public.playlist_follows pf
    using public.playlists p
    where pf.playlist_id = p.id
      and (
        (pf.follower_id = v_uid and p.user_id = p_user_id)
        or (pf.follower_id = p_user_id and p.user_id = v_uid)
      );
  end if;

  return jsonb_build_object(
    'blocked', true,
    'user_id', p_user_id
  );
end;
$$;

revoke all on function public.toggle_user_block(uuid) from public;
grant execute on function public.toggle_user_block(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260830_direct_messages.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260831_artist_os_delivery_suite.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist OS Delivery Suite + launch scheduling + tip→wallet
-- Paste in Supabase SQL Editor after monetization / taali_fields
-- ============================================================

-- Scheduled RECT launch (appear on New / New Wave when live)
alter table public.tracks
  add column if not exists launch_at timestamptz,
  add column if not exists upc_code text,
  add column if not exists isrc_code text;

-- Distribution releases (RECT UI → Taali → DSPs)
create table if not exists public.distribution_releases (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  upc text,
  release_date date,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'submitted', 'live', 'failed', 'takedown')),
  taali_release_id text,
  cover_art_url text,
  territories text[] not null default '{}',
  dsp_targets text[] not null default '{}',
  smart_link_slug text unique,
  store_links jsonb not null default '{}'::jsonb,
  last_error text,
  submitted_at timestamptz,
  live_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists distribution_releases_artist_idx
  on public.distribution_releases (artist_id, created_at desc);
create index if not exists distribution_releases_status_idx
  on public.distribution_releases (status);

create table if not exists public.distribution_release_tracks (
  id bigserial primary key,
  release_id uuid not null references public.distribution_releases (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  isrc text,
  track_number integer not null default 1,
  taali_track_id text,
  unique (release_id, track_id)
);

create index if not exists distribution_release_tracks_track_idx
  on public.distribution_release_tracks (track_id);

create table if not exists public.distribution_delivery_events (
  id bigserial primary key,
  release_id uuid not null references public.distribution_releases (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.distribution_releases enable row level security;
alter table public.distribution_release_tracks enable row level security;
alter table public.distribution_delivery_events enable row level security;

drop policy if exists "distribution_releases_own" on public.distribution_releases;
create policy "distribution_releases_own"
  on public.distribution_releases for all
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "distribution_releases_select_public_live" on public.distribution_releases;
create policy "distribution_releases_select_public_live"
  on public.distribution_releases for select
  to anon, authenticated
  using (status = 'live' and smart_link_slug is not null);

drop policy if exists "distribution_release_tracks_own" on public.distribution_release_tracks;
create policy "distribution_release_tracks_own"
  on public.distribution_release_tracks for all
  to authenticated
  using (
    exists (
      select 1 from public.distribution_releases r
      where r.id = release_id and r.artist_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.distribution_releases r
      where r.id = release_id and r.artist_id = auth.uid()
    )
  );

drop policy if exists "distribution_release_tracks_public" on public.distribution_release_tracks;
create policy "distribution_release_tracks_public"
  on public.distribution_release_tracks for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.distribution_releases r
      where r.id = release_id and r.status = 'live'
    )
  );

drop policy if exists "distribution_delivery_events_own" on public.distribution_delivery_events;
create policy "distribution_delivery_events_own"
  on public.distribution_delivery_events for select
  to authenticated
  using (
    exists (
      select 1 from public.distribution_releases r
      where r.id = release_id and r.artist_id = auth.uid()
    )
  );

-- Tip confirms credit artist JOKO wallet ledger
create or replace function public.credit_tip_to_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed'
     and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    if to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null then
      perform public.credit_artist_wallet(
        new.artist_id,
        new.amount_xof,
        'tip',
        'tip:' || new.id::text,
        coalesce(new.payment_method, 'joko')
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists artist_tips_credit_wallet on public.artist_tips;
create trigger artist_tips_credit_wallet
  after insert or update of status on public.artist_tips
  for each row
  execute function public.credit_tip_to_wallet();

-- New Wave: tracks live on RECT that launched recently (or no schedule = live now)
create or replace function public.new_wave_tracks(p_limit integer default 40)
returns table (
  track_id uuid,
  title text,
  artist_id uuid,
  cover_art_url text,
  launch_at timestamptz,
  created_at timestamptz
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
    t.cover_art_url,
    coalesce(t.launch_at, t.created_at) as launch_at,
    t.created_at
  from public.tracks t
  where coalesce(t.status, 'live') in ('live', 'published')
    and t.audio_url is not null
    and (
      t.launch_at is null
      or t.launch_at <= now()
    )
  order by coalesce(t.launch_at, t.created_at) desc nulls last
  limit greatest(least(coalesce(p_limit, 40), 80), 1);
$$;

revoke all on function public.new_wave_tracks(integer) from public;
grant execute on function public.new_wave_tracks(integer) to anon, authenticated;

-- Hide future-scheduled tracks from public catalog queries via helper
create or replace function public.track_is_publicly_live(p_status text, p_launch_at timestamptz)
returns boolean
language sql
immutable
as $$
  select coalesce(p_status, 'live') in ('live', 'published')
    and (p_launch_at is null or p_launch_at <= now());
$$;

notify pgrst, 'reload schema';

-- END 20260831_artist_os_delivery_suite.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260831_joko_tips.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- JOKO tips — pending → confirm → wallet (via tip→wallet trigger)
-- Paste AFTER 20260831_artist_os_delivery_suite.sql
-- ============================================================

alter table public.artist_tips
  add column if not exists joko_reference text;

create index if not exists artist_tips_joko_reference_idx
  on public.artist_tips (joko_reference)
  where joko_reference is not null;

-- Create tip in pending; confirm after JOKO payment
create or replace function public.create_pending_artist_tip(
  p_artist_id uuid,
  p_amount_xof integer,
  p_payment_method text,
  p_message text default null,
  p_track_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tip_id bigint;
  v_artist_ok boolean;
  v_message text;
  v_track text;
  v_track_ok boolean;
  v_method text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_artist_id is null then
    raise exception 'artist_required';
  end if;
  if p_artist_id = v_uid then
    raise exception 'cannot_tip_self';
  end if;
  if p_amount_xof not in (100, 200, 500) then
    raise exception 'invalid_amount';
  end if;

  v_method := lower(trim(coalesce(p_payment_method, 'wave')));
  if v_method not in (
    'wave', 'orange_money', 'mtn_momo', 'mobile_money', 'joko_wallet', 'debit'
  ) then
    raise exception 'invalid_payment_method';
  end if;

  select exists (
    select 1 from public.users u
    where u.id = p_artist_id
      and (u.account_type = 'artist' or u.role = 'artist')
  ) into v_artist_ok;
  if not v_artist_ok then
    raise exception 'artist_not_found';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is not null and char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  v_track := nullif(trim(coalesce(p_track_id, '')), '');
  if v_track is not null then
    select exists (
      select 1 from public.tracks t
      where t.id::text = v_track and t.artist_id = p_artist_id
    ) into v_track_ok;
    if not v_track_ok then
      v_track := null;
    end if;
  end if;

  insert into public.artist_tips (
    from_user_id, artist_id, amount_xof, status, payment_method, message, track_id
  )
  values (
    v_uid, p_artist_id, p_amount_xof, 'pending', v_method, v_message, v_track
  )
  returning id into v_tip_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', v_tip_id,
    'artist_id', p_artist_id,
    'amount_xof', p_amount_xof,
    'payment_method', v_method,
    'status', 'pending',
    'message', v_message,
    'track_id', v_track
  );
end;
$$;

revoke all on function public.create_pending_artist_tip(uuid, integer, text, text, text) from public;
grant execute on function public.create_pending_artist_tip(uuid, integer, text, text, text) to authenticated;

create or replace function public.set_tip_joko_reference(
  p_tip_id bigint,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.artist_tips
  set joko_reference = nullif(trim(p_reference), '')
  where id = p_tip_id
    and from_user_id = auth.uid()
    and status = 'pending';
end;
$$;

revoke all on function public.set_tip_joko_reference(bigint, text) from public;
grant execute on function public.set_tip_joko_reference(bigint, text) to authenticated;

-- System confirm (webhook / demo instant)
create or replace function public.confirm_artist_tip_system(p_tip_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tip public.artist_tips%rowtype;
begin
  select * into v_tip from public.artist_tips where id = p_tip_id for update;
  if not found then
    raise exception 'tip_not_found';
  end if;
  if v_tip.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'already', true, 'tip_id', p_tip_id);
  end if;
  if v_tip.status is distinct from 'pending' then
    raise exception 'tip_not_pending';
  end if;

  update public.artist_tips
  set status = 'confirmed'
  where id = p_tip_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', p_tip_id,
    'artist_id', v_tip.artist_id,
    'amount_xof', v_tip.amount_xof
  );
end;
$$;

revoke all on function public.confirm_artist_tip_system(bigint) from public;
-- service role only via admin client; no grant to authenticated

notify pgrst, 'reload schema';

-- END 20260831_joko_tips.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260903_listening_card_events.sql
-- ═══════════════════════════════════════════════════════════
-- RECT listening cards — track share / card opens for analytics + royalties later.
-- Safe to re-run.

create table if not exists public.listening_card_events (
  id bigserial primary key,
  track_id uuid not null references public.tracks (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null
    check (event_type in ('view', 'share', 'copy_link', 'send_friend', 'open_card')),
  channel text,
  recipient_id uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists listening_card_events_track_created_idx
  on public.listening_card_events (track_id, created_at desc);

create index if not exists listening_card_events_actor_created_idx
  on public.listening_card_events (actor_id, created_at desc)
  where actor_id is not null;

alter table public.listening_card_events enable row level security;

drop policy if exists "listening_card_events_insert_own" on public.listening_card_events;
create policy "listening_card_events_insert_own"
  on public.listening_card_events for insert
  to authenticated
  with check (actor_id is null or actor_id = auth.uid());

drop policy if exists "listening_card_events_select_artist" on public.listening_card_events;
create policy "listening_card_events_select_artist"
  on public.listening_card_events for select
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id and t.artist_id = auth.uid()
    )
    or actor_id = auth.uid()
  );

notify pgrst, 'reload schema';

-- END 20260903_listening_card_events.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260903_artist_store_layout.sql
-- ═══════════════════════════════════════════════════════════
-- Artist store layout preference for fan World page (grid | rail | featured).
alter table public.users
  add column if not exists artist_store_layout text;

alter table public.users
  drop constraint if exists users_artist_store_layout_check;

alter table public.users
  add constraint users_artist_store_layout_check
  check (
    artist_store_layout is null
    or artist_store_layout in ('grid', 'rail', 'featured')
  );

comment on column public.users.artist_store_layout is
  'RECT Artist store template: grid | rail | featured';

-- END 20260903_artist_store_layout.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260903_listening_parties.sql
-- ═══════════════════════════════════════════════════════════
-- Listening parties: host a shared listen with chat (photos/gifs later).

create table if not exists public.listening_parties (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  track_id uuid references public.tracks (id) on delete set null,
  status text not null default 'live'
    check (status in ('scheduled', 'live', 'ended')),
  invite_code text not null unique,
  cover_url text,
  starts_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listening_parties_host_idx
  on public.listening_parties (host_id, created_at desc);

create index if not exists listening_parties_live_idx
  on public.listening_parties (status, created_at desc)
  where status = 'live';

create table if not exists public.listening_party_members (
  party_id uuid not null references public.listening_parties (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);

create index if not exists listening_party_members_user_idx
  on public.listening_party_members (user_id);

create table if not exists public.listening_party_messages (
  id bigserial primary key,
  party_id uuid not null references public.listening_parties (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  body text not null,
  kind text not null default 'text'
    check (kind in ('text', 'gif', 'photo')),
  media_url text,
  created_at timestamptz not null default now()
);

create index if not exists listening_party_messages_party_idx
  on public.listening_party_messages (party_id, created_at desc);

alter table public.listening_parties enable row level security;
alter table public.listening_party_members enable row level security;
alter table public.listening_party_messages enable row level security;

drop policy if exists "listening_parties_select" on public.listening_parties;
create policy "listening_parties_select"
  on public.listening_parties for select
  using (
    status = 'live'
    or host_id = auth.uid()
    or exists (
      select 1 from public.listening_party_members m
      where m.party_id = id and m.user_id = auth.uid()
    )
  );

drop policy if exists "listening_parties_insert" on public.listening_parties;
create policy "listening_parties_insert"
  on public.listening_parties for insert
  with check (host_id = auth.uid());

drop policy if exists "listening_parties_update" on public.listening_parties;
create policy "listening_parties_update"
  on public.listening_parties for update
  using (host_id = auth.uid());

drop policy if exists "listening_party_members_select" on public.listening_party_members;
create policy "listening_party_members_select"
  on public.listening_party_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.listening_parties p
      where p.id = party_id and p.host_id = auth.uid()
    )
  );

drop policy if exists "listening_party_members_insert" on public.listening_party_members;
create policy "listening_party_members_insert"
  on public.listening_party_members for insert
  with check (user_id = auth.uid());

drop policy if exists "listening_party_messages_select" on public.listening_party_messages;
create policy "listening_party_messages_select"
  on public.listening_party_messages for select
  using (
    exists (
      select 1 from public.listening_parties p
      where p.id = party_id
        and (
          p.host_id = auth.uid()
          or p.status = 'live'
          or exists (
            select 1 from public.listening_party_members m
            where m.party_id = p.id and m.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "listening_party_messages_insert" on public.listening_party_messages;
create policy "listening_party_messages_insert"
  on public.listening_party_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.listening_parties p
      where p.id = party_id
        and p.status = 'live'
        and (
          p.host_id = auth.uid()
          or exists (
            select 1 from public.listening_party_members m
            where m.party_id = p.id and m.user_id = auth.uid()
          )
        )
    )
  );

create or replace function public.create_listening_party(
  p_title text,
  p_track_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  v_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.listening_parties (host_id, title, track_id, status, invite_code, starts_at)
  values (auth.uid(), trim(p_title), p_track_id, 'live', v_code, now())
  returning id into v_id;
  insert into public.listening_party_members (party_id, user_id)
  values (v_id, auth.uid())
  on conflict do nothing;
  return v_id;
end;
$$;

grant execute on function public.create_listening_party(text, uuid) to authenticated;

-- END 20260903_listening_parties.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260903_rect_labels.sql
-- ═══════════════════════════════════════════════════════════
-- RECT Labels: mutual accept between label and artist.

alter table public.users
  drop constraint if exists users_account_type_check;

alter table public.users
  add constraint users_account_type_check
  check (account_type is null or account_type in ('fan', 'artist', 'label'));

create table if not exists public.rect_labels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  slug text unique,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rect_labels_owner_unique
  on public.rect_labels (owner_id);

create table if not exists public.rect_label_memberships (
  id uuid primary key default gen_random_uuid(),
  label_id uuid not null references public.rect_labels (id) on delete cascade,
  artist_id uuid not null references public.users (id) on delete cascade,
  -- pending = one side invited; accepted = both confirmed; declined/ended
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'ended')),
  invited_by uuid not null references public.users (id),
  -- who still needs to accept (null when accepted)
  awaiting_user_id uuid references public.users (id),
  artist_accepted_at timestamptz,
  label_accepted_at timestamptz,
  revenue_split_label_pct numeric(5,2) default 20
    check (revenue_split_label_pct >= 0 and revenue_split_label_pct <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (label_id, artist_id)
);

create index if not exists rect_label_memberships_artist_idx
  on public.rect_label_memberships (artist_id, status);

create index if not exists rect_label_memberships_label_status_idx
  on public.rect_label_memberships (label_id, status);

alter table public.rect_labels enable row level security;
alter table public.rect_label_memberships enable row level security;

drop policy if exists "rect_labels_select" on public.rect_labels;
create policy "rect_labels_select"
  on public.rect_labels for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.rect_label_memberships m
      where m.label_id = id
        and m.artist_id = auth.uid()
        and m.status in ('pending', 'accepted')
    )
  );

drop policy if exists "rect_labels_insert" on public.rect_labels;
create policy "rect_labels_insert"
  on public.rect_labels for insert
  with check (owner_id = auth.uid());

drop policy if exists "rect_labels_update" on public.rect_labels;
create policy "rect_labels_update"
  on public.rect_labels for update
  using (owner_id = auth.uid());

drop policy if exists "rect_label_memberships_select" on public.rect_label_memberships;
create policy "rect_label_memberships_select"
  on public.rect_label_memberships for select
  using (
    artist_id = auth.uid()
    or exists (
      select 1 from public.rect_labels l
      where l.id = label_id and l.owner_id = auth.uid()
    )
  );

drop policy if exists "rect_label_memberships_insert" on public.rect_label_memberships;
create policy "rect_label_memberships_insert"
  on public.rect_label_memberships for insert
  with check (
    invited_by = auth.uid()
    and (
      artist_id = auth.uid()
      or exists (
        select 1 from public.rect_labels l
        where l.id = label_id and l.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "rect_label_memberships_update" on public.rect_label_memberships;
create policy "rect_label_memberships_update"
  on public.rect_label_memberships for update
  using (
    artist_id = auth.uid()
    or exists (
      select 1 from public.rect_labels l
      where l.id = label_id and l.owner_id = auth.uid()
    )
  );

create or replace function public.create_rect_label(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then
    v_slug := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;
  insert into public.rect_labels (owner_id, name, slug)
  values (auth.uid(), trim(p_name), v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_rect_label(text) to authenticated;

-- END 20260903_rect_labels.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260903_track_audio_qc.sql
-- ═══════════════════════════════════════════════════════════
-- Track audio QC (Upload QC / go-live gate). RECT Punch mastering comes later.

alter table public.tracks
  add column if not exists qc_status text;

alter table public.tracks
  drop constraint if exists tracks_qc_status_check;

alter table public.tracks
  add constraint tracks_qc_status_check
  check (
    qc_status is null
    or qc_status in ('pending', 'pass', 'warn', 'fail')
  );

alter table public.tracks
  add column if not exists qc_checked_at timestamptz;

alter table public.tracks
  add column if not exists qc_sample_rate integer;

alter table public.tracks
  add column if not exists qc_channels smallint;

alter table public.tracks
  add column if not exists qc_lufs_integrated numeric;

alter table public.tracks
  add column if not exists qc_true_peak_dbtp numeric;

alter table public.tracks
  add column if not exists qc_silence_ratio numeric;

alter table public.tracks
  add column if not exists qc_issues jsonb;

comment on column public.tracks.qc_status is
  'Upload QC: pending|pass|warn|fail — fail blocks go-live';
comment on column public.tracks.qc_lufs_integrated is
  'Integrated loudness LUFS (aim ~-14)';
comment on column public.tracks.qc_true_peak_dbtp is
  'True peak dBTP (must be <= -1)';

-- END 20260903_track_audio_qc.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260904_hearing_aids_and_punch.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260904_hearing_aids_and_punch.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260904_listener_behavior_affinity.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260904_listener_behavior_affinity.sql

