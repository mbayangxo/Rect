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
