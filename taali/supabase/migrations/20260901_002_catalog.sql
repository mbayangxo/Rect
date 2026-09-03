-- ============================================================
-- Taali catalog: releases, tracks, assets, storage buckets
-- Paste after 20260901_001_foundation.sql
-- ============================================================

create sequence if not exists public.release_number_seq start 1;
create sequence if not exists public.track_number_seq start 1;

create or replace function public.assign_release_code()
returns trigger
language plpgsql
as $$
begin
  if new.release_code is null or btrim(new.release_code) = '' then
    new.release_code := 'TA-REL-' || lpad(nextval('public.release_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create or replace function public.assign_track_code()
returns trigger
language plpgsql
as $$
begin
  if new.track_code is null or btrim(new.track_code) = '' then
    new.track_code := 'TA-TRK-' || lpad(nextval('public.track_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

-- ── Assets ───────────────────────────────────────────────────

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  artist_id uuid references public.artists (id) on delete set null,
  bucket text not null,
  storage_path text not null,
  original_filename text,
  mime_type text,
  file_size_bytes bigint,
  asset_kind text not null default 'other'
    check (asset_kind in ('audio', 'artwork', 'vault', 'other')),
  checksum_sha256 text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

create index if not exists assets_org_idx
  on public.assets (organization_id, created_at desc);
create index if not exists assets_artist_idx
  on public.assets (artist_id)
  where artist_id is not null;

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

-- ── Releases ──────────────────────────────────────────────────

create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  release_code text not null unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  title text not null,
  external_id text unique,
  upc text,
  release_date date,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'submitted', 'live', 'failed', 'takedown')),
  cover_asset_id uuid references public.assets (id) on delete set null,
  territories text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists releases_org_idx
  on public.releases (organization_id, created_at desc);
create index if not exists releases_artist_idx
  on public.releases (artist_id, created_at desc);
create index if not exists releases_external_id_idx
  on public.releases (external_id)
  where external_id is not null;
create index if not exists releases_status_idx
  on public.releases (status);

drop trigger if exists releases_assign_code on public.releases;
create trigger releases_assign_code
  before insert on public.releases
  for each row execute function public.assign_release_code();

drop trigger if exists releases_set_updated_at on public.releases;
create trigger releases_set_updated_at
  before update on public.releases
  for each row execute function public.set_updated_at();

-- ── Tracks ────────────────────────────────────────────────────

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  track_code text not null unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  release_id uuid not null references public.releases (id) on delete cascade,
  title text not null,
  external_id text,
  isrc text,
  track_number integer not null default 1 check (track_number > 0),
  duration_secs integer check (duration_secs is null or duration_secs >= 0),
  audio_asset_id uuid references public.assets (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'submitted', 'live', 'failed', 'takedown')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id, track_number),
  unique (release_id, external_id)
);

create index if not exists tracks_release_idx
  on public.tracks (release_id, track_number);
create index if not exists tracks_artist_idx
  on public.tracks (artist_id, created_at desc);
create index if not exists tracks_external_id_idx
  on public.tracks (external_id)
  where external_id is not null;

drop trigger if exists tracks_assign_code on public.tracks;
create trigger tracks_assign_code
  before insert on public.tracks
  for each row execute function public.assign_track_code();

drop trigger if exists tracks_set_updated_at on public.tracks;
create trigger tracks_set_updated_at
  before update on public.tracks
  for each row execute function public.set_updated_at();

-- ── Storage buckets ───────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'taali-audio',
    'taali-audio',
    false,
    104857600,
    array[
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
      'audio/flac', 'audio/aiff', 'audio/mp4', 'audio/aac', 'audio/ogg'
    ]
  ),
  (
    'taali-artwork',
    'taali-artwork',
    true,
    20971520,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'taali-vault',
    'taali-vault',
    false,
    524288000,
    array[
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/flac',
      'application/pdf', 'application/zip', 'text/plain',
      'image/jpeg', 'image/png', 'image/webp'
    ]
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_org_id_from_path(p_name text)
returns uuid
language sql
immutable
as $$
  select nullif((storage.foldername(p_name))[1], '')::uuid;
$$;

-- taali-artwork: public read
drop policy if exists "taali_artwork_public_read" on storage.objects;
create policy "taali_artwork_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'taali-artwork');

drop policy if exists "taali_artwork_insert_member" on storage.objects;
create policy "taali_artwork_insert_member"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'taali-artwork'
    and public.user_has_org_role(
      public.storage_org_id_from_path(name),
      array['owner', 'admin', 'catalog']::text[]
    )
  );

drop policy if exists "taali_artwork_update_member" on storage.objects;
create policy "taali_artwork_update_member"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'taali-artwork'
    and public.user_has_org_role(
      public.storage_org_id_from_path(name),
      array['owner', 'admin', 'catalog']::text[]
    )
  );

drop policy if exists "taali_artwork_delete_member" on storage.objects;
create policy "taali_artwork_delete_member"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'taali-artwork'
    and public.user_has_org_role(
      public.storage_org_id_from_path(name),
      array['owner', 'admin', 'catalog']::text[]
    )
  );

-- taali-audio: org members only
drop policy if exists "taali_audio_select_member" on storage.objects;
create policy "taali_audio_select_member"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'taali-audio'
    and public.user_has_org_role(public.storage_org_id_from_path(name))
  );

drop policy if exists "taali_audio_insert_member" on storage.objects;
create policy "taali_audio_insert_member"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'taali-audio'
    and public.user_has_org_role(
      public.storage_org_id_from_path(name),
      array['owner', 'admin', 'catalog']::text[]
    )
  );

drop policy if exists "taali_audio_update_member" on storage.objects;
create policy "taali_audio_update_member"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'taali-audio'
    and public.user_has_org_role(
      public.storage_org_id_from_path(name),
      array['owner', 'admin', 'catalog']::text[]
    )
  );

drop policy if exists "taali_audio_delete_member" on storage.objects;
create policy "taali_audio_delete_member"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'taali-audio'
    and public.user_has_org_role(
      public.storage_org_id_from_path(name),
      array['owner', 'admin', 'catalog']::text[]
    )
  );

-- taali-vault: org members with rights/admin
drop policy if exists "taali_vault_select_member" on storage.objects;
create policy "taali_vault_select_member"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'taali-vault'
    and public.user_has_org_role(
      public.storage_org_id_from_path(name),
      array['owner', 'admin', 'rights', 'catalog']::text[]
    )
  );

drop policy if exists "taali_vault_insert_member" on storage.objects;
create policy "taali_vault_insert_member"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'taali-vault'
    and public.user_has_org_role(
      public.storage_org_id_from_path(name),
      array['owner', 'admin', 'rights', 'catalog']::text[]
    )
  );

drop policy if exists "taali_vault_update_member" on storage.objects;
create policy "taali_vault_update_member"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'taali-vault'
    and public.user_has_org_role(
      public.storage_org_id_from_path(name),
      array['owner', 'admin', 'rights', 'catalog']::text[]
    )
  );

drop policy if exists "taali_vault_delete_member" on storage.objects;
create policy "taali_vault_delete_member"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'taali-vault'
    and public.user_has_org_role(
      public.storage_org_id_from_path(name),
      array['owner', 'admin', 'rights']::text[]
    )
  );

-- ── Row level security ───────────────────────────────────────

alter table public.assets enable row level security;
alter table public.releases enable row level security;
alter table public.tracks enable row level security;

drop policy if exists "assets_select_member" on public.assets;
create policy "assets_select_member"
  on public.assets for select
  to authenticated
  using (public.user_has_org_role(organization_id));

drop policy if exists "assets_insert_catalog" on public.assets;
create policy "assets_insert_catalog"
  on public.assets for insert
  to authenticated
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'catalog']::text[]
    )
  );

drop policy if exists "assets_update_catalog" on public.assets;
create policy "assets_update_catalog"
  on public.assets for update
  to authenticated
  using (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'catalog']::text[]
    )
  )
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'catalog']::text[]
    )
  );

drop policy if exists "assets_delete_admin" on public.assets;
create policy "assets_delete_admin"
  on public.assets for delete
  to authenticated
  using (public.user_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists "releases_select_member" on public.releases;
create policy "releases_select_member"
  on public.releases for select
  to authenticated
  using (public.user_has_org_role(organization_id));

drop policy if exists "releases_insert_catalog" on public.releases;
create policy "releases_insert_catalog"
  on public.releases for insert
  to authenticated
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'catalog']::text[]
    )
  );

drop policy if exists "releases_update_catalog" on public.releases;
create policy "releases_update_catalog"
  on public.releases for update
  to authenticated
  using (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'catalog']::text[]
    )
  )
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'catalog']::text[]
    )
  );

drop policy if exists "releases_delete_admin" on public.releases;
create policy "releases_delete_admin"
  on public.releases for delete
  to authenticated
  using (public.user_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists "tracks_select_member" on public.tracks;
create policy "tracks_select_member"
  on public.tracks for select
  to authenticated
  using (public.user_has_org_role(organization_id));

drop policy if exists "tracks_insert_catalog" on public.tracks;
create policy "tracks_insert_catalog"
  on public.tracks for insert
  to authenticated
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'catalog']::text[]
    )
  );

drop policy if exists "tracks_update_catalog" on public.tracks;
create policy "tracks_update_catalog"
  on public.tracks for update
  to authenticated
  using (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'catalog']::text[]
    )
  )
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'catalog']::text[]
    )
  );

drop policy if exists "tracks_delete_admin" on public.tracks;
create policy "tracks_delete_admin"
  on public.tracks for delete
  to authenticated
  using (public.user_has_org_role(organization_id, array['owner', 'admin']::text[]));

notify pgrst, 'reload schema';
