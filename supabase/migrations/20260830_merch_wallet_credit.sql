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
