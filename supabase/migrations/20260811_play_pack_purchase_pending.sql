-- ============================================================
-- Play pack purchase state machine: pending → confirmed
-- Paste in Supabase SQL Editor → Run
--
-- Buy creates a pending purchase (no credits yet).
-- confirm_play_pack_purchase grants credits after "payment"
-- (demo confirm until a real rail exists).
-- ============================================================

-- Buy: pending only — do not credit balance yet
create or replace function public.purchase_play_pack(p_pack_id bigint)
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
    user_id, pack_id, credits_granted, price_xof, status, payment_method
  )
  values (
    v_uid,
    v_pack.id,
    v_credits,
    v_pack.price_xof,
    'pending',
    'stub'
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
    'price_label', v_pack.price_label
  );
end;
$$;

revoke all on function public.purchase_play_pack(bigint) from public;
grant execute on function public.purchase_play_pack(bigint) to authenticated;

-- Confirm pending purchase (demo payment complete) → grant credits
create or replace function public.confirm_play_pack_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.play_pack_purchases%rowtype;
  v_new_balance integer;
  v_pack_name text;
  v_pack_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
  from public.play_pack_purchases
  where id = p_purchase_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    select credits into v_new_balance
    from public.user_play_balances
    where user_id = v_uid;

    select code, name into v_pack_code, v_pack_name
    from public.play_packs
    where id = v_row.pack_id;

    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'purchase_id', v_row.id,
      'credits_granted', v_row.credits_granted,
      'balance', coalesce(v_new_balance, 0),
      'pack_code', v_pack_code,
      'pack_name', v_pack_name,
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
  values (v_uid, v_row.credits_granted, now())
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

revoke all on function public.confirm_play_pack_purchase(bigint) from public;
grant execute on function public.confirm_play_pack_purchase(bigint) to authenticated;

-- Optional: abandon a pending purchase
create or replace function public.cancel_play_pack_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.play_pack_purchases%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
  from public.play_pack_purchases
  where id = p_purchase_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  update public.play_pack_purchases
  set status = 'failed'
  where id = v_row.id;

  return jsonb_build_object('ok', true, 'status', 'failed', 'purchase_id', v_row.id);
end;
$$;

revoke all on function public.cancel_play_pack_purchase(bigint) from public;
grant execute on function public.cancel_play_pack_purchase(bigint) to authenticated;

notify pgrst, 'reload schema';
