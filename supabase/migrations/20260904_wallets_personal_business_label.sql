-- ============================================================
-- RECT wallets: Personal · Business (artist) · Label (owner only)
-- Paste after 20260903_rect_labels.sql + 20260904_label_revenue_split_wallet.sql
-- Safe to re-run.
-- ============================================================

-- 1) Allow label_split on artist ledger (legacy rows) + personal/business clarity
do $$
begin
  if to_regclass('public.artist_wallet_ledger') is not null then
    alter table public.artist_wallet_ledger
      drop constraint if exists artist_wallet_ledger_kind_check;
    alter table public.artist_wallet_ledger
      add constraint artist_wallet_ledger_kind_check
      check (kind in (
        'stream', 'download', 'merch', 'fan_club', 'tip', 'payout',
        'adjustment', 'ticket', 'label_split', 'label_split_reversal',
        'personal_payout', 'business_payout'
      ));
  end if;
end $$;

-- 2) Label wallets (separate from artist personal/business)
create table if not exists public.label_wallets (
  label_id uuid primary key references public.rect_labels (id) on delete cascade,
  payout_phone text,
  next_payout_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.label_wallet_ledger (
  id bigserial primary key,
  label_id uuid not null references public.rect_labels (id) on delete cascade,
  kind text not null
    check (kind in (
      'label_split', 'label_split_reversal', 'payout', 'adjustment'
    )),
  amount_xof integer not null,
  source_artist_id uuid references public.users (id) on delete set null,
  reference_id text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists label_wallet_ledger_label_created_idx
  on public.label_wallet_ledger (label_id, created_at desc);

alter table public.label_wallets enable row level security;
alter table public.label_wallet_ledger enable row level security;

drop policy if exists "label_wallets_select_owner" on public.label_wallets;
create policy "label_wallets_select_owner"
  on public.label_wallets for select
  using (
    exists (
      select 1 from public.rect_labels l
      where l.id = label_id and l.owner_id = auth.uid()
    )
  );

drop policy if exists "label_wallets_update_owner" on public.label_wallets;
create policy "label_wallets_update_owner"
  on public.label_wallets for update
  using (
    exists (
      select 1 from public.rect_labels l
      where l.id = label_id and l.owner_id = auth.uid()
    )
  );

drop policy if exists "label_wallet_ledger_select_owner" on public.label_wallet_ledger;
create policy "label_wallet_ledger_select_owner"
  on public.label_wallet_ledger for select
  using (
    exists (
      select 1 from public.rect_labels l
      where l.id = label_id and l.owner_id = auth.uid()
    )
  );

create or replace function public.ensure_label_wallet(p_label_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_label_id is null then
    return;
  end if;
  insert into public.label_wallets (label_id)
  values (p_label_id)
  on conflict (label_id) do nothing;
end;
$$;

revoke all on function public.ensure_label_wallet(uuid) from public;
grant execute on function public.ensure_label_wallet(uuid) to service_role;
grant execute on function public.ensure_label_wallet(uuid) to authenticated;

-- 3) credit_artist_wallet → artist personal/business kinds; label share → label_wallets
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
  v_kind text := coalesce(nullif(trim(p_kind), ''), 'adjustment');
  v_label_id uuid;
  v_label_owner uuid;
  v_split numeric(5,2);
  v_label_amt integer;
  v_artist_amt integer;
  v_ref text := nullif(trim(coalesce(p_reference_id, '')), '');
  v_desc text := nullif(trim(coalesce(p_description, '')), '');
begin
  if p_artist_id is null or p_amount_xof is null or p_amount_xof = 0 then
    return null;
  end if;

  -- Direct label ledger credit (no re-split) — legacy path still writes artist ledger
  -- when kind is label_split; prefer label_wallets via split branch below.
  if v_kind in ('label_split', 'label_split_reversal') then
    -- Prefer routing to the owner's label wallet when they own a label
    select l.id into v_label_id
    from public.rect_labels l
    where l.owner_id = p_artist_id
    order by l.created_at asc
    limit 1;

    if v_label_id is not null and to_regclass('public.label_wallet_ledger') is not null then
      perform public.ensure_label_wallet(v_label_id);
      insert into public.label_wallet_ledger (
        label_id, kind, amount_xof, source_artist_id, reference_id, description
      )
      values (
        v_label_id, v_kind, p_amount_xof, null, v_ref, v_desc
      )
      returning id into v_id;
      update public.label_wallets set updated_at = now() where label_id = v_label_id;
      return v_id;
    end if;

    perform public.ensure_artist_wallet(p_artist_id);
    insert into public.artist_wallet_ledger (
      artist_id, kind, amount_xof, reference_id, description
    )
    values (p_artist_id, v_kind, p_amount_xof, v_ref, v_desc)
    returning id into v_id;
    update public.artist_wallets set updated_at = now() where artist_id = p_artist_id;
    return v_id;
  end if;

  v_label_id := null;
  v_label_owner := null;
  v_split := 0;

  if to_regclass('public.rect_label_memberships') is not null
     and to_regclass('public.rect_labels') is not null then
    select m.label_id, l.owner_id, coalesce(m.revenue_split_label_pct, 0)
      into v_label_id, v_label_owner, v_split
    from public.rect_label_memberships m
    join public.rect_labels l on l.id = m.label_id
    where m.artist_id = p_artist_id
      and m.status = 'accepted'
      and l.owner_id is not null
      and l.owner_id <> p_artist_id
    order by m.artist_accepted_at desc nulls last, m.created_at desc
    limit 1;
  end if;

  if v_label_id is not null
     and v_split is not null
     and v_split > 0
     and p_amount_xof > 0 then
    v_label_amt := floor(p_amount_xof * least(greatest(v_split, 0), 100) / 100.0)::integer;
    if v_label_amt < 0 then v_label_amt := 0; end if;
    if v_label_amt > abs(p_amount_xof) then v_label_amt := abs(p_amount_xof); end if;
    if p_amount_xof < 0 then v_label_amt := -v_label_amt; end if;
    v_artist_amt := p_amount_xof - v_label_amt;

    if v_artist_amt <> 0 then
      perform public.ensure_artist_wallet(p_artist_id);
      insert into public.artist_wallet_ledger (
        artist_id, kind, amount_xof, reference_id, description
      )
      values (
        p_artist_id,
        v_kind,
        v_artist_amt,
        v_ref,
        coalesce(v_desc, 'Artist share after label split')
      )
      returning id into v_id;
      update public.artist_wallets set updated_at = now() where artist_id = p_artist_id;
    end if;

    if v_label_amt <> 0 and to_regclass('public.label_wallet_ledger') is not null then
      perform public.ensure_label_wallet(v_label_id);
      insert into public.label_wallet_ledger (
        label_id, kind, amount_xof, source_artist_id, reference_id, description
      )
      values (
        v_label_id,
        'label_split',
        v_label_amt,
        p_artist_id,
        coalesce(v_ref, p_artist_id::text),
        coalesce(
          v_desc,
          format('Label split %s%% from artist %s', v_split::text, p_artist_id::text)
        )
      );
      update public.label_wallets set updated_at = now() where label_id = v_label_id;
    elsif v_label_amt <> 0 and v_label_owner is not null then
      -- Fallback if label_wallets missing
      perform public.ensure_artist_wallet(v_label_owner);
      insert into public.artist_wallet_ledger (
        artist_id, kind, amount_xof, reference_id, description
      )
      values (
        v_label_owner, 'label_split', v_label_amt,
        coalesce(v_ref, p_artist_id::text),
        coalesce(v_desc, 'Label split (legacy artist wallet)')
      );
      update public.artist_wallets set updated_at = now() where artist_id = v_label_owner;
    end if;

    return v_id;
  end if;

  perform public.ensure_artist_wallet(p_artist_id);
  insert into public.artist_wallet_ledger (
    artist_id, kind, amount_xof, reference_id, description
  )
  values (p_artist_id, v_kind, p_amount_xof, v_ref, v_desc)
  returning id into v_id;
  update public.artist_wallets set updated_at = now() where artist_id = p_artist_id;
  return v_id;
end;
$$;

revoke all on function public.credit_artist_wallet(uuid, integer, text, text, text) from public;
grant execute on function public.credit_artist_wallet(uuid, integer, text, text, text) to service_role;

-- 4) Artist breakdown: business vs personal (tips); exclude label_split from artist totals
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
  v_business integer := 0;
  v_personal integer := 0;
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
    coalesce(sum(
      case when kind not in ('label_split', 'label_split_reversal')
        then amount_xof else 0 end
    ), 0),
    coalesce(sum(
      case when kind in ('stream','download','merch','fan_club','ticket','business_payout','adjustment')
        then amount_xof else 0 end
    ), 0),
    coalesce(sum(
      case when kind in ('tip','personal_payout')
        then amount_xof else 0 end
    ), 0),
    coalesce(sum(case when kind = 'stream' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'download' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'merch' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'fan_club' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'tip' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'ticket' and amount_xof > 0 then amount_xof else 0 end), 0)
  into v_balance, v_business, v_personal, v_streams, v_downloads, v_merch, v_fan_club, v_tips, v_tickets
  from public.artist_wallet_ledger
  where artist_id = v_artist;

  return jsonb_build_object(
    'ok', true,
    'balance_xof', v_balance,
    'business_xof', v_business,
    'personal_xof', v_personal,
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

-- 5) Label wallet breakdown (owner only)
create or replace function public.label_wallet_balance_breakdown(p_label_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_balance integer := 0;
  v_splits integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_label_id is null then raise exception 'label_required'; end if;

  select owner_id into v_owner from public.rect_labels where id = p_label_id;
  if v_owner is null then raise exception 'label_not_found'; end if;
  if v_owner <> v_uid then raise exception 'forbidden'; end if;

  if to_regclass('public.label_wallet_ledger') is null then
    return jsonb_build_object('ok', true, 'balance_xof', 0, 'splits_xof', 0, 'ready', false);
  end if;

  select
    coalesce(sum(amount_xof), 0),
    coalesce(sum(case when kind = 'label_split' and amount_xof > 0 then amount_xof else 0 end), 0)
  into v_balance, v_splits
  from public.label_wallet_ledger
  where label_id = p_label_id;

  return jsonb_build_object(
    'ok', true,
    'ready', true,
    'balance_xof', v_balance,
    'splits_xof', v_splits
  );
end;
$$;

revoke all on function public.label_wallet_balance_breakdown(uuid) from public;
grant execute on function public.label_wallet_balance_breakdown(uuid) to authenticated;

-- 6) Backfill: move legacy label_split rows from owner artist wallet → label_wallets
do $$
declare
  r record;
  v_label uuid;
begin
  if to_regclass('public.label_wallet_ledger') is null then
    return;
  end if;

  for r in
    select awl.id, awl.artist_id, awl.kind, awl.amount_xof, awl.reference_id, awl.description, awl.created_at
    from public.artist_wallet_ledger awl
    where awl.kind in ('label_split', 'label_split_reversal')
  loop
    select l.id into v_label
    from public.rect_labels l
    where l.owner_id = r.artist_id
    order by l.created_at asc
    limit 1;

    if v_label is null then
      continue;
    end if;

    perform public.ensure_label_wallet(v_label);
    insert into public.label_wallet_ledger (
      label_id, kind, amount_xof, source_artist_id, reference_id, description, created_at
    )
    values (
      v_label, r.kind, r.amount_xof, null, r.reference_id, r.description, r.created_at
    );
    delete from public.artist_wallet_ledger where id = r.id;
  end loop;
end $$;

notify pgrst, 'reload schema';
