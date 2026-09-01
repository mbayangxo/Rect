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
