-- ============================================================
-- Artist play earnings (demo XOF per credited listen)
-- Paste in Supabase SQL Editor → Run
--
-- When a listener spends a play credit, the track artist accrues
-- a demo XOF amount. Not withdrawable until real payouts ship.
-- ============================================================

create table if not exists public.artist_play_earnings (
  id bigserial primary key,
  artist_id uuid not null references public.users (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  play_id uuid not null,
  listener_id uuid references public.users (id) on delete set null,
  amount_xof integer not null check (amount_xof > 0),
  created_at timestamptz not null default now(),
  constraint artist_play_earnings_play_unique unique (play_id)
);

create index if not exists artist_play_earnings_artist_created_idx
  on public.artist_play_earnings (artist_id, created_at desc);

create index if not exists artist_play_earnings_track_idx
  on public.artist_play_earnings (track_id);

alter table public.artist_play_earnings enable row level security;

drop policy if exists "artist_play_earnings_select_own" on public.artist_play_earnings;
create policy "artist_play_earnings_select_own"
  on public.artist_play_earnings for select
  to authenticated
  using (artist_id = auth.uid());

-- Inserts go through security definer RPC (listeners cannot write artist rows).

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
  v_amount integer := greatest(coalesce(p_amount_xof, 10), 1);
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_track_id is null or p_play_id is null then
    raise exception 'track_and_play_required';
  end if;

  select t.artist_id into v_artist
  from public.tracks t
  where t.id = p_track_id;

  if v_artist is null then
    raise exception 'track_not_found';
  end if;

  -- Artists do not earn from playing their own tracks
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
