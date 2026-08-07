-- ============================================================
-- Play credits ledger — paste in Supabase SQL Editor → Run
-- Closes the loop: buy pack → credits → consume on play
-- ============================================================

create table if not exists public.user_play_balances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.play_pack_purchases (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_id bigint not null references public.play_packs (id),
  credits_granted integer not null check (credits_granted > 0),
  price_xof integer,
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'failed')),
  payment_method text not null default 'stub',
  created_at timestamptz not null default now()
);

create index if not exists play_pack_purchases_user_id_idx
  on public.play_pack_purchases (user_id);

create index if not exists play_pack_purchases_pack_id_idx
  on public.play_pack_purchases (pack_id);

alter table public.user_play_balances enable row level security;
alter table public.play_pack_purchases enable row level security;

drop policy if exists "user_play_balances_select_own" on public.user_play_balances;
create policy "user_play_balances_select_own"
  on public.user_play_balances for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "play_pack_purchases_select_own" on public.play_pack_purchases;
create policy "play_pack_purchases_select_own"
  on public.play_pack_purchases for select
  to authenticated
  using (user_id = auth.uid());

-- Atomic purchase: insert purchase row + credit balance
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
  v_new_balance integer;
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
    'confirmed',
    'stub'
  )
  returning id into v_purchase_id;

  insert into public.user_play_balances (user_id, credits, updated_at)
  values (v_uid, v_credits, now())
  on conflict (user_id) do update
    set credits = public.user_play_balances.credits + excluded.credits,
        updated_at = now()
  returning credits into v_new_balance;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase_id,
    'credits_granted', v_credits,
    'balance', v_new_balance,
    'pack_code', v_pack.code,
    'pack_name', v_pack.name
  );
end;
$$;

revoke all on function public.purchase_play_pack(bigint) from public;
grant execute on function public.purchase_play_pack(bigint) to authenticated;

-- Ensure balance row exists (starter credits for first listen)
create or replace function public.ensure_play_balance(p_starter integer default 25)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_credits integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.user_play_balances (user_id, credits, updated_at)
  values (v_uid, greatest(p_starter, 0), now())
  on conflict (user_id) do nothing;

  select credits into v_credits
  from public.user_play_balances
  where user_id = v_uid;

  return coalesce(v_credits, 0);
end;
$$;

revoke all on function public.ensure_play_balance(integer) from public;
grant execute on function public.ensure_play_balance(integer) to authenticated;

-- Consume one credit; returns new balance or -1 if insufficient
create or replace function public.consume_play_credit()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Soft-create with 0 if somehow missing (no free starter on consume path)
  insert into public.user_play_balances (user_id, credits, updated_at)
  values (v_uid, 0, now())
  on conflict (user_id) do nothing;

  update public.user_play_balances
  set credits = credits - 1,
      updated_at = now()
  where user_id = v_uid
    and credits > 0
  returning credits into v_new;

  if not found then
    return -1;
  end if;

  return v_new;
end;
$$;

revoke all on function public.consume_play_credit() from public;
grant execute on function public.consume_play_credit() to authenticated;

notify pgrst, 'reload schema';
