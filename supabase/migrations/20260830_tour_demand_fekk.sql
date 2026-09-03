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
