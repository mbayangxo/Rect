-- ============================================================
-- Artist OS Delivery Suite + launch scheduling + tip→wallet
-- Paste in Supabase SQL Editor after monetization / taali_fields
-- ============================================================

-- Scheduled RECT launch (appear on New / New Wave when live)
alter table public.tracks
  add column if not exists launch_at timestamptz,
  add column if not exists upc_code text,
  add column if not exists isrc_code text;

-- Distribution releases (RECT UI → Taali → DSPs)
create table if not exists public.distribution_releases (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  upc text,
  release_date date,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'submitted', 'live', 'failed', 'takedown')),
  taali_release_id text,
  cover_art_url text,
  territories text[] not null default '{}',
  dsp_targets text[] not null default '{}',
  smart_link_slug text unique,
  store_links jsonb not null default '{}'::jsonb,
  last_error text,
  submitted_at timestamptz,
  live_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists distribution_releases_artist_idx
  on public.distribution_releases (artist_id, created_at desc);
create index if not exists distribution_releases_status_idx
  on public.distribution_releases (status);

create table if not exists public.distribution_release_tracks (
  id bigserial primary key,
  release_id uuid not null references public.distribution_releases (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  isrc text,
  track_number integer not null default 1,
  taali_track_id text,
  unique (release_id, track_id)
);

create index if not exists distribution_release_tracks_track_idx
  on public.distribution_release_tracks (track_id);

create table if not exists public.distribution_delivery_events (
  id bigserial primary key,
  release_id uuid not null references public.distribution_releases (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.distribution_releases enable row level security;
alter table public.distribution_release_tracks enable row level security;
alter table public.distribution_delivery_events enable row level security;

drop policy if exists "distribution_releases_own" on public.distribution_releases;
create policy "distribution_releases_own"
  on public.distribution_releases for all
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "distribution_releases_select_public_live" on public.distribution_releases;
create policy "distribution_releases_select_public_live"
  on public.distribution_releases for select
  to anon, authenticated
  using (status = 'live' and smart_link_slug is not null);

drop policy if exists "distribution_release_tracks_own" on public.distribution_release_tracks;
create policy "distribution_release_tracks_own"
  on public.distribution_release_tracks for all
  to authenticated
  using (
    exists (
      select 1 from public.distribution_releases r
      where r.id = release_id and r.artist_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.distribution_releases r
      where r.id = release_id and r.artist_id = auth.uid()
    )
  );

drop policy if exists "distribution_release_tracks_public" on public.distribution_release_tracks;
create policy "distribution_release_tracks_public"
  on public.distribution_release_tracks for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.distribution_releases r
      where r.id = release_id and r.status = 'live'
    )
  );

drop policy if exists "distribution_delivery_events_own" on public.distribution_delivery_events;
create policy "distribution_delivery_events_own"
  on public.distribution_delivery_events for select
  to authenticated
  using (
    exists (
      select 1 from public.distribution_releases r
      where r.id = release_id and r.artist_id = auth.uid()
    )
  );

-- Tip confirms credit artist JOKO wallet ledger
create or replace function public.credit_tip_to_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed'
     and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    if to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null then
      perform public.credit_artist_wallet(
        new.artist_id,
        new.amount_xof,
        'tip',
        'tip:' || new.id::text,
        coalesce(new.payment_method, 'joko')
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists artist_tips_credit_wallet on public.artist_tips;
create trigger artist_tips_credit_wallet
  after insert or update of status on public.artist_tips
  for each row
  execute function public.credit_tip_to_wallet();

-- New Wave: tracks live on RECT that launched recently (or no schedule = live now)
create or replace function public.new_wave_tracks(p_limit integer default 40)
returns table (
  track_id uuid,
  title text,
  artist_id uuid,
  cover_art_url text,
  launch_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id as track_id,
    t.title,
    t.artist_id,
    t.cover_art_url,
    coalesce(t.launch_at, t.created_at) as launch_at,
    t.created_at
  from public.tracks t
  where coalesce(t.status, 'live') in ('live', 'published')
    and t.audio_url is not null
    and (
      t.launch_at is null
      or t.launch_at <= now()
    )
  order by coalesce(t.launch_at, t.created_at) desc nulls last
  limit greatest(least(coalesce(p_limit, 40), 80), 1);
$$;

revoke all on function public.new_wave_tracks(integer) from public;
grant execute on function public.new_wave_tracks(integer) to anon, authenticated;

-- Hide future-scheduled tracks from public catalog queries via helper
create or replace function public.track_is_publicly_live(p_status text, p_launch_at timestamptz)
returns boolean
language sql
immutable
as $$
  select coalesce(p_status, 'live') in ('live', 'published')
    and (p_launch_at is null or p_launch_at <= now());
$$;

notify pgrst, 'reload schema';
