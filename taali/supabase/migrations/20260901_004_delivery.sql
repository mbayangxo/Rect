-- ============================================================
-- Taali delivery: providers, deliveries, destinations, events
-- Paste after 20260901_003_rights.sql
-- ============================================================

create sequence if not exists public.delivery_number_seq start 1;

create or replace function public.assign_delivery_code()
returns trigger
language plpgsql
as $$
begin
  if new.delivery_code is null or btrim(new.delivery_code) = '' then
    new.delivery_code := 'TA-DEL-' || lpad(nextval('public.delivery_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

-- ── Distribution providers ────────────────────────────────────

create table if not exists public.distribution_providers (
  id text primary key,
  display_name text not null,
  provider_type text not null default 'aggregator'
    check (provider_type in ('demo', 'aggregator', 'direct')),
  is_active boolean not null default true,
  supports_audio boolean not null default true,
  supports_video boolean not null default false,
  config_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.distribution_providers (
  id,
  display_name,
  provider_type,
  is_active,
  supports_audio,
  supports_video
)
values
  ('demo', 'Demo (no-op)', 'demo', true, true, false),
  ('labelgrid', 'LabelGrid', 'aggregator', true, true, false),
  ('audicient', 'Audicient', 'aggregator', true, true, false),
  ('apple-direct', 'Apple Music Direct', 'direct', true, true, false),
  ('spotify-direct', 'Spotify Direct', 'direct', true, true, false),
  ('youtube-direct', 'YouTube Music Direct', 'direct', true, true, true),
  ('boomplay-direct', 'Boomplay Direct', 'direct', true, true, false)
on conflict (id) do update set
  display_name = excluded.display_name,
  provider_type = excluded.provider_type,
  is_active = excluded.is_active,
  supports_audio = excluded.supports_audio,
  supports_video = excluded.supports_video;

-- ── Deliveries ────────────────────────────────────────────────

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_code text not null unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  release_id uuid not null references public.releases (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'submitted', 'processing', 'live', 'failed', 'takedown')),
  primary_provider_id text references public.distribution_providers (id) on delete set null,
  territories text[] not null default '{}'::text[],
  dsp_targets text[] not null default '{}'::text[],
  webhook_url text,
  last_error text,
  submitted_at timestamptz,
  live_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deliveries_org_idx
  on public.deliveries (organization_id, created_at desc);
create index if not exists deliveries_release_idx
  on public.deliveries (release_id, created_at desc);
create index if not exists deliveries_status_idx
  on public.deliveries (status);

drop trigger if exists deliveries_assign_code on public.deliveries;
create trigger deliveries_assign_code
  before insert on public.deliveries
  for each row execute function public.assign_delivery_code();

drop trigger if exists deliveries_set_updated_at on public.deliveries;
create trigger deliveries_set_updated_at
  before update on public.deliveries
  for each row execute function public.set_updated_at();

-- ── Delivery destinations ─────────────────────────────────────

create table if not exists public.delivery_destinations (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  provider_id text not null references public.distribution_providers (id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'queued', 'submitted', 'processing', 'live', 'failed', 'takedown')),
  provider_reference text,
  store_url text,
  store_links jsonb not null default '{}'::jsonb,
  last_error text,
  submitted_at timestamptz,
  live_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_id, provider_id)
);

create index if not exists delivery_destinations_delivery_idx
  on public.delivery_destinations (delivery_id);
create index if not exists delivery_destinations_provider_idx
  on public.delivery_destinations (provider_id, status);

drop trigger if exists delivery_destinations_set_updated_at on public.delivery_destinations;
create trigger delivery_destinations_set_updated_at
  before update on public.delivery_destinations
  for each row execute function public.set_updated_at();

-- ── Delivery events ───────────────────────────────────────────

create table if not exists public.delivery_events (
  id bigserial primary key,
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  destination_id uuid references public.delivery_destinations (id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists delivery_events_delivery_idx
  on public.delivery_events (delivery_id, created_at desc);
create index if not exists delivery_events_destination_idx
  on public.delivery_events (destination_id, created_at desc)
  where destination_id is not null;

-- ── Row level security ───────────────────────────────────────

alter table public.distribution_providers enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_destinations enable row level security;
alter table public.delivery_events enable row level security;

drop policy if exists "distribution_providers_select_all" on public.distribution_providers;
create policy "distribution_providers_select_all"
  on public.distribution_providers for select
  to authenticated
  using (is_active = true);

drop policy if exists "deliveries_select_member" on public.deliveries;
create policy "deliveries_select_member"
  on public.deliveries for select
  to authenticated
  using (public.user_has_org_role(organization_id));

drop policy if exists "deliveries_insert_delivery" on public.deliveries;
create policy "deliveries_insert_delivery"
  on public.deliveries for insert
  to authenticated
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'delivery', 'catalog']::text[]
    )
  );

drop policy if exists "deliveries_update_delivery" on public.deliveries;
create policy "deliveries_update_delivery"
  on public.deliveries for update
  to authenticated
  using (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'delivery', 'catalog']::text[]
    )
  )
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'delivery', 'catalog']::text[]
    )
  );

drop policy if exists "deliveries_delete_admin" on public.deliveries;
create policy "deliveries_delete_admin"
  on public.deliveries for delete
  to authenticated
  using (public.user_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists "delivery_destinations_select_member" on public.delivery_destinations;
create policy "delivery_destinations_select_member"
  on public.delivery_destinations for select
  to authenticated
  using (
    exists (
      select 1
      from public.deliveries d
      where d.id = delivery_id
        and public.user_has_org_role(d.organization_id)
    )
  );

drop policy if exists "delivery_destinations_insert_delivery" on public.delivery_destinations;
create policy "delivery_destinations_insert_delivery"
  on public.delivery_destinations for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.deliveries d
      where d.id = delivery_id
        and public.user_has_org_role(
          d.organization_id,
          array['owner', 'admin', 'delivery', 'catalog']::text[]
        )
    )
  );

drop policy if exists "delivery_destinations_update_delivery" on public.delivery_destinations;
create policy "delivery_destinations_update_delivery"
  on public.delivery_destinations for update
  to authenticated
  using (
    exists (
      select 1
      from public.deliveries d
      where d.id = delivery_id
        and public.user_has_org_role(
          d.organization_id,
          array['owner', 'admin', 'delivery', 'catalog']::text[]
        )
    )
  )
  with check (
    exists (
      select 1
      from public.deliveries d
      where d.id = delivery_id
        and public.user_has_org_role(
          d.organization_id,
          array['owner', 'admin', 'delivery', 'catalog']::text[]
        )
    )
  );

drop policy if exists "delivery_destinations_delete_admin" on public.delivery_destinations;
create policy "delivery_destinations_delete_admin"
  on public.delivery_destinations for delete
  to authenticated
  using (
    exists (
      select 1
      from public.deliveries d
      where d.id = delivery_id
        and public.user_has_org_role(d.organization_id, array['owner', 'admin']::text[])
    )
  );

drop policy if exists "delivery_events_select_member" on public.delivery_events;
create policy "delivery_events_select_member"
  on public.delivery_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.deliveries d
      where d.id = delivery_id
        and public.user_has_org_role(d.organization_id)
    )
  );

drop policy if exists "delivery_events_insert_delivery" on public.delivery_events;
create policy "delivery_events_insert_delivery"
  on public.delivery_events for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.deliveries d
      where d.id = delivery_id
        and public.user_has_org_role(
          d.organization_id,
          array['owner', 'admin', 'delivery', 'catalog']::text[]
        )
    )
  );

notify pgrst, 'reload schema';
