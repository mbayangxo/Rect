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
