-- ============================================================
-- Artist tips (stub payment) — paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.artist_tips (
  id bigserial primary key,
  from_user_id uuid not null references auth.users (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  amount_xof integer not null check (amount_xof > 0),
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'failed')),
  payment_method text not null default 'stub',
  created_at timestamptz not null default now(),
  constraint artist_tips_no_self check (from_user_id <> artist_id)
);

create index if not exists artist_tips_artist_created_idx
  on public.artist_tips (artist_id, created_at desc);

create index if not exists artist_tips_from_user_idx
  on public.artist_tips (from_user_id, created_at desc);

alter table public.artist_tips enable row level security;

-- Tipper can see own tips
drop policy if exists "artist_tips_select_own" on public.artist_tips;
create policy "artist_tips_select_own"
  on public.artist_tips for select
  to authenticated
  using (from_user_id = auth.uid());

-- Artist can see tips received
drop policy if exists "artist_tips_select_as_artist" on public.artist_tips;
create policy "artist_tips_select_as_artist"
  on public.artist_tips for select
  to authenticated
  using (artist_id = auth.uid());

-- Direct insert fallback (RPC preferred)
drop policy if exists "artist_tips_insert_own" on public.artist_tips;
create policy "artist_tips_insert_own"
  on public.artist_tips for insert
  to authenticated
  with check (from_user_id = auth.uid() and from_user_id <> artist_id);

grant select, insert on public.artist_tips to authenticated;
grant usage, select on sequence public.artist_tips_id_seq to authenticated;

-- Server-owned tip amounts: 100 / 200 / 500 XOF
create or replace function public.send_artist_tip(
  p_artist_id uuid,
  p_amount_xof integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tip_id bigint;
  v_artist_ok boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_artist_id is null then
    raise exception 'artist_required';
  end if;

  if p_artist_id = v_uid then
    raise exception 'cannot_tip_self';
  end if;

  if p_amount_xof not in (100, 200, 500) then
    raise exception 'invalid_amount';
  end if;

  select exists (
    select 1 from public.users u
    where u.id = p_artist_id
      and (
        u.account_type = 'artist'
        or u.role = 'artist'
      )
  ) into v_artist_ok;

  if not v_artist_ok then
    raise exception 'artist_not_found';
  end if;

  insert into public.artist_tips (
    from_user_id, artist_id, amount_xof, status, payment_method
  )
  values (
    v_uid, p_artist_id, p_amount_xof, 'confirmed', 'stub'
  )
  returning id into v_tip_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', v_tip_id,
    'artist_id', p_artist_id,
    'amount_xof', p_amount_xof,
    'payment_method', 'stub'
  );
end;
$$;

revoke all on function public.send_artist_tip(uuid, integer) from public;
grant execute on function public.send_artist_tip(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
