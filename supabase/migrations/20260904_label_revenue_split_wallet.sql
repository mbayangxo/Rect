-- ============================================================
-- RECT Label revenue split → artist + label owner wallets
-- Paste in Supabase SQL Editor after 20260903_rect_labels.sql
-- Safe to re-run.
-- ============================================================

-- When an accepted label membership exists, credit_artist_wallet splits
-- p_amount_xof by revenue_split_label_pct (label share) / remainder (artist).

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

  -- Do not re-split label_split / adjustment ledger lines.
  if v_kind in ('label_split', 'label_split_reversal') then
    perform public.ensure_artist_wallet(p_artist_id);
    insert into public.artist_wallet_ledger (
      artist_id, kind, amount_xof, reference_id, description
    )
    values (p_artist_id, v_kind, p_amount_xof, v_ref, v_desc)
    returning id into v_id;
    update public.artist_wallets
      set updated_at = now()
      where artist_id = p_artist_id;
    return v_id;
  end if;

  v_label_owner := null;
  v_split := 0;

  if to_regclass('public.rect_label_memberships') is not null
     and to_regclass('public.rect_labels') is not null then
    select l.owner_id, coalesce(m.revenue_split_label_pct, 0)
      into v_label_owner, v_split
    from public.rect_label_memberships m
    join public.rect_labels l on l.id = m.label_id
    where m.artist_id = p_artist_id
      and m.status = 'accepted'
      and l.owner_id is not null
      and l.owner_id <> p_artist_id
    order by m.artist_accepted_at desc nulls last, m.created_at desc
    limit 1;
  end if;

  if v_label_owner is not null
     and v_split is not null
     and v_split > 0
     and p_amount_xof > 0 then
    v_label_amt := floor(p_amount_xof * least(greatest(v_split, 0), 100) / 100.0)::integer;
    if v_label_amt < 0 then
      v_label_amt := 0;
    end if;
    if v_label_amt > abs(p_amount_xof) then
      v_label_amt := abs(p_amount_xof);
    end if;
    -- Preserve sign for negative adjustments
    if p_amount_xof < 0 then
      v_label_amt := -v_label_amt;
    end if;
    v_artist_amt := p_amount_xof - v_label_amt;

    -- Artist share
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
      update public.artist_wallets
        set updated_at = now()
        where artist_id = p_artist_id;
    end if;

    -- Label owner share
    if v_label_amt <> 0 then
      perform public.ensure_artist_wallet(v_label_owner);
      insert into public.artist_wallet_ledger (
        artist_id, kind, amount_xof, reference_id, description
      )
      values (
        v_label_owner,
        'label_split',
        v_label_amt,
        coalesce(v_ref, p_artist_id::text),
        coalesce(
          v_desc,
          format('Label split %s%% from artist %s', v_split::text, p_artist_id::text)
        )
      );
      update public.artist_wallets
        set updated_at = now()
        where artist_id = v_label_owner;
    end if;

    return v_id;
  end if;

  -- No label membership — full amount to artist
  perform public.ensure_artist_wallet(p_artist_id);

  insert into public.artist_wallet_ledger (
    artist_id, kind, amount_xof, reference_id, description
  )
  values (
    p_artist_id,
    v_kind,
    p_amount_xof,
    v_ref,
    v_desc
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

notify pgrst, 'reload schema';
