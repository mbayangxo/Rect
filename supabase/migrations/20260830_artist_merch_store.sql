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
