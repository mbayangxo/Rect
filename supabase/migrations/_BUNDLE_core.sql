-- RECT — foundation + core schema (fresh Supabase — run FIRST)
-- Generated: 2026-09-01T20:59:24.998Z
-- Files: 22
-- Supabase SQL Editor → paste this entire file → Run

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260805_foundation_schema.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- RECT foundation — users, tracks, plays
-- Run FIRST on a fresh Supabase project before any other migration.
-- Safe to re-run (create if not exists).
-- ============================================================

create extension if not exists "pgcrypto";

-- Profiles mirror auth.users (signup trigger fills rows).
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'User',
  role text,
  phone_number text,
  email text,
  phone text,
  city text,
  artist_bio text,
  listen_liked boolean,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_role_idx on public.users (role);

-- Catalog tracks (artist uploads + demo seed).
create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  title text,
  audio_url text,
  cover_art_url text,
  genre text,
  language text,
  artist_id uuid references auth.users (id) on delete set null,
  duration_secs integer,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracks_artist_created_idx
  on public.tracks (artist_id, created_at desc);

create index if not exists tracks_created_idx
  on public.tracks (created_at desc);

-- Credited listens (one row per play event).
create table if not exists public.plays (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  listener_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists plays_track_id_idx on public.plays (track_id);
create index if not exists plays_listener_created_idx
  on public.plays (listener_id, created_at desc);

alter table public.users enable row level security;
alter table public.tracks enable row level security;
alter table public.plays enable row level security;

notify pgrst, 'reload schema';

-- END 20260805_foundation_schema.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260806_onboarding_users.sql
-- ═══════════════════════════════════════════════════════════
-- RECT onboarding: extend public.users + RLS + auth trigger
-- Run in Supabase Dashboard → SQL Editor (anon key cannot apply DDL).

-- 1) Columns needed for onboarding persistence
alter table public.users
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists artist_bio text,
  add column if not exists listen_liked boolean,
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Keep role constrained
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_role_check'
  ) then
    alter table public.users
      add constraint users_role_check
      check (role is null or role in ('fan', 'artist'));
  end if;
end $$;

-- 2) RLS
alter table public.users enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
  on public.users for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 3) Auto-create / sync row from auth.users metadata on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    display_name,
    role,
    email,
    phone,
    city,
    artist_bio,
    listen_liked,
    onboarding_completed
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), 'User'),
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'fan'),
    new.email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    nullif(new.raw_user_meta_data->>'artist_bio', ''),
    case
      when new.raw_user_meta_data ? 'listen_liked'
        then (new.raw_user_meta_data->>'listen_liked')::boolean
      else null
    end,
    true
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    email = excluded.email,
    phone = coalesce(excluded.phone, public.users.phone),
    city = coalesce(excluded.city, public.users.city),
    artist_bio = coalesce(excluded.artist_bio, public.users.artist_bio),
    listen_liked = coalesce(excluded.listen_liked, public.users.listen_liked),
    onboarding_completed = true,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Optional for local testing only (uncomment if you want immediate sessions):
-- update auth.config is not available via SQL; use Dashboard → Authentication → Providers → Email
-- → disable "Confirm email".

-- END 20260806_onboarding_users.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260806_fix_auth_trigger.sql
-- ═══════════════════════════════════════════════════════════
-- FIX: "Database error saving new user" after onboarding migration
-- Run in Supabase → SQL Editor, then try signup again.

-- 1) Drop old trigger/function (any prior versions)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- 2) Ensure table is not force-RLS (that breaks security definer inserts)
alter table public.users no force row level security;
alter table public.users enable row level security;

-- 3) Grants so auth can write the profile row
grant usage on schema public to postgres, anon, authenticated, service_role, supabase_auth_admin;
grant all on table public.users to postgres, service_role, supabase_auth_admin;
grant select, insert, update on table public.users to authenticated;

-- 4) Recreate trigger — must not fail signup even if profile insert has a hiccup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_listen boolean;
begin
  v_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'fan');
  if v_role not in ('fan', 'artist') then
    v_role := 'fan';
  end if;

  begin
    v_listen := (new.raw_user_meta_data->>'listen_liked')::boolean;
  exception when others then
    v_listen := null;
  end;

  insert into public.users (
    id,
    display_name,
    role,
    email,
    phone,
    city,
    artist_bio,
    listen_liked,
    onboarding_completed,
    updated_at
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1), 'User'),
    v_role,
    new.email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    nullif(new.raw_user_meta_data->>'artist_bio', ''),
    v_listen,
    true,
    now()
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    email = excluded.email,
    phone = coalesce(excluded.phone, public.users.phone),
    city = coalesce(excluded.city, public.users.city),
    artist_bio = coalesce(excluded.artist_bio, public.users.artist_bio),
    listen_liked = coalesce(excluded.listen_liked, public.users.listen_liked),
    onboarding_completed = true,
    updated_at = now();

  return new;
exception
  when others then
    -- Never block Auth account creation; log and continue
    raise warning 'handle_new_user failed for %: %', new.id, SQLERRM;
    return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to postgres, service_role, supabase_auth_admin;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) Keep RLS policies for app users
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
  on public.users for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- END 20260806_fix_auth_trigger.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260806_storage_tracks_bucket.sql
-- ═══════════════════════════════════════════════════════════
-- Storage + plays RLS for artist upload / home playback
-- Run in Supabase SQL Editor if the API cannot create the bucket automatically.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tracks',
  'tracks',
  true,
  52428800,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set public = excluded.public;

-- Public read of audio/cover objects
drop policy if exists "tracks_storage_public_read" on storage.objects;
create policy "tracks_storage_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'tracks');

-- Authenticated artists upload into their folder: {user_id}/...
drop policy if exists "tracks_storage_insert_own" on storage.objects;
create policy "tracks_storage_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "tracks_storage_update_own" on storage.objects;
create policy "tracks_storage_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "tracks_storage_delete_own" on storage.objects;
create policy "tracks_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Plays: listeners can insert their own play rows
alter table public.plays enable row level security;

drop policy if exists "plays_insert_own" on public.plays;
create policy "plays_insert_own"
  on public.plays for insert
  to authenticated
  with check (listener_id = auth.uid());

drop policy if exists "plays_select_own" on public.plays;
create policy "plays_select_own"
  on public.plays for select
  to authenticated
  using (listener_id = auth.uid());

-- END 20260806_storage_tracks_bucket.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260806_plays_artist_policies.sql
-- ═══════════════════════════════════════════════════════════
-- Plays + tracks policies so listening and artist stats actually save/read.
-- Run in Supabase SQL Editor (optional if API uses service role, still recommended).

alter table public.plays enable row level security;

drop policy if exists "plays_insert_own" on public.plays;
create policy "plays_insert_own"
  on public.plays for insert
  to authenticated
  with check (listener_id = auth.uid());

drop policy if exists "plays_select_own" on public.plays;
create policy "plays_select_own"
  on public.plays for select
  to authenticated
  using (listener_id = auth.uid());

drop policy if exists "plays_select_artist_tracks" on public.plays;
create policy "plays_select_artist_tracks"
  on public.plays for select
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id and t.artist_id = auth.uid()
    )
  );

-- Tracks: public read stays; artists manage own rows
alter table public.tracks enable row level security;

drop policy if exists "tracks_select_public" on public.tracks;
create policy "tracks_select_public"
  on public.tracks for select
  to anon, authenticated
  using (true);

drop policy if exists "tracks_insert_own" on public.tracks;
create policy "tracks_insert_own"
  on public.tracks for insert
  to authenticated
  with check (artist_id = auth.uid());

drop policy if exists "tracks_update_own" on public.tracks;
create policy "tracks_update_own"
  on public.tracks for update
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

-- END 20260806_plays_artist_policies.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_users_role_fan_artist.sql
-- ═══════════════════════════════════════════════════════════
-- RECT SOUND roles: fan | artist (keep listener for legacy rows)
alter table public.users drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('fan', 'artist', 'listener', 'admin'));

-- Optional: normalize legacy listener → fan over time (do not force here)

-- END 20260807_users_role_fan_artist.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_users_phone_number_default.sql
-- ═══════════════════════════════════════════════════════════
-- phone_number is NOT NULL + UNIQUE on live DB.
-- Empty string '' collides for every user without a phone.
-- Prefer nullable + unique only when set; keep placeholder strategy in app as backup.

alter table public.users
  alter column phone_number drop not null;

alter table public.users
  alter column phone_number drop default;

-- Allow multiple NULLs under UNIQUE (Postgres treats NULLs as distinct)
-- Existing '' placeholders: leave; app will write pending:<uuid> going forward.

alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check
  check (role in ('fan', 'artist', 'listener', 'admin'));

-- END 20260807_users_phone_number_default.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_fix_phone_unique_and_taste.sql
-- ═══════════════════════════════════════════════════════════
-- Fix phone_number UNIQUE collisions that block public.users profile rows.
-- Optional contact phone stays in `phone`. `phone_number` is a legacy unique key per user id.

alter table public.users
  alter column phone_number drop not null;

alter table public.users drop constraint if exists users_phone_number_key;

alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check
  check (role is null or role in ('fan', 'artist', 'listener', 'admin'));

alter table public.users
  add column if not exists countries text[] not null default '{}',
  add column if not exists genres text[] not null default '{}',
  add column if not exists languages text[] not null default '{}',
  add column if not exists listening_times text[] not null default '{}',
  add column if not exists account_type text;

-- Auth trigger: never put optional contact phone into UNIQUE phone_number
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display text;
  v_role text;
  v_phone text;
  v_phone_key text;
  v_account text;
begin
  v_display := nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), '');
  if v_display is null then
    v_display := split_part(coalesce(new.email, 'user'), '@', 1);
  end if;

  v_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'fan');
  if v_role not in ('fan', 'artist', 'listener', 'admin') then
    v_role := 'fan';
  end if;

  v_account := coalesce(nullif(new.raw_user_meta_data->>'account_type', ''), v_role);
  if v_account not in ('fan', 'artist') then
    v_account := case when v_role = 'artist' then 'artist' else 'fan' end;
  end if;

  v_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
  -- Always unique within varchar(20)
  v_phone_key := 'u' || left(replace(new.id::text, '-', ''), 19);

  insert into public.users (
    id,
    display_name,
    role,
    account_type,
    email,
    phone,
    phone_number,
    countries,
    genres,
    languages,
    listening_times,
    onboarding_completed,
    created_at,
    updated_at
  )
  values (
    new.id,
    v_display,
    v_role,
    v_account,
    new.email,
    v_phone,
    v_phone_key,
    coalesce(
      (
        select array_agg(x)
        from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'countries', '[]'::jsonb)) as t(x)
      ),
      '{}'::text[]
    ),
    coalesce(
      (
        select array_agg(x)
        from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'genres', '[]'::jsonb)) as t(x)
      ),
      '{}'::text[]
    ),
    coalesce(
      (
        select array_agg(x)
        from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'languages', '[]'::jsonb)) as t(x)
      ),
      '{}'::text[]
    ),
    coalesce(
      (
        select array_agg(x)
        from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'listening_times', '[]'::jsonb)) as t(x)
      ),
      '{}'::text[]
    ),
    coalesce((new.raw_user_meta_data->>'onboarding_completed')::boolean, false),
    now(),
    now()
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    account_type = coalesce(excluded.account_type, public.users.account_type),
    email = coalesce(excluded.email, public.users.email),
    phone = coalesce(excluded.phone, public.users.phone),
    phone_number = coalesce(nullif(excluded.phone_number, ''), public.users.phone_number),
    countries = excluded.countries,
    genres = excluded.genres,
    languages = excluded.languages,
    listening_times = excluded.listening_times,
    onboarding_completed = excluded.onboarding_completed or public.users.onboarding_completed,
    updated_at = now();

  return new;
exception
  when undefined_column then
    insert into public.users (id, display_name, role, email, phone_number)
    values (new.id, v_display, v_role, new.email, v_phone_key)
    on conflict (id) do update set
      display_name = excluded.display_name,
      role = excluded.role,
      email = coalesce(excluded.email, public.users.email),
      phone_number = coalesce(excluded.phone_number, public.users.phone_number),
      updated_at = now();
    return new;
  when others then
    -- Never block auth.users creation; app upsert will retry profile write
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- END 20260807_fix_phone_unique_and_taste.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_cultural_onboarding.sql
-- ═══════════════════════════════════════════════════════════
-- Cultural onboarding preferences on public.users
-- Run in Supabase → SQL Editor if not applied by CI.

alter table public.users
  add column if not exists countries text[] not null default '{}',
  add column if not exists genres text[] not null default '{}',
  add column if not exists languages text[] not null default '{}',
  add column if not exists listening_times text[] not null default '{}',
  add column if not exists account_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_account_type_check'
  ) then
    alter table public.users
      add constraint users_account_type_check
      check (account_type is null or account_type in ('fan', 'artist'));
  end if;
end $$;

-- END 20260807_cultural_onboarding.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_play_packs.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- PASTE THIS ENTIRE SCRIPT in Supabase → SQL Editor → Run
-- Handles legacy columns: play_count, price_xof, active, etc.
-- ============================================================

create table if not exists public.play_packs (
  id bigserial primary key,
  created_at timestamptz not null default now()
);

-- Add columns (no-op if present)
alter table public.play_packs add column if not exists play_count integer;
alter table public.play_packs add column if not exists name text;
alter table public.play_packs add column if not exists description text;
alter table public.play_packs add column if not exists price_label text;
alter table public.play_packs add column if not exists price_xof integer;
alter table public.play_packs add column if not exists active boolean default true;
alter table public.play_packs add column if not exists country text;
alter table public.play_packs add column if not exists code text;
alter table public.play_packs add column if not exists play_credits integer;
alter table public.play_packs add column if not exists sort_order integer default 0;
alter table public.play_packs add column if not exists updated_at timestamptz default now();

-- Soften legacy NOT NULL columns before insert
alter table public.play_packs alter column play_count drop not null;
alter table public.play_packs alter column play_count set default 0;

alter table public.play_packs alter column price_xof drop not null;
alter table public.play_packs alter column price_xof set default 0;

-- Backfill
update public.play_packs set play_count = coalesce(play_count, play_credits, 0);
update public.play_packs set play_credits = coalesce(play_credits, play_count, 0);
update public.play_packs set price_xof = coalesce(
  price_xof,
  case
    when price_label ~ '[0-9]' then nullif(regexp_replace(price_label, '[^0-9]', '', 'g'), '')::integer
    else 0
  end,
  0
);
update public.play_packs set country = coalesce(country, 'SN');
update public.play_packs set name = coalesce(nullif(name, ''), code, 'Pack');
update public.play_packs set code = coalesce(
  nullif(code, ''),
  lower(regexp_replace(coalesce(name, 'pack'), '\s+', '_', 'g'))
);
update public.play_packs set sort_order = coalesce(sort_order, 0);
update public.play_packs set active = coalesce(active, true);

-- Unique (country, code)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'play_packs_country_code_key'
  ) then
    delete from public.play_packs a
    using public.play_packs b
    where a.country is not distinct from b.country
      and a.code is not distinct from b.code
      and a.ctid < b.ctid;

    alter table public.play_packs
      add constraint play_packs_country_code_key unique (country, code);
  end if;
end $$;

-- Upsert — set play_count AND price_xof (legacy NOT NULL columns)
insert into public.play_packs (
  country,
  code,
  name,
  description,
  price_label,
  price_xof,
  play_credits,
  play_count,
  sort_order,
  active,
  updated_at
)
values
  ('SN', 'micro', 'Micro', 'Quick listens for the day', '100 XOF', 100, 50, 50, 1, true, now()),
  ('SN', 'standard', 'Standard', 'Your weekly sound diet', '200 XOF', 200, 120, 120, 2, true, now()),
  ('SN', 'mega', 'Mega', 'Deep catalog access', '500 XOF', 500, 350, 350, 3, true, now())
on conflict (country, code) do update set
  name = excluded.name,
  description = excluded.description,
  price_label = excluded.price_label,
  price_xof = excluded.price_xof,
  play_credits = excluded.play_credits,
  play_count = excluded.play_count,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

alter table public.play_packs enable row level security;

drop policy if exists "play_packs_select_public" on public.play_packs;
create policy "play_packs_select_public"
  on public.play_packs for select
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';

select id, country, code, name, price_xof, price_label, play_count, play_credits, sort_order
from public.play_packs
where country = 'SN'
order by sort_order;

-- END 20260807_play_packs.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_play_credits.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260807_play_credits.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_dashboard_discovery.sql
-- ═══════════════════════════════════════════════════════════
-- Public read of other artists for Portals / discovery
-- (needed when service role is unavailable on the server)

alter table public.users enable row level security;

drop policy if exists "users_select_artists_public" on public.users;
create policy "users_select_artists_public"
  on public.users for select
  to anon, authenticated
  using (
    account_type = 'artist'
    or role = 'artist'
    or id = auth.uid()
  );

-- Aggregate play counts without exposing individual play rows
create or replace view public.track_play_counts
with (security_invoker = false)
as
select
  track_id,
  count(*)::integer as play_count
from public.plays
group by track_id;

grant select on public.track_play_counts to anon, authenticated;

-- END 20260807_dashboard_discovery.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_chart_privacy.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Chart privacy — exclude opted-out listeners from rankings
-- Paste in Supabase SQL Editor → Run
-- ============================================================

-- Ensure columns exist (no-op if already applied)
alter table public.users
  add column if not exists privacy_public_profile boolean not null default true,
  add column if not exists privacy_show_activity boolean not null default true,
  add column if not exists privacy_show_on_charts boolean not null default true;

-- Rebuild aggregate so charts / featured honor privacy_show_on_charts
create or replace view public.track_play_counts
with (security_invoker = false)
as
select
  p.track_id,
  count(*)::integer as play_count
from public.plays p
left join public.users u on u.id = p.listener_id
where coalesce(u.privacy_show_on_charts, true) = true
group by p.track_id;

grant select on public.track_play_counts to anon, authenticated;

notify pgrst, 'reload schema';

-- END 20260807_chart_privacy.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_user_privacy_settings.sql
-- ═══════════════════════════════════════════════════════════
-- Privacy preferences on public.users for You / Settings
-- Paste in Supabase SQL Editor if not already applied.

alter table public.users
  add column if not exists privacy_public_profile boolean not null default true,
  add column if not exists privacy_show_activity boolean not null default true,
  add column if not exists privacy_show_on_charts boolean not null default true;

notify pgrst, 'reload schema';

-- END 20260807_user_privacy_settings.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_track_likes.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Track likes — paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.track_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

create index if not exists track_likes_track_id_idx
  on public.track_likes (track_id);

create index if not exists track_likes_user_created_idx
  on public.track_likes (user_id, created_at desc);

alter table public.track_likes enable row level security;

drop policy if exists "track_likes_select_own" on public.track_likes;
create policy "track_likes_select_own"
  on public.track_likes for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "track_likes_insert_own" on public.track_likes;
create policy "track_likes_insert_own"
  on public.track_likes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "track_likes_delete_own" on public.track_likes;
create policy "track_likes_delete_own"
  on public.track_likes for delete
  to authenticated
  using (user_id = auth.uid());

-- Toggle like; returns { liked: boolean }
create or replace function public.toggle_track_like(p_track_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select exists (
    select 1 from public.track_likes
    where user_id = v_uid and track_id = p_track_id
  ) into v_exists;

  if v_exists then
    delete from public.track_likes
    where user_id = v_uid and track_id = p_track_id;
    return jsonb_build_object('liked', false, 'track_id', p_track_id);
  end if;

  insert into public.track_likes (user_id, track_id)
  values (v_uid, p_track_id)
  on conflict do nothing;

  return jsonb_build_object('liked', true, 'track_id', p_track_id);
end;
$$;

revoke all on function public.toggle_track_like(text) from public;
grant execute on function public.toggle_track_like(text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260807_track_likes.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_track_like_counts.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Public track like counts — paste in Supabase SQL Editor → Run
-- ============================================================

create or replace view public.track_like_counts
with (security_invoker = false)
as
select
  track_id,
  count(*)::integer as like_count
from public.track_likes
group by track_id;

grant select on public.track_like_counts to anon, authenticated;

notify pgrst, 'reload schema';

-- END 20260807_track_like_counts.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_artist_follows.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist follows — paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.artist_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, artist_id),
  constraint artist_follows_no_self check (follower_id <> artist_id)
);

create index if not exists artist_follows_artist_id_idx
  on public.artist_follows (artist_id);

create index if not exists artist_follows_follower_created_idx
  on public.artist_follows (follower_id, created_at desc);

alter table public.artist_follows enable row level security;

-- Followers can read their own follows
drop policy if exists "artist_follows_select_own" on public.artist_follows;
create policy "artist_follows_select_own"
  on public.artist_follows for select
  to authenticated
  using (follower_id = auth.uid());

-- Artists can see who follows them (count / roster)
drop policy if exists "artist_follows_select_as_artist" on public.artist_follows;
create policy "artist_follows_select_as_artist"
  on public.artist_follows for select
  to authenticated
  using (artist_id = auth.uid());

-- Anyone authenticated can read follower counts for public portals
-- (count queries filter by artist_id; no PII beyond existence)
drop policy if exists "artist_follows_select_public_count" on public.artist_follows;
create policy "artist_follows_select_public_count"
  on public.artist_follows for select
  to authenticated, anon
  using (true);

drop policy if exists "artist_follows_insert_own" on public.artist_follows;
create policy "artist_follows_insert_own"
  on public.artist_follows for insert
  to authenticated
  with check (follower_id = auth.uid());

drop policy if exists "artist_follows_delete_own" on public.artist_follows;
create policy "artist_follows_delete_own"
  on public.artist_follows for delete
  to authenticated
  using (follower_id = auth.uid());

-- Toggle follow; returns { following: boolean, follower_count: number }
create or replace function public.toggle_artist_follow(p_artist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_artist_id is null then
    raise exception 'artist_required';
  end if;

  if p_artist_id = v_uid then
    raise exception 'cannot_follow_self';
  end if;

  select exists (
    select 1 from public.artist_follows
    where follower_id = v_uid and artist_id = p_artist_id
  ) into v_exists;

  if v_exists then
    delete from public.artist_follows
    where follower_id = v_uid and artist_id = p_artist_id;
  else
    insert into public.artist_follows (follower_id, artist_id)
    values (v_uid, p_artist_id)
    on conflict do nothing;
  end if;

  select count(*) into v_count
  from public.artist_follows
  where artist_id = p_artist_id;

  return jsonb_build_object(
    'following', not v_exists,
    'artist_id', p_artist_id,
    'follower_count', v_count
  );
end;
$$;

revoke all on function public.toggle_artist_follow(uuid) from public;
grant execute on function public.toggle_artist_follow(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260807_artist_follows.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_artist_notifications.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist inbox notifications — paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.artist_notifications (
  id bigserial primary key,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('follow', 'tip')),
  amount_xof integer check (amount_xof is null or amount_xof > 0),
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists artist_notifications_recipient_created_idx
  on public.artist_notifications (recipient_id, created_at desc);

create index if not exists artist_notifications_recipient_unread_idx
  on public.artist_notifications (recipient_id)
  where read_at is null;

alter table public.artist_notifications enable row level security;

drop policy if exists "artist_notifications_select_own" on public.artist_notifications;
create policy "artist_notifications_select_own"
  on public.artist_notifications for select
  to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "artist_notifications_update_own" on public.artist_notifications;
create policy "artist_notifications_update_own"
  on public.artist_notifications for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Fans notify artists via RPC (no direct insert needed)
create or replace function public.notify_artist(
  p_recipient_id uuid,
  p_kind text,
  p_amount_xof integer default null,
  p_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_kind not in ('follow', 'tip') then
    raise exception 'invalid_kind';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_notify_self';
  end if;

  if p_kind = 'tip' and (p_amount_xof is null or p_amount_xof not in (100, 200, 500)) then
    raise exception 'invalid_amount';
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, amount_xof, body
  )
  values (
    p_recipient_id,
    v_uid,
    p_kind,
    case when p_kind = 'tip' then p_amount_xof else null end,
    nullif(trim(coalesce(p_body, '')), '')
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_artist(uuid, text, integer, text) from public;
grant execute on function public.notify_artist(uuid, text, integer, text) to authenticated;

create or replace function public.mark_artist_notifications_read(p_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    update public.artist_notifications
    set read_at = now()
    where recipient_id = v_uid and read_at is null;
  else
    update public.artist_notifications
    set read_at = now()
    where recipient_id = v_uid
      and read_at is null
      and id = any (p_ids);
  end if;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'marked', v_count);
end;
$$;

revoke all on function public.mark_artist_notifications_read(bigint[]) from public;
grant execute on function public.mark_artist_notifications_read(bigint[]) to authenticated;

grant select, update on public.artist_notifications to authenticated;
grant usage, select on sequence public.artist_notifications_id_seq to authenticated;

notify pgrst, 'reload schema';

-- END 20260807_artist_notifications.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_artist_tips.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260807_artist_tips.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_playlists.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- User playlists — paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint playlists_name_len check (char_length(trim(name)) between 1 and 80)
);

create index if not exists playlists_user_updated_idx
  on public.playlists (user_id, updated_at desc);

create table if not exists public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id text not null,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (playlist_id, track_id)
);

create index if not exists playlist_tracks_track_id_idx
  on public.playlist_tracks (track_id);

alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;

drop policy if exists "playlists_select_own" on public.playlists;
create policy "playlists_select_own"
  on public.playlists for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "playlists_insert_own" on public.playlists;
create policy "playlists_insert_own"
  on public.playlists for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "playlists_update_own" on public.playlists;
create policy "playlists_update_own"
  on public.playlists for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "playlists_delete_own" on public.playlists;
create policy "playlists_delete_own"
  on public.playlists for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "playlist_tracks_select_own" on public.playlist_tracks;
create policy "playlist_tracks_select_own"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "playlist_tracks_insert_own" on public.playlist_tracks;
create policy "playlist_tracks_insert_own"
  on public.playlist_tracks for insert
  to authenticated
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "playlist_tracks_delete_own" on public.playlist_tracks;
create policy "playlist_tracks_delete_own"
  on public.playlist_tracks for delete
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "playlist_tracks_update_own" on public.playlist_tracks;
create policy "playlist_tracks_update_own"
  on public.playlist_tracks for update
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';

-- END 20260807_playlists.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_track_publish_gate.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Publish gate — public can only select live tracks
-- Artists still see/edit their own drafts
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.tracks enable row level security;

drop policy if exists "tracks_select_public" on public.tracks;
create policy "tracks_select_public"
  on public.tracks for select
  to anon, authenticated
  using (
    artist_id = auth.uid()
    or coalesce(lower(status), 'published') not in ('pending', 'draft', 'unpublished')
    or status is null
  );

notify pgrst, 'reload schema';

-- END 20260807_track_publish_gate.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260807_release_notifications.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Release notifications to followers — paste in Supabase SQL Editor → Run
-- Requires 20260807_artist_notifications.sql first
-- ============================================================

alter table public.artist_notifications
  add column if not exists track_id text;

-- Widen kind check to include release
alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in ('follow', 'tip', 'release'));

create index if not exists artist_notifications_track_id_idx
  on public.artist_notifications (track_id)
  where track_id is not null;

-- Artist publishes → notify each follower
create or replace function public.notify_track_release(p_track_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_status text;
  v_count integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select artist_id, title, status
  into v_artist, v_title, v_status
  from public.tracks
  where id = p_track_id;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is distinct from v_uid then
    raise exception 'not_your_track';
  end if;

  if lower(coalesce(v_status, 'pending')) <> 'published' then
    raise exception 'track_not_published';
  end if;

  for r in
    select follower_id
    from public.artist_follows
    where artist_id = v_uid
  loop
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, track_id
    )
    values (
      r.follower_id,
      v_uid,
      'release',
      coalesce(nullif(trim(v_title), ''), 'New track'),
      p_track_id
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'notified', v_count,
    'track_id', p_track_id
  );
end;
$$;

revoke all on function public.notify_track_release(text) from public;
grant execute on function public.notify_track_release(text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260807_release_notifications.sql

