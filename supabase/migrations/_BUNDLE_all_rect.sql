-- RECT — full schema (one paste — large, use CLI if possible)
-- Generated: 2026-09-01T20:59:25.137Z
-- Files: 108
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

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_users_avatar.sql
-- ═══════════════════════════════════════════════════════════
-- Artist / user avatar URL — paste in Supabase SQL Editor → Run

alter table public.users
  add column if not exists avatar_url text;

notify pgrst, 'reload schema';

-- END 20260808_users_avatar.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_users_select_public_profiles.sql
-- ═══════════════════════════════════════════════════════════
-- Public listener + artist profiles readable when privacy_public_profile is on.
-- Paste in Supabase SQL Editor → Run
-- (Keeps own-row access; discovery already used artist-only select.)

alter table public.users enable row level security;

drop policy if exists "users_select_artists_public" on public.users;
drop policy if exists "users_select_public_profiles" on public.users;

create policy "users_select_public_profiles"
  on public.users for select
  to anon, authenticated
  using (
    id = auth.uid()
    or coalesce(privacy_public_profile, true) = true
  );

notify pgrst, 'reload schema';

-- END 20260808_users_select_public_profiles.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_playlist_public.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Public playlist sharing — paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.playlists
  add column if not exists is_public boolean not null default false;

create index if not exists playlists_public_idx
  on public.playlists (id)
  where is_public = true;

-- Owners always see their playlists; anyone can read public ones
drop policy if exists "playlists_select_own" on public.playlists;
drop policy if exists "playlists_select_own_or_public" on public.playlists;
drop policy if exists "playlists_select_public_anon" on public.playlists;

create policy "playlists_select_own_or_public"
  on public.playlists for select
  to authenticated
  using (user_id = auth.uid() or is_public = true);

create policy "playlists_select_public_anon"
  on public.playlists for select
  to anon
  using (is_public = true);

-- Playlist tracks readable when the parent playlist is yours or public
drop policy if exists "playlist_tracks_select_own" on public.playlist_tracks;
drop policy if exists "playlist_tracks_select_own_or_public" on public.playlist_tracks;
drop policy if exists "playlist_tracks_select_public_anon" on public.playlist_tracks;

create policy "playlist_tracks_select_own_or_public"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (p.user_id = auth.uid() or p.is_public = true)
    )
  );

create policy "playlist_tracks_select_public_anon"
  on public.playlist_tracks for select
  to anon
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.is_public = true
    )
  );

notify pgrst, 'reload schema';

-- END 20260808_playlist_public.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_playlist_description.sql
-- ═══════════════════════════════════════════════════════════
-- Playlist descriptions — paste in Supabase SQL Editor → Run
-- Optional blurb for private + public playlists

alter table public.playlists
  add column if not exists description text;

alter table public.playlists
  drop constraint if exists playlists_description_len;

alter table public.playlists
  add constraint playlists_description_len
  check (
    description is null
    or char_length(description) <= 280
  );

-- END 20260808_playlist_description.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_playlist_cover.sql
-- ═══════════════════════════════════════════════════════════
-- Playlist cover art — paste in Supabase SQL Editor → Run

alter table public.playlists
  add column if not exists cover_art_url text;

-- END 20260808_playlist_cover.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_playlist_pinned.sql
-- ═══════════════════════════════════════════════════════════
-- Pin playlists to top of Your mixes — paste in Supabase SQL Editor → Run

alter table public.playlists
  add column if not exists pinned_at timestamptz null;

create index if not exists playlists_user_pinned_idx
  on public.playlists (user_id, pinned_at desc nulls last, updated_at desc);

notify pgrst, 'reload schema';

-- END 20260808_playlist_pinned.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_plays_shared_activity.sql
-- ═══════════════════════════════════════════════════════════
-- Shared listening activity — paste in Supabase SQL Editor → Run
-- Lets anyone read plays for listeners who opted into privacy_show_activity.
-- Private journal UX still uses own-select; this powers public “listening now”
-- and artist “recent listeners” when service role is unavailable.

alter table public.plays enable row level security;

drop policy if exists "plays_select_shared_activity" on public.plays;
create policy "plays_select_shared_activity"
  on public.plays for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = listener_id
        and coalesce(u.privacy_show_activity, true) = true
    )
  );

notify pgrst, 'reload schema';

-- END 20260808_plays_shared_activity.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_plays_delete_own.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Listeners can delete their own play history
-- Paste in Supabase SQL Editor → Run
-- ============================================================

drop policy if exists "plays_delete_own" on public.plays;
create policy "plays_delete_own"
  on public.plays for delete
  to authenticated
  using (listener_id = auth.uid());

notify pgrst, 'reload schema';

-- END 20260808_plays_delete_own.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_tracks_delete_own.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artists can delete their own tracks — paste in SQL Editor → Run
-- ============================================================

alter table public.tracks enable row level security;

drop policy if exists "tracks_delete_own" on public.tracks;
create policy "tracks_delete_own"
  on public.tracks for delete
  to authenticated
  using (artist_id = auth.uid());

notify pgrst, 'reload schema';

-- END 20260808_tracks_delete_own.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_like_notifications.sql
-- ═══════════════════════════════════════════════════════════
-- Like → artist inbox — paste in Supabase SQL Editor → Run
-- Requires 20260807_artist_notifications.sql (+ release migration for track_id)

alter table public.artist_notifications
  add column if not exists track_id text;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in ('follow', 'tip', 'release', 'like'));

create or replace function public.notify_track_like(p_track_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select artist_id, title
  into v_artist, v_title
  from public.tracks
  where id = p_track_id;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_artist');
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  -- Avoid spamming: one unread like notice per actor+track
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'like'
      and n.track_id = p_track_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_artist,
    v_uid,
    'like',
    coalesce(nullif(trim(v_title), ''), 'your track'),
    p_track_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'track_id', p_track_id);
end;
$$;

revoke all on function public.notify_track_like(text) from public;
grant execute on function public.notify_track_like(text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260808_like_notifications.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_release_notify_dedupe.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Release notify: skip duplicate for same follower+track
-- Paste in Supabase SQL Editor → Run
-- Requires 20260807_release_notifications.sql
-- ============================================================

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
    -- Don't re-spam the same release alert
    if exists (
      select 1
      from public.artist_notifications n
      where n.recipient_id = r.follower_id
        and n.kind = 'release'
        and n.track_id = p_track_id
    ) then
      continue;
    end if;

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

-- END 20260808_release_notify_dedupe.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_people_follows.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- People follows (peer graph) — paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.people_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, person_id),
  constraint people_follows_no_self check (follower_id <> person_id)
);

create index if not exists people_follows_person_id_idx
  on public.people_follows (person_id);

create index if not exists people_follows_follower_created_idx
  on public.people_follows (follower_id, created_at desc);

alter table public.people_follows enable row level security;

drop policy if exists "people_follows_select_own" on public.people_follows;
create policy "people_follows_select_own"
  on public.people_follows for select
  to authenticated
  using (follower_id = auth.uid());

drop policy if exists "people_follows_select_as_person" on public.people_follows;
create policy "people_follows_select_as_person"
  on public.people_follows for select
  to authenticated
  using (person_id = auth.uid());

-- Public count / existence checks
drop policy if exists "people_follows_select_public" on public.people_follows;
create policy "people_follows_select_public"
  on public.people_follows for select
  to authenticated, anon
  using (true);

drop policy if exists "people_follows_insert_own" on public.people_follows;
create policy "people_follows_insert_own"
  on public.people_follows for insert
  to authenticated
  with check (follower_id = auth.uid());

drop policy if exists "people_follows_delete_own" on public.people_follows;
create policy "people_follows_delete_own"
  on public.people_follows for delete
  to authenticated
  using (follower_id = auth.uid());

create or replace function public.toggle_people_follow(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count bigint;
  v_public boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_person_id is null then
    raise exception 'person_required';
  end if;

  if p_person_id = v_uid then
    raise exception 'cannot_follow_self';
  end if;

  select exists (
    select 1 from public.people_follows
    where follower_id = v_uid and person_id = p_person_id
  ) into v_exists;

  if v_exists then
    delete from public.people_follows
    where follower_id = v_uid and person_id = p_person_id;
  else
    select coalesce(privacy_public_profile, true)
    into v_public
    from public.users
    where id = p_person_id;

    if not found then
      raise exception 'person_not_found';
    end if;

    if v_public is distinct from true then
      raise exception 'profile_private';
    end if;

    insert into public.people_follows (follower_id, person_id)
    values (v_uid, p_person_id)
    on conflict do nothing;
  end if;

  select count(*) into v_count
  from public.people_follows
  where person_id = p_person_id;

  return jsonb_build_object(
    'following', not v_exists,
    'person_id', p_person_id,
    'follower_count', v_count
  );
end;
$$;

revoke all on function public.toggle_people_follow(uuid) from public;
grant execute on function public.toggle_people_follow(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_people_follows.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_user_blocks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- User blocks — paste in Supabase SQL Editor → Run
-- Requires people_follows (optional hard-enforce on follow/share/invite)
-- ============================================================

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own"
  on public.user_blocks for select
  to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

drop policy if exists "user_blocks_insert_own" on public.user_blocks;
create policy "user_blocks_insert_own"
  on public.user_blocks for insert
  to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "user_blocks_delete_own" on public.user_blocks;
create policy "user_blocks_delete_own"
  on public.user_blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

create or replace function public.users_are_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke all on function public.users_are_blocked(uuid, uuid) from public;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;

create or replace function public.toggle_user_block(p_user_id uuid)
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

  if p_user_id is null then
    raise exception 'user_required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_block_self';
  end if;

  select exists (
    select 1 from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id
  ) into v_exists;

  if v_exists then
    delete from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id;
    return jsonb_build_object(
      'blocked', false,
      'user_id', p_user_id
    );
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id)
  on conflict do nothing;

  -- Drop people-follow edges both ways
  delete from public.people_follows
  where (follower_id = v_uid and person_id = p_user_id)
     or (follower_id = p_user_id and person_id = v_uid);

  return jsonb_build_object(
    'blocked', true,
    'user_id', p_user_id
  );
end;
$$;

revoke all on function public.toggle_user_block(uuid) from public;
grant execute on function public.toggle_user_block(uuid) to authenticated;

-- Enforce on people follow
create or replace function public.toggle_people_follow(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count bigint;
  v_public boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_person_id is null then
    raise exception 'person_required';
  end if;

  if p_person_id = v_uid then
    raise exception 'cannot_follow_self';
  end if;

  select exists (
    select 1 from public.people_follows
    where follower_id = v_uid and person_id = p_person_id
  ) into v_exists;

  if v_exists then
    delete from public.people_follows
    where follower_id = v_uid and person_id = p_person_id;
  else
    if public.users_are_blocked(v_uid, p_person_id) then
      raise exception 'blocked';
    end if;

    select coalesce(privacy_public_profile, true)
    into v_public
    from public.users
    where id = p_person_id;

    if not found then
      raise exception 'person_not_found';
    end if;

    if v_public is distinct from true then
      raise exception 'profile_private';
    end if;

    insert into public.people_follows (follower_id, person_id)
    values (v_uid, p_person_id)
    on conflict do nothing;
  end if;

  select count(*) into v_count
  from public.people_follows
  where person_id = p_person_id;

  return jsonb_build_object(
    'following', not v_exists,
    'person_id', p_person_id,
    'follower_count', v_count
  );
end;
$$;

-- Enforce on collab invite (no-op replace if function missing — create or replace)
create or replace function public.invite_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_follows boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_invite_self';
  end if;

  if public.users_are_blocked(v_uid, p_user_id) then
    raise exception 'blocked';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_invite_owner';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_user_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found and v_existing = 'pending' then
    null;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status
    )
    values (p_playlist_id, p_user_id, v_uid, 'pending');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_invite'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'status', 'pending'
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_user_id,
    v_uid,
    'playlist_collab_invite',
    coalesce(nullif(trim(v_name), ''), 'a playlist'),
    p_playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'notification_id', v_notif_id
  );
end;
$$;

-- Soft-patch share RPCs with block check (recreate bodies from send_to_friend)
create or replace function public.notify_track_share(
  p_recipient_id uuid,
  p_track_id text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_title text;
  v_note text;
  v_follows boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_share_self';
  end if;

  if public.users_are_blocked(v_uid, p_recipient_id) then
    raise exception 'blocked';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_recipient_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id)
    and (
      t.status is null
      or t.status = 'published'
      or t.artist_id::text = v_uid::text
    );

  if not found then
    raise exception 'track_not_found';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 140 then
    v_note := left(v_note, 140);
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_recipient_id
      and n.actor_id = v_uid
      and n.kind = 'track_share'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    p_recipient_id,
    v_uid,
    'track_share',
    case
      when v_note is null then coalesce(nullif(trim(v_title), ''), 'a track')
      else left(coalesce(nullif(trim(v_title), ''), 'a track') || ' — ' || v_note, 280)
    end,
    trim(p_track_id)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.notify_playlist_share(
  p_recipient_id uuid,
  p_playlist_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_name text;
  v_public boolean;
  v_note text;
  v_follows boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_share_self';
  end if;

  if public.users_are_blocked(v_uid, p_recipient_id) then
    raise exception 'blocked';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_recipient_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select p.name, p.is_public into v_name, v_public
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 140 then
    v_note := left(v_note, 140);
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_recipient_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_share'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_recipient_id,
    v_uid,
    'playlist_share',
    case
      when v_note is null then coalesce(nullif(trim(v_name), ''), 'a playlist')
      else left(coalesce(nullif(trim(v_name), ''), 'a playlist') || ' — ' || v_note, 280)
    end,
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

notify pgrst, 'reload schema';

-- END 20260809_user_blocks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_block_drops_playlist_follows.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Block also drops playlist follows + gates new mix saves
-- Requires user_blocks + playlist_follows + playlists
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.toggle_user_block(p_user_id uuid)
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

  if p_user_id is null then
    raise exception 'user_required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_block_self';
  end if;

  select exists (
    select 1 from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id
  ) into v_exists;

  if v_exists then
    delete from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id;
    return jsonb_build_object(
      'blocked', false,
      'user_id', p_user_id
    );
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id)
  on conflict do nothing;

  -- Drop people-follow edges both ways
  if to_regclass('public.people_follows') is not null then
    delete from public.people_follows
    where (follower_id = v_uid and person_id = p_user_id)
       or (follower_id = p_user_id and person_id = v_uid);
  end if;

  -- Drop artist-follow edges both ways
  if to_regclass('public.artist_follows') is not null then
    delete from public.artist_follows
    where (follower_id = v_uid and artist_id = p_user_id)
       or (follower_id = p_user_id and artist_id = v_uid);
  end if;

  -- Drop mix saves where either person follows the other's playlists
  if to_regclass('public.playlist_follows') is not null
     and to_regclass('public.playlists') is not null then
    delete from public.playlist_follows pf
    using public.playlists p
    where pf.playlist_id = p.id
      and (
        (pf.follower_id = v_uid and p.user_id = p_user_id)
        or (pf.follower_id = p_user_id and p.user_id = v_uid)
      );
  end if;

  return jsonb_build_object(
    'blocked', true,
    'user_id', p_user_id
  );
end;
$$;

revoke all on function public.toggle_user_block(uuid) from public;
grant execute on function public.toggle_user_block(uuid) to authenticated;

create or replace function public.toggle_playlist_follow(p_playlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count bigint;
  v_owner uuid;
  v_public boolean;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select exists (
    select 1 from public.playlist_follows
    where follower_id = v_uid and playlist_id = p_playlist_id
  ) into v_exists;

  if v_exists then
    delete from public.playlist_follows
    where follower_id = v_uid and playlist_id = p_playlist_id;
  else
    select p.user_id, p.is_public, p.name
    into v_owner, v_public, v_name
    from public.playlists p
    where p.id = p_playlist_id;

    if not found then
      raise exception 'playlist_not_found';
    end if;

    if v_owner = v_uid then
      raise exception 'cannot_follow_own';
    end if;

    if v_public is distinct from true then
      raise exception 'playlist_private';
    end if;

    if to_regclass('public.user_blocks') is not null
       and public.users_are_blocked(v_uid, v_owner) then
      raise exception 'blocked';
    end if;

    insert into public.playlist_follows (follower_id, playlist_id)
    values (v_uid, p_playlist_id)
    on conflict do nothing;
  end if;

  select count(*) into v_count
  from public.playlist_follows
  where playlist_id = p_playlist_id;

  return jsonb_build_object(
    'following', not v_exists,
    'playlist_id', p_playlist_id,
    'follower_count', v_count
  );
end;
$$;

revoke all on function public.toggle_playlist_follow(uuid) from public;
grant execute on function public.toggle_playlist_follow(uuid) to authenticated;

create or replace function public.notify_playlist_follow(p_playlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_owner uuid;
  v_public boolean;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner = v_uid then
    raise exception 'cannot_notify_self';
  end if;

  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private');
  end if;

  if to_regclass('public.user_blocks') is not null
     and public.users_are_blocked(v_uid, v_owner) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_follow'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_follow',
    coalesce(nullif(trim(v_name), ''), 'your playlist'),
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_follow(uuid) from public;
grant execute on function public.notify_playlist_follow(uuid) to authenticated;

create or replace function public.notify_playlist_followers_track_add(
  p_playlist_id uuid,
  p_track_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
  v_name text;
  v_title text;
  v_body text;
  v_notified integer := 0;
  v_skipped integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private', 'notified', 0);
  end if;

  if v_owner <> v_uid then
    if not public.is_accepted_playlist_collaborator(p_playlist_id, v_uid) then
      raise exception 'not_allowed';
    end if;
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  v_body := coalesce(nullif(trim(v_title), ''), 'a track')
    || ' · '
    || coalesce(nullif(trim(v_name), ''), 'playlist');

  for r in
    select f.follower_id
    from public.playlist_follows f
    where f.playlist_id = p_playlist_id
      and f.follower_id <> v_uid
    order by f.created_at desc
    limit 40
  loop
    if to_regclass('public.user_blocks') is not null
       and public.users_are_blocked(v_uid, r.follower_id) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = r.follower_id
        and n.kind = 'playlist_track_add'
        and n.playlist_id = p_playlist_id
        and n.track_id = trim(p_track_id)
        and n.read_at is null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id, track_id
    )
    values (
      r.follower_id,
      v_uid,
      'playlist_track_add',
      left(v_body, 280),
      p_playlist_id,
      trim(p_track_id)
    );
    v_notified := v_notified + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'notified', v_notified,
    'skipped_unread', v_skipped
  );
end;
$$;

revoke all on function public.notify_playlist_followers_track_add(uuid, text) from public;
grant execute on function public.notify_playlist_followers_track_add(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_block_drops_playlist_follows.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_block_drops_artist_follows.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Block also drops artist follows + gates new artist follows
-- Requires user_blocks + artist_follows
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.toggle_user_block(p_user_id uuid)
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

  if p_user_id is null then
    raise exception 'user_required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_block_self';
  end if;

  select exists (
    select 1 from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id
  ) into v_exists;

  if v_exists then
    delete from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id;
    return jsonb_build_object(
      'blocked', false,
      'user_id', p_user_id
    );
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id)
  on conflict do nothing;

  -- Drop people-follow edges both ways
  if to_regclass('public.people_follows') is not null then
    delete from public.people_follows
    where (follower_id = v_uid and person_id = p_user_id)
       or (follower_id = p_user_id and person_id = v_uid);
  end if;

  -- Drop artist-follow edges both ways (Following feed leak)
  if to_regclass('public.artist_follows') is not null then
    delete from public.artist_follows
    where (follower_id = v_uid and artist_id = p_user_id)
       or (follower_id = p_user_id and artist_id = v_uid);
  end if;

  return jsonb_build_object(
    'blocked', true,
    'user_id', p_user_id
  );
end;
$$;

revoke all on function public.toggle_user_block(uuid) from public;
grant execute on function public.toggle_user_block(uuid) to authenticated;

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
    if to_regclass('public.user_blocks') is not null
       and public.users_are_blocked(v_uid, p_artist_id) then
      raise exception 'blocked';
    end if;

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

-- END 20260809_block_drops_artist_follows.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_follows.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Playlist follow / bookmark — paste in Supabase SQL Editor → Run
-- Requires playlists + is_public (20260807_playlists, 20260808_playlist_public)
-- Optional notify needs artist_notifications
-- ============================================================

create table if not exists public.playlist_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, playlist_id)
);

create index if not exists playlist_follows_playlist_id_idx
  on public.playlist_follows (playlist_id);

create index if not exists playlist_follows_follower_created_idx
  on public.playlist_follows (follower_id, created_at desc);

alter table public.playlist_follows enable row level security;

drop policy if exists "playlist_follows_select_own" on public.playlist_follows;
create policy "playlist_follows_select_own"
  on public.playlist_follows for select
  to authenticated
  using (follower_id = auth.uid());

-- Owners can see who saved their public mixes
drop policy if exists "playlist_follows_select_as_owner" on public.playlist_follows;
create policy "playlist_follows_select_as_owner"
  on public.playlist_follows for select
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "playlist_follows_select_public" on public.playlist_follows;
create policy "playlist_follows_select_public"
  on public.playlist_follows for select
  to authenticated, anon
  using (true);

drop policy if exists "playlist_follows_insert_own" on public.playlist_follows;
create policy "playlist_follows_insert_own"
  on public.playlist_follows for insert
  to authenticated
  with check (follower_id = auth.uid());

drop policy if exists "playlist_follows_delete_own" on public.playlist_follows;
create policy "playlist_follows_delete_own"
  on public.playlist_follows for delete
  to authenticated
  using (follower_id = auth.uid());

create or replace function public.toggle_playlist_follow(p_playlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count bigint;
  v_owner uuid;
  v_public boolean;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select exists (
    select 1 from public.playlist_follows
    where follower_id = v_uid and playlist_id = p_playlist_id
  ) into v_exists;

  if v_exists then
    delete from public.playlist_follows
    where follower_id = v_uid and playlist_id = p_playlist_id;
  else
    select p.user_id, p.is_public, p.name
    into v_owner, v_public, v_name
    from public.playlists p
    where p.id = p_playlist_id;

    if not found then
      raise exception 'playlist_not_found';
    end if;

    if v_owner = v_uid then
      raise exception 'cannot_follow_own';
    end if;

    if v_public is distinct from true then
      raise exception 'playlist_private';
    end if;

    insert into public.playlist_follows (follower_id, playlist_id)
    values (v_uid, p_playlist_id)
    on conflict do nothing;
  end if;

  select count(*) into v_count
  from public.playlist_follows
  where playlist_id = p_playlist_id;

  return jsonb_build_object(
    'following', not v_exists,
    'playlist_id', p_playlist_id,
    'follower_count', v_count
  );
end;
$$;

revoke all on function public.toggle_playlist_follow(uuid) from public;
grant execute on function public.toggle_playlist_follow(uuid) to authenticated;

-- Notify owner when someone saves their mix
alter table public.artist_notifications
  add column if not exists playlist_id uuid;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow', 'tip', 'release', 'like', 'comment', 'people_follow', 'playlist_follow'
  ));

create or replace function public.notify_playlist_follow(p_playlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_owner uuid;
  v_public boolean;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner = v_uid then
    raise exception 'cannot_notify_self';
  end if;

  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private');
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_follow'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_follow',
    coalesce(nullif(trim(v_name), ''), 'your playlist'),
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_follow(uuid) from public;
grant execute on function public.notify_playlist_follow(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_follows.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_collaborators.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Collaborative playlists — paste in Supabase SQL Editor → Run
-- Requires playlists + people_follows + artist_notifications
-- ============================================================

create table if not exists public.playlist_collaborators (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (playlist_id, user_id),
  constraint playlist_collaborators_not_owner check (user_id <> invited_by)
);

create index if not exists playlist_collaborators_user_status_idx
  on public.playlist_collaborators (user_id, status);

create index if not exists playlist_collaborators_playlist_status_idx
  on public.playlist_collaborators (playlist_id, status);

alter table public.playlist_collaborators enable row level security;

drop policy if exists "playlist_collaborators_select" on public.playlist_collaborators;
create policy "playlist_collaborators_select"
  on public.playlist_collaborators for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

-- No direct insert/update/delete — RPCs only

create or replace function public.is_accepted_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.playlist_collaborators c
    where c.playlist_id = p_playlist_id
      and c.user_id = p_user_id
      and c.status = 'accepted'
  );
$$;

revoke all on function public.is_accepted_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.is_accepted_playlist_collaborator(uuid, uuid) to authenticated;

-- Collaborators can read private playlists they're on (pending or accepted)
drop policy if exists "playlists_select_own_or_public" on public.playlists;
create policy "playlists_select_own_or_public"
  on public.playlists for select
  to authenticated
  using (
    user_id = auth.uid()
    or is_public = true
    or exists (
      select 1 from public.playlist_collaborators c
      where c.playlist_id = id
        and c.user_id = auth.uid()
        and c.status in ('pending', 'accepted')
    )
  );

drop policy if exists "playlist_tracks_select_own_or_public" on public.playlist_tracks;
create policy "playlist_tracks_select_own_or_public"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (
          p.user_id = auth.uid()
          or p.is_public = true
          or public.is_accepted_playlist_collaborator(p.id, auth.uid())
          or exists (
            select 1 from public.playlist_collaborators c
            where c.playlist_id = p.id
              and c.user_id = auth.uid()
              and c.status = 'pending'
          )
        )
    )
  );

drop policy if exists "playlist_tracks_insert_own" on public.playlist_tracks;
drop policy if exists "playlist_tracks_insert_editor" on public.playlist_tracks;
create policy "playlist_tracks_insert_editor"
  on public.playlist_tracks for insert
  to authenticated
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (
          p.user_id = auth.uid()
          or public.is_accepted_playlist_collaborator(p.id, auth.uid())
        )
    )
  );

-- Bump playlist updated_at when tracks change (owners + collabs)
create or replace function public.touch_playlist_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.playlists
  set updated_at = now()
  where id = coalesce(new.playlist_id, old.playlist_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists playlist_tracks_touch_playlist on public.playlist_tracks;
create trigger playlist_tracks_touch_playlist
  after insert or delete or update on public.playlist_tracks
  for each row
  execute function public.touch_playlist_updated_at();

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'playlist_collab_invite',
    'playlist_collab_accepted'
  ));

create or replace function public.invite_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_follows boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_invite_self';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_invite_owner';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_user_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found and v_existing = 'pending' then
    -- refresh invite notification if needed
    null;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status
    )
    values (p_playlist_id, p_user_id, v_uid, 'pending');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_invite'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'status', 'pending'
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_user_id,
    v_uid,
    'playlist_collab_invite',
    coalesce(nullif(trim(v_name), ''), 'a playlist'),
    p_playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.invite_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.invite_playlist_collaborator(uuid, uuid) to authenticated;

create or replace function public.respond_playlist_collab(
  p_playlist_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.playlist_collaborators%rowtype;
  v_name text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select * into v_row
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = v_uid;

  if not found then
    raise exception 'invite_not_found';
  end if;

  if v_row.status = 'accepted' and p_accept then
    return jsonb_build_object('ok', true, 'skipped', 'already_accepted', 'status', 'accepted');
  end if;

  if not p_accept then
    delete from public.playlist_collaborators
    where playlist_id = p_playlist_id and user_id = v_uid;

    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_uid
      and playlist_id = p_playlist_id
      and kind = 'playlist_collab_invite'
      and read_at is null;

    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  update public.playlist_collaborators
  set status = 'accepted',
      responded_at = now()
  where playlist_id = p_playlist_id and user_id = v_uid;

  select coalesce(nullif(trim(p.name), ''), 'a playlist') into v_name
  from public.playlists p
  where p.id = p_playlist_id;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and playlist_id = p_playlist_id
    and kind = 'playlist_collab_invite'
    and read_at is null;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_row.invited_by
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_accepted'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      v_row.invited_by,
      v_uid,
      'playlist_collab_accepted',
      v_name,
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.respond_playlist_collab(uuid, boolean) from public;
grant execute on function public.respond_playlist_collab(uuid, boolean) to authenticated;

create or replace function public.remove_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_target uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  v_target := coalesce(p_user_id, v_uid);

  -- Owner removes someone, or collaborator leaves
  if v_uid = v_owner then
    if v_target = v_owner then
      raise exception 'cannot_remove_owner';
    end if;
  elsif v_uid = v_target then
    null; -- leave
  else
    raise exception 'not_allowed';
  end if;

  delete from public.playlist_collaborators
  where playlist_id = p_playlist_id and user_id = v_target
  returning user_id into v_target;

  if not found then
    raise exception 'collaborator_not_found';
  end if;

  return jsonb_build_object('ok', true, 'removed', v_target);
end;
$$;

revoke all on function public.remove_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.remove_playlist_collaborator(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_collaborators.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_collab_asks_durable.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Durable mix collab asks (survive Mark all read)
-- Requires collab_approve_from_request + playlist_collab_request
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.playlist_collab_asks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  asker_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  notification_id bigint,
  primary key (playlist_id, asker_id)
);

create index if not exists playlist_collab_asks_asker_idx
  on public.playlist_collab_asks (asker_id, created_at desc);

create index if not exists playlist_collab_asks_playlist_idx
  on public.playlist_collab_asks (playlist_id, created_at desc);

alter table public.playlist_collab_asks enable row level security;

-- No direct client writes — RPCs only. Select: owner or asker.
drop policy if exists "playlist_collab_asks_select" on public.playlist_collab_asks;
create policy "playlist_collab_asks_select"
  on public.playlist_collab_asks for select
  to authenticated
  using (
    asker_id = auth.uid()
    or exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

grant select on public.playlist_collab_asks to authenticated;

-- Backfill open asks from request notifications (prefer unread; else any if not collab)
insert into public.playlist_collab_asks (playlist_id, asker_id, created_at, notification_id)
select distinct on (n.playlist_id, n.actor_id)
  n.playlist_id,
  n.actor_id,
  n.created_at,
  n.id
from public.artist_notifications n
join public.playlists p on p.id = n.playlist_id
where n.kind = 'playlist_collab_request'
  and n.playlist_id is not null
  and n.actor_id is not null
  and n.recipient_id = p.user_id
  and not exists (
    select 1 from public.playlist_collaborators c
    where c.playlist_id = n.playlist_id
      and c.user_id = n.actor_id
      and c.status = 'accepted'
  )
order by n.playlist_id, n.actor_id, (n.read_at is null) desc, n.created_at desc
on conflict (playlist_id, asker_id) do nothing;

-- Drop asks that were already resolved as accepted collabs
delete from public.playlist_collab_asks a
using public.playlist_collaborators c
where a.playlist_id = c.playlist_id
  and a.asker_id = c.user_id
  and c.status = 'accepted';

create or replace function public.notify_playlist_collab_request(
  p_playlist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
  v_name text;
  v_follows boolean;
  v_status text;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner is null or v_owner = v_uid then
    raise exception 'cannot_request_own';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = v_owner
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select c.status into v_status
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = v_uid;

  if found and v_status = 'accepted' then
    return jsonb_build_object('ok', true, 'skipped', 'already_collaborator');
  end if;

  if found and v_status = 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'invite_pending');
  end if;

  -- Durable open ask (survives Mark all read)
  if exists (
    select 1 from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id and a.asker_id = v_uid
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_asked');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_collab_request',
    coalesce(nullif(trim(v_name), ''), 'your mix'),
    p_playlist_id
  )
  returning id into v_id;

  insert into public.playlist_collab_asks (
    playlist_id, asker_id, notification_id
  )
  values (p_playlist_id, v_uid, v_id)
  on conflict (playlist_id, asker_id) do nothing;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_collab_request(uuid) from public;
grant execute on function public.notify_playlist_collab_request(uuid) to authenticated;

create or replace function public.has_playlist_collab_ask_pending(
  p_playlist_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_playlist_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id
      and a.asker_id = v_uid
  );
end;
$$;

revoke all on function public.has_playlist_collab_ask_pending(uuid) from public;
grant execute on function public.has_playlist_collab_ask_pending(uuid) to authenticated;

create or replace function public.cancel_playlist_collab_ask(
  p_playlist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_deleted int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  delete from public.playlist_collab_asks
  where playlist_id = p_playlist_id and asker_id = v_uid;

  get diagnostics v_deleted = row_count;

  if v_owner is not null then
    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_owner
      and actor_id = v_uid
      and kind = 'playlist_collab_request'
      and playlist_id = p_playlist_id
      and read_at is null;
  end if;

  if v_deleted = 0 then
    return jsonb_build_object('ok', true, 'skipped', 'not_asked');
  end if;

  return jsonb_build_object('ok', true, 'cancelled', true);
end;
$$;

revoke all on function public.cancel_playlist_collab_ask(uuid) from public;
grant execute on function public.cancel_playlist_collab_ask(uuid) to authenticated;

create or replace function public.list_playlist_collab_asks(
  p_playlist_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'asker_id', a.asker_id,
          'created_at', a.created_at,
          'notification_id', a.notification_id
        )
        order by a.created_at asc
      )
      from public.playlist_collab_asks a
      where a.playlist_id = p_playlist_id
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_playlist_collab_asks(uuid) from public;
grant execute on function public.list_playlist_collab_asks(uuid) to authenticated;

create or replace function public.approve_playlist_collab_request(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_asked boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_approve_self';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
          or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_approve_owner';
  end if;

  select exists (
    select 1 from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id and a.asker_id = p_user_id
  ) into v_asked;

  -- Fallback: legacy notification-only asks before this migration
  if not v_asked then
    select exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = v_uid
        and n.actor_id = p_user_id
        and n.kind = 'playlist_collab_request'
        and n.playlist_id = p_playlist_id
    ) into v_asked;
  end if;

  if not v_asked then
    raise exception 'no_request';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    delete from public.playlist_collab_asks
    where playlist_id = p_playlist_id and asker_id = p_user_id;

    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_uid
      and actor_id = p_user_id
      and kind = 'playlist_collab_request'
      and playlist_id = p_playlist_id
      and read_at is null;

    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found then
    update public.playlist_collaborators
    set status = 'accepted',
        invited_by = coalesce(invited_by, v_uid),
        responded_at = now()
    where playlist_id = p_playlist_id and user_id = p_user_id;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status, responded_at
    )
    values (
      p_playlist_id, p_user_id, v_uid, 'accepted', now()
    );
  end if;

  delete from public.playlist_collab_asks
  where playlist_id = p_playlist_id and asker_id = p_user_id;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = p_user_id
    and actor_id = v_uid
    and kind = 'playlist_collab_invite'
    and playlist_id = p_playlist_id
    and read_at is null;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_accepted'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      p_user_id,
      v_uid,
      'playlist_collab_accepted',
      coalesce(nullif(trim(v_name), ''), 'a playlist'),
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.approve_playlist_collab_request(uuid, uuid) from public;
grant execute on function public.approve_playlist_collab_request(uuid, uuid) to authenticated;

create or replace function public.decline_playlist_collab_request(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_asked boolean;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  select exists (
    select 1 from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id and a.asker_id = p_user_id
  ) into v_asked;

  if not v_asked then
    select exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = v_uid
        and n.actor_id = p_user_id
        and n.kind = 'playlist_collab_request'
        and n.playlist_id = p_playlist_id
        and n.read_at is null
    ) into v_asked;
  end if;

  if not v_asked then
    return jsonb_build_object('ok', true, 'skipped', 'no_open_request');
  end if;

  delete from public.playlist_collab_asks
  where playlist_id = p_playlist_id and asker_id = p_user_id;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  if not (
       to_regclass('public.user_blocks') is not null
       and exists (
         select 1 from public.user_blocks b
         where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
            or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
       )
     )
     and not exists (
       select 1 from public.artist_notifications n
       where n.recipient_id = p_user_id
         and n.actor_id = v_uid
         and n.kind = 'playlist_collab_declined'
         and n.playlist_id = p_playlist_id
         and n.read_at is null
     )
  then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      p_user_id,
      v_uid,
      'playlist_collab_declined',
      coalesce(nullif(trim(v_name), ''), 'a playlist'),
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'declined',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.decline_playlist_collab_request(uuid, uuid) from public;
grant execute on function public.decline_playlist_collab_request(uuid, uuid) to authenticated;

-- Invite-from-ask also honors durable asks
create or replace function public.invite_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_follows boolean;
  v_asked boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_invite_self';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
          or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_invite_owner';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_user_id
  ) into v_follows;

  select exists (
    select 1 from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id and a.asker_id = p_user_id
  ) into v_asked;

  if not v_asked then
    select exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = v_uid
        and n.actor_id = p_user_id
        and n.kind = 'playlist_collab_request'
        and n.playlist_id = p_playlist_id
    ) into v_asked;
  end if;

  if not v_follows and not v_asked then
    raise exception 'not_following';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found and v_existing = 'pending' then
    null;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status
    )
    values (p_playlist_id, p_user_id, v_uid, 'pending');
  end if;

  delete from public.playlist_collab_asks
  where playlist_id = p_playlist_id and asker_id = p_user_id;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_invite'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'status', 'pending'
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_user_id,
    v_uid,
    'playlist_collab_invite',
    coalesce(nullif(trim(v_name), ''), 'a playlist'),
    p_playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.invite_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.invite_playlist_collaborator(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_collab_asks_durable.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_comments.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Playlist comments — paste in Supabase SQL Editor → Run
-- Requires playlists (+ is_public) + artist_notifications
-- ============================================================

create table if not exists public.playlist_comments (
  id bigint generated always as identity primary key,
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint playlist_comments_body_len check (
    char_length(trim(body)) between 1 and 500
  )
);

create index if not exists playlist_comments_playlist_created_idx
  on public.playlist_comments (playlist_id, created_at desc);

create index if not exists playlist_comments_user_id_idx
  on public.playlist_comments (user_id);

alter table public.playlist_comments enable row level security;

drop policy if exists "playlist_comments_select" on public.playlist_comments;
create policy "playlist_comments_select"
  on public.playlist_comments for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (p.is_public = true or p.user_id = auth.uid())
    )
  );

drop policy if exists "playlist_comments_insert_own" on public.playlist_comments;
create policy "playlist_comments_insert_own"
  on public.playlist_comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (p.is_public = true or p.user_id = auth.uid())
    )
  );

drop policy if exists "playlist_comments_delete" on public.playlist_comments;
create policy "playlist_comments_delete"
  on public.playlist_comments for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'comment_like',
    'playlist_track_add',
    'playlist_comment'
  ));

create or replace function public.notify_playlist_comment(
  p_playlist_id uuid,
  p_comment_preview text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_id bigint;
  v_body text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner is null or v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self_or_no_owner');
  end if;

  -- Respect blocks when table exists
  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  v_body := nullif(trim(coalesce(p_comment_preview, '')), '');
  if v_body is not null and char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;
  if v_body is null then
    v_body := coalesce(nullif(trim(v_name), ''), 'your playlist');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_comment',
    v_body,
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_comment(uuid, text) from public;
grant execute on function public.notify_playlist_comment(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_comments.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_comment_replies_likes.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Playlist comment replies + likes — paste in Supabase SQL Editor → Run
-- Requires 20260809_playlist_comments.sql
-- ============================================================

alter table public.playlist_comments
  add column if not exists parent_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'playlist_comments_parent_fk'
  ) then
    alter table public.playlist_comments
      add constraint playlist_comments_parent_fk
      foreign key (parent_id)
      references public.playlist_comments (id)
      on delete cascade;
  end if;
end $$;

create index if not exists playlist_comments_parent_id_idx
  on public.playlist_comments (parent_id)
  where parent_id is not null;

create table if not exists public.playlist_comment_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  comment_id bigint not null references public.playlist_comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create index if not exists playlist_comment_likes_comment_id_idx
  on public.playlist_comment_likes (comment_id);

alter table public.playlist_comment_likes enable row level security;

drop policy if exists "playlist_comment_likes_select" on public.playlist_comment_likes;
create policy "playlist_comment_likes_select"
  on public.playlist_comment_likes for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.playlist_comments c
      where c.id = comment_id
    )
  );

drop policy if exists "playlist_comment_likes_insert_own" on public.playlist_comment_likes;
create policy "playlist_comment_likes_insert_own"
  on public.playlist_comment_likes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "playlist_comment_likes_delete_own" on public.playlist_comment_likes;
create policy "playlist_comment_likes_delete_own"
  on public.playlist_comment_likes for delete
  to authenticated
  using (user_id = auth.uid());

alter table public.artist_notifications
  add column if not exists playlist_comment_id bigint;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.notify_playlist_comment_reply(
  p_parent_comment_id bigint,
  p_reply_preview text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_parent_user uuid;
  v_playlist_id uuid;
  v_id bigint;
  v_body text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_parent_comment_id is null then
    raise exception 'parent_required';
  end if;

  select c.user_id, c.playlist_id
  into v_parent_user, v_playlist_id
  from public.playlist_comments c
  where c.id = p_parent_comment_id;

  if not found then
    raise exception 'parent_not_found';
  end if;

  if v_parent_user = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_parent_user)
          or (b.blocker_id = v_parent_user and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  v_body := coalesce(
    nullif(trim(p_reply_preview), ''),
    'replied to your comment'
  );
  if char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_parent_user
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment_reply'
      and n.playlist_id = v_playlist_id
      and n.playlist_comment_id = p_parent_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_parent_user,
    v_uid,
    'playlist_comment_reply',
    v_body,
    v_playlist_id,
    p_parent_comment_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_comment_reply(bigint, text) from public;
grant execute on function public.notify_playlist_comment_reply(bigint, text) to authenticated;

create or replace function public.toggle_playlist_comment_like(p_comment_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count integer;
  v_author uuid;
  v_playlist uuid;
  v_snippet text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select c.user_id, c.playlist_id, left(trim(c.body), 80)
  into v_author, v_playlist, v_snippet
  from public.playlist_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  select exists (
    select 1 from public.playlist_comment_likes
    where user_id = v_uid and comment_id = p_comment_id
  ) into v_exists;

  if v_exists then
    delete from public.playlist_comment_likes
    where user_id = v_uid and comment_id = p_comment_id;

    select count(*)::integer into v_count
    from public.playlist_comment_likes
    where comment_id = p_comment_id;

    return jsonb_build_object(
      'liked', false,
      'comment_id', p_comment_id,
      'like_count', coalesce(v_count, 0)
    );
  end if;

  insert into public.playlist_comment_likes (user_id, comment_id)
  values (v_uid, p_comment_id)
  on conflict do nothing;

  select count(*)::integer into v_count
  from public.playlist_comment_likes
  where comment_id = p_comment_id;

  if v_author is not null and v_author <> v_uid then
    if not (
      to_regclass('public.user_blocks') is not null
      and exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = v_uid and b.blocked_id = v_author)
           or (b.blocker_id = v_author and b.blocked_id = v_uid)
      )
    ) then
      if not exists (
        select 1 from public.artist_notifications n
        where n.recipient_id = v_author
          and n.actor_id = v_uid
          and n.kind = 'playlist_comment_like'
          and n.playlist_comment_id = p_comment_id
          and n.read_at is null
      ) then
        insert into public.artist_notifications (
          recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
        )
        values (
          v_author,
          v_uid,
          'playlist_comment_like',
          coalesce(nullif(v_snippet, ''), 'your comment'),
          v_playlist,
          p_comment_id
        )
        returning id into v_notif_id;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'liked', true,
    'comment_id', p_comment_id,
    'like_count', coalesce(v_count, 0),
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.toggle_playlist_comment_like(bigint) from public;
grant execute on function public.toggle_playlist_comment_like(bigint) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_comment_replies_likes.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_track_comments.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Track comments + artist inbox notify — paste in Supabase SQL Editor → Run
-- Requires artist_notifications (+ track_id) migrations
-- Safe to re-run. Includes people_follow in kind check so it won't clash
-- with 20260809_people_follow_notify.sql.
-- ============================================================

create table if not exists public.track_comments (
  id bigint generated always as identity primary key,
  track_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint track_comments_body_len check (
    char_length(trim(body)) between 1 and 500
  )
);

create index if not exists track_comments_track_created_idx
  on public.track_comments (track_id, created_at desc);

create index if not exists track_comments_user_id_idx
  on public.track_comments (user_id);

alter table public.track_comments enable row level security;

-- Read: published tracks for anyone; drafts for owner/artist only
drop policy if exists "track_comments_select" on public.track_comments;
create policy "track_comments_select"
  on public.track_comments for select
  to authenticated, anon
  using (
    exists (
      select 1
      from public.tracks t
      where t.id::text = track_comments.track_id
        and (
          lower(coalesce(t.status, 'published')) not in ('pending', 'draft', 'unpublished')
          or t.artist_id::text = auth.uid()::text
        )
    )
  );

drop policy if exists "track_comments_insert_own" on public.track_comments;
create policy "track_comments_insert_own"
  on public.track_comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.tracks t
      where t.id::text = track_id
        and (
          lower(coalesce(t.status, 'published')) not in ('pending', 'draft', 'unpublished')
          or t.artist_id::text = auth.uid()::text
        )
    )
  );

drop policy if exists "track_comments_delete_own" on public.track_comments;
create policy "track_comments_delete_own"
  on public.track_comments for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.tracks t
      where t.id::text = track_id
        and t.artist_id::text = auth.uid()::text
    )
  );

-- Ensure notify columns exist
alter table public.artist_notifications
  add column if not exists track_id text;

-- Widen kinds (must include every kind already in use)
alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    kind in (
      'follow',
      'tip',
      'release',
      'like',
      'comment',
      'people_follow'
    )
  );

create or replace function public.notify_track_comment(
  p_track_id text,
  p_comment_preview text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_id bigint;
  v_body text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select
    nullif(trim(t.artist_id::text), '')::uuid,
    t.title
  into v_artist, v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_artist');
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  v_body := coalesce(
    nullif(trim(p_comment_preview), ''),
    coalesce(nullif(trim(v_title), ''), 'your track')
  );

  -- Soft-cap spam: one unread comment notice per actor+track
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'comment'
      and n.track_id = p_track_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_artist,
    v_uid,
    'comment',
    left(v_body, 200),
    p_track_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'track_id', p_track_id);
end;
$$;

revoke all on function public.notify_track_comment(text, text) from public;
grant execute on function public.notify_track_comment(text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_track_comments.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_comment_replies.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Comment replies + fan notify — paste in Supabase SQL Editor → Run
-- Requires 20260809_track_comments.sql (+ later notification kinds)
-- ============================================================

alter table public.track_comments
  add column if not exists parent_id bigint;

-- Self-FK (one-level replies: parent must be top-level — enforced in app/RPC)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'track_comments_parent_fk'
  ) then
    alter table public.track_comments
      add constraint track_comments_parent_fk
      foreign key (parent_id)
      references public.track_comments (id)
      on delete cascade;
  end if;
end $$;

create index if not exists track_comments_parent_id_idx
  on public.track_comments (parent_id)
  where parent_id is not null;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply'
  ));

create or replace function public.notify_comment_reply(
  p_parent_comment_id bigint,
  p_reply_preview text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_parent_user uuid;
  v_track_id text;
  v_id bigint;
  v_body text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_parent_comment_id is null then
    raise exception 'parent_required';
  end if;

  select c.user_id, c.track_id
  into v_parent_user, v_track_id
  from public.track_comments c
  where c.id = p_parent_comment_id;

  if not found then
    raise exception 'parent_not_found';
  end if;

  if v_parent_user = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  v_body := coalesce(
    nullif(trim(p_reply_preview), ''),
    'replied to your comment'
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_parent_user
      and n.actor_id = v_uid
      and n.kind = 'comment_reply'
      and n.track_id = v_track_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_parent_user,
    v_uid,
    'comment_reply',
    left(v_body, 200),
    v_track_id
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', v_track_id,
    'recipient_id', v_parent_user
  );
end;
$$;

revoke all on function public.notify_comment_reply(bigint, text) from public;
grant execute on function public.notify_comment_reply(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_comment_replies.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_comment_likes.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Comment likes — paste in Supabase SQL Editor → Run
-- Requires track_comments + artist_notifications
-- ============================================================

create table if not exists public.comment_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  comment_id bigint not null references public.track_comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create index if not exists comment_likes_comment_id_idx
  on public.comment_likes (comment_id);

create index if not exists comment_likes_user_created_idx
  on public.comment_likes (user_id, created_at desc);

alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes_select_own" on public.comment_likes;
create policy "comment_likes_select_own"
  on public.comment_likes for select
  to authenticated
  using (user_id = auth.uid());

-- Anyone signed in can count likes on readable comments
drop policy if exists "comment_likes_select_counts" on public.comment_likes;
create policy "comment_likes_select_counts"
  on public.comment_likes for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.track_comments c
      where c.id = comment_likes.comment_id
    )
  );

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own"
  on public.comment_likes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own"
  on public.comment_likes for delete
  to authenticated
  using (user_id = auth.uid());

alter table public.artist_notifications
  add column if not exists comment_id bigint;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'comment_like'
  ));

create or replace function public.toggle_comment_like(p_comment_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count integer;
  v_author uuid;
  v_track text;
  v_snippet text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select c.user_id, c.track_id, left(trim(c.body), 80)
  into v_author, v_track, v_snippet
  from public.track_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  select exists (
    select 1 from public.comment_likes
    where user_id = v_uid and comment_id = p_comment_id
  ) into v_exists;

  if v_exists then
    delete from public.comment_likes
    where user_id = v_uid and comment_id = p_comment_id;

    select count(*)::integer into v_count
    from public.comment_likes
    where comment_id = p_comment_id;

    return jsonb_build_object(
      'liked', false,
      'comment_id', p_comment_id,
      'like_count', coalesce(v_count, 0)
    );
  end if;

  insert into public.comment_likes (user_id, comment_id)
  values (v_uid, p_comment_id)
  on conflict do nothing;

  select count(*)::integer into v_count
  from public.comment_likes
  where comment_id = p_comment_id;

  -- Soft-notify comment author (not self)
  if v_author is not null and v_author <> v_uid then
    if not exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = v_author
        and n.actor_id = v_uid
        and n.kind = 'comment_like'
        and n.comment_id = p_comment_id
        and n.read_at is null
    ) then
      insert into public.artist_notifications (
        recipient_id, actor_id, kind, body, track_id, comment_id
      )
      values (
        v_author,
        v_uid,
        'comment_like',
        coalesce(nullif(v_snippet, ''), 'your comment'),
        v_track,
        p_comment_id
      )
      returning id into v_notif_id;
    end if;
  end if;

  return jsonb_build_object(
    'liked', true,
    'comment_id', p_comment_id,
    'like_count', coalesce(v_count, 0),
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.toggle_comment_like(bigint) from public;
grant execute on function public.toggle_comment_like(bigint) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_comment_likes.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_tracks_duration_secs.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Track duration (seconds) — paste in Supabase SQL Editor → Run
-- Written by upload + playback; shown as mm:ss in the UI
-- ============================================================

alter table public.tracks
  add column if not exists duration_secs integer;

alter table public.tracks
  drop constraint if exists tracks_duration_secs_range;

alter table public.tracks
  add constraint tracks_duration_secs_range
  check (
    duration_secs is null
    or (duration_secs > 0 and duration_secs <= 7200)
  );

notify pgrst, 'reload schema';

-- END 20260809_tracks_duration_secs.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_tracks_language.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Track language — paste in Supabase SQL Editor → Run
-- Powers language chips on upload/edit + taste-aware discovery
-- ============================================================

alter table public.tracks
  add column if not exists language text;

create index if not exists tracks_language_idx
  on public.tracks (language)
  where language is not null;

notify pgrst, 'reload schema';

-- END 20260809_tracks_language.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_collab_track_adds.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Collab track adds: attribution, remove-own, owner notify
-- Requires 20260809_playlist_collaborators.sql
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.playlist_tracks
  add column if not exists added_by uuid references auth.users (id) on delete set null;

create index if not exists playlist_tracks_added_by_idx
  on public.playlist_tracks (playlist_id, added_by)
  where added_by is not null;

-- Default added_by on insert when client omits it
create or replace function public.playlist_tracks_set_added_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.added_by is null then
    new.added_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists playlist_tracks_set_added_by on public.playlist_tracks;
create trigger playlist_tracks_set_added_by
  before insert on public.playlist_tracks
  for each row
  execute function public.playlist_tracks_set_added_by();

-- Backfill nulls to playlist owner (best-effort)
update public.playlist_tracks pt
set added_by = p.user_id
from public.playlists p
where p.id = pt.playlist_id
  and pt.added_by is null;

drop policy if exists "playlist_tracks_delete_own" on public.playlist_tracks;
drop policy if exists "playlist_tracks_delete_editor" on public.playlist_tracks;
create policy "playlist_tracks_delete_editor"
  on public.playlist_tracks for delete
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (
          p.user_id = auth.uid()
          or (
            public.is_accepted_playlist_collaborator(p.id, auth.uid())
            and playlist_tracks.added_by = auth.uid()
          )
        )
    )
  );

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add'
  ));

create or replace function public.notify_playlist_collab_add(
  p_playlist_id uuid,
  p_track_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_title text;
  v_notif_id bigint;
  v_body text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'required';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  -- Only accepted collaborators notify the owner
  if v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'owner');
  end if;

  if not public.is_accepted_playlist_collaborator(p_playlist_id, v_uid) then
    raise exception 'not_collaborator';
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  v_body := coalesce(nullif(trim(v_title), ''), 'a track')
    || ' · '
    || coalesce(nullif(trim(v_name), ''), 'playlist');

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_add'
      and n.playlist_id = p_playlist_id
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, track_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_collab_add',
    left(v_body, 280),
    p_playlist_id,
    trim(p_track_id)
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', v_notif_id,
    'recipient_id', v_owner
  );
end;
$$;

revoke all on function public.notify_playlist_collab_add(uuid, text) from public;
grant execute on function public.notify_playlist_collab_add(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_collab_track_adds.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_public_liked_tracks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Public liked songs (opt-in) — paste in Supabase SQL Editor → Run
-- Requires track_likes + user privacy columns
-- ============================================================

alter table public.users
  add column if not exists privacy_show_likes boolean not null default false;

-- When profile is public AND show-likes is on, anyone can read that user's like rows
drop policy if exists "track_likes_select_public_shared" on public.track_likes;
create policy "track_likes_select_public_shared"
  on public.track_likes for select
  to authenticated, anon
  using (
    exists (
      select 1
      from public.users u
      where u.id = track_likes.user_id
        and coalesce(u.privacy_public_profile, true) = true
        and coalesce(u.privacy_show_likes, false) = true
    )
  );

notify pgrst, 'reload schema';

-- END 20260809_public_liked_tracks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_privacy_saves_followed_artists.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Opt-in: Saved mixes + Followed artists on /people
-- Default off (mirror privacy_show_likes)
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.users
  add column if not exists privacy_show_saves boolean not null default false;

alter table public.users
  add column if not exists privacy_show_followed_artists boolean not null default false;

create or replace function public.person_saved_public_playlists(
  p_person_id uuid,
  p_limit integer default 12
)
returns table (
  playlist_id uuid,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_show boolean;
  v_lim integer := greatest(1, least(coalesce(p_limit, 12), 40));
begin
  if p_person_id is null then
    return;
  end if;

  if to_regclass('public.playlist_follows') is null then
    return;
  end if;

  select
    coalesce(u.privacy_public_profile, true),
    coalesce(u.privacy_show_saves, false)
  into v_public, v_show
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true or v_show is not true then
    return;
  end if;

  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return;
  end if;

  return query
  select
    pf.playlist_id,
    pf.created_at as followed_at
  from public.playlist_follows pf
  inner join public.playlists p
    on p.id = pf.playlist_id
   and p.is_public is true
  where pf.follower_id = p_person_id
  order by pf.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.person_saved_public_playlists(uuid, integer) from public;
grant execute on function public.person_saved_public_playlists(uuid, integer) to authenticated, anon;

create or replace function public.person_followed_artists(
  p_person_id uuid,
  p_limit integer default 12
)
returns table (
  artist_id uuid,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_show boolean;
  v_lim integer := greatest(1, least(coalesce(p_limit, 12), 40));
begin
  if p_person_id is null then
    return;
  end if;

  if to_regclass('public.artist_follows') is null then
    return;
  end if;

  select
    coalesce(u.privacy_public_profile, true),
    coalesce(u.privacy_show_followed_artists, false)
  into v_public, v_show
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true or v_show is not true then
    return;
  end if;

  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return;
  end if;

  return query
  select
    f.artist_id,
    f.created_at as followed_at
  from public.artist_follows f
  inner join public.users a
    on a.id = f.artist_id
   and (
     a.account_type = 'artist'
     or a.role = 'artist'
   )
   and coalesce(a.privacy_public_profile, true) = true
  where f.follower_id = p_person_id
  order by f.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.person_followed_artists(uuid, integer) from public;
grant execute on function public.person_followed_artists(uuid, integer) to authenticated, anon;

notify pgrst, 'reload schema';

-- END 20260809_privacy_saves_followed_artists.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_privacy_show_followers.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Opt-in: Followers & Following on /people
-- Default off (mirror privacy_show_likes)
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.users
  add column if not exists privacy_show_followers boolean not null default false;

-- Stop world-readable follow edges; own outgoing/incoming policies remain.
drop policy if exists "people_follows_select_public" on public.people_follows;

create or replace function public.person_people_followers(
  p_person_id uuid,
  p_limit integer default 40
)
returns table (
  follower_id uuid,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_show boolean;
  v_lim integer := greatest(1, least(coalesce(p_limit, 40), 80));
begin
  if p_person_id is null then
    return;
  end if;

  if to_regclass('public.people_follows') is null then
    return;
  end if;

  select
    coalesce(u.privacy_public_profile, true),
    coalesce(u.privacy_show_followers, false)
  into v_public, v_show
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true or v_show is not true then
    return;
  end if;

  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return;
  end if;

  return query
  select
    pf.follower_id,
    pf.created_at as followed_at
  from public.people_follows pf
  where pf.person_id = p_person_id
  order by pf.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.person_people_followers(uuid, integer) from public;
grant execute on function public.person_people_followers(uuid, integer) to authenticated, anon;

create or replace function public.person_people_following(
  p_person_id uuid,
  p_limit integer default 40
)
returns table (
  person_id uuid,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_show boolean;
  v_lim integer := greatest(1, least(coalesce(p_limit, 40), 80));
begin
  if p_person_id is null then
    return;
  end if;

  if to_regclass('public.people_follows') is null then
    return;
  end if;

  select
    coalesce(u.privacy_public_profile, true),
    coalesce(u.privacy_show_followers, false)
  into v_public, v_show
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true or v_show is not true then
    return;
  end if;

  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return;
  end if;

  return query
  select
    pf.person_id,
    pf.created_at as followed_at
  from public.people_follows pf
  where pf.follower_id = p_person_id
  order by pf.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.person_people_following(uuid, integer) from public;
grant execute on function public.person_people_following(uuid, integer) to authenticated, anon;

create or replace function public.person_people_follow_counts(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_show boolean;
  v_followers bigint := 0;
  v_following bigint := 0;
begin
  if p_person_id is null then
    return jsonb_build_object(
      'sharing', false,
      'followers', 0,
      'following', 0
    );
  end if;

  if to_regclass('public.people_follows') is null then
    return jsonb_build_object(
      'sharing', false,
      'followers', 0,
      'following', 0,
      'missing_table', true
    );
  end if;

  select
    coalesce(u.privacy_public_profile, true),
    coalesce(u.privacy_show_followers, false)
  into v_public, v_show
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true or v_show is not true then
    return jsonb_build_object(
      'sharing', false,
      'followers', 0,
      'following', 0
    );
  end if;

  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object(
      'sharing', false,
      'followers', 0,
      'following', 0
    );
  end if;

  select count(*) into v_followers
  from public.people_follows
  where person_id = p_person_id;

  select count(*) into v_following
  from public.people_follows
  where follower_id = p_person_id;

  return jsonb_build_object(
    'sharing', true,
    'followers', v_followers,
    'following', v_following
  );
end;
$$;

revoke all on function public.person_people_follow_counts(uuid) from public;
grant execute on function public.person_people_follow_counts(uuid) to authenticated, anon;

notify pgrst, 'reload schema';

-- END 20260809_privacy_show_followers.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_listen_notifications.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Soft-notify artist when an opted-in listener plays a track
-- Respects privacy_show_activity + user_blocks; unread dedupe
-- Requires artist_notifications + tracks + users
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'listen',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.notify_track_listen(p_track_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_share boolean;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select
    nullif(trim(t.artist_id::text), '')::uuid,
    t.title
  into v_artist, v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_artist');
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  -- Settings promise: only named when Listening activity is on
  select coalesce(u.privacy_show_activity, true)
  into v_share
  from public.users u
  where u.id = v_uid;

  if not found or v_share is not true then
    return jsonb_build_object('ok', true, 'skipped', 'privacy');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_artist)
          or (b.blocker_id = v_artist and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  -- One unread listen notice per actor+track (avoid play spam)
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'listen'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_artist,
    v_uid,
    'listen',
    coalesce(nullif(trim(v_title), ''), 'your track'),
    trim(p_track_id)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'track_id', trim(p_track_id));
end;
$$;

revoke all on function public.notify_track_listen(text) from public;
grant execute on function public.notify_track_listen(text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_listen_notifications.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_play_activity_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thanks on a friend's shared listen (play activity)
-- Requires plays + people_follows + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.play_thanks (
  play_id text not null,
  thanker_id uuid not null references auth.users (id) on delete cascade,
  listener_id uuid not null references auth.users (id) on delete cascade,
  track_id text,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (play_id, thanker_id),
  constraint play_thanks_message_len check (char_length(message) <= 280),
  constraint play_thanks_not_self check (thanker_id <> listener_id)
);

create index if not exists play_thanks_listener_created_idx
  on public.play_thanks (listener_id, created_at desc);

alter table public.play_thanks enable row level security;

drop policy if exists "play_thanks_select_own" on public.play_thanks;
create policy "play_thanks_select_own"
  on public.play_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or listener_id = auth.uid());

drop policy if exists "play_thanks_insert_own" on public.play_thanks;
create policy "play_thanks_insert_own"
  on public.play_thanks for insert
  to authenticated
  with check (thanker_id = auth.uid());

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'listen',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'activity_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.send_play_thanks(
  p_play_id text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_listener uuid;
  v_track text;
  v_share boolean;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_play_id is null or length(trim(p_play_id)) = 0 then
    raise exception 'play_required';
  end if;

  select
    p.listener_id,
    p.track_id::text
  into v_listener, v_track
  from public.plays p
  where p.id::text = trim(p_play_id);

  if not found then
    raise exception 'play_not_found';
  end if;

  if v_listener is null or v_listener = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  -- Must follow the listener (friends feed)
  if to_regclass('public.people_follows') is null
     or not exists (
       select 1 from public.people_follows f
       where f.follower_id = v_uid and f.person_id = v_listener
     ) then
    raise exception 'not_following';
  end if;

  select coalesce(u.privacy_show_activity, true)
  into v_share
  from public.users u
  where u.id = v_listener;

  if not found or v_share is not true then
    raise exception 'privacy';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_listener)
          or (b.blocker_id = v_listener and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  if exists (
    select 1 from public.play_thanks t
    where t.play_id = trim(p_play_id) and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.play_thanks t
    where t.play_id = trim(p_play_id) and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'play_id', trim(p_play_id)
    );
  end if;

  insert into public.play_thanks (
    play_id, thanker_id, listener_id, track_id, message
  )
  values (
    trim(p_play_id), v_uid, v_listener, v_track, v_message
  );

  -- Soft-cap: one unread activity_thanks per actor+track
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_listener
      and n.actor_id = v_uid
      and n.kind = 'activity_thanks'
      and n.track_id is not distinct from v_track
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'play_id', trim(p_play_id),
      'listener_id', v_listener
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_listener,
    v_uid,
    'activity_thanks',
    v_message,
    v_track
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'play_id', trim(p_play_id),
    'listener_id', v_listener,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_play_thanks(text, text) from public;
grant execute on function public.send_play_thanks(text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_play_activity_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_like_activity_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thanks on a friend's public like
-- Requires track_likes + people_follows + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.like_thanks (
  thanker_id uuid not null references auth.users (id) on delete cascade,
  liker_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (thanker_id, liker_id, track_id),
  constraint like_thanks_message_len check (char_length(message) <= 280),
  constraint like_thanks_not_self check (thanker_id <> liker_id)
);

create index if not exists like_thanks_liker_created_idx
  on public.like_thanks (liker_id, created_at desc);

alter table public.like_thanks enable row level security;

drop policy if exists "like_thanks_select_own" on public.like_thanks;
create policy "like_thanks_select_own"
  on public.like_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or liker_id = auth.uid());

drop policy if exists "like_thanks_insert_own" on public.like_thanks;
create policy "like_thanks_insert_own"
  on public.like_thanks for insert
  to authenticated
  with check (thanker_id = auth.uid());

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'listen',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'activity_thanks',
    'like_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.send_like_thanks(
  p_liker_id uuid,
  p_track_id text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_share boolean;
  v_message text;
  v_track text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_liker_id is null then
    raise exception 'liker_required';
  end if;

  v_track := trim(coalesce(p_track_id, ''));
  if length(v_track) = 0 then
    raise exception 'track_required';
  end if;

  if p_liker_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  if to_regclass('public.people_follows') is null
     or not exists (
       select 1 from public.people_follows f
       where f.follower_id = v_uid and f.person_id = p_liker_id
     ) then
    raise exception 'not_following';
  end if;

  if not exists (
    select 1 from public.track_likes l
    where l.user_id = p_liker_id and l.track_id::text = v_track
  ) then
    raise exception 'like_not_found';
  end if;

  select coalesce(u.privacy_show_likes, false)
  into v_share
  from public.users u
  where u.id = p_liker_id;

  if not found or v_share is not true then
    raise exception 'privacy';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_liker_id)
          or (b.blocker_id = p_liker_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  if exists (
    select 1 from public.like_thanks t
    where t.thanker_id = v_uid
      and t.liker_id = p_liker_id
      and t.track_id = v_track
  ) then
    select t.message into v_message
    from public.like_thanks t
    where t.thanker_id = v_uid
      and t.liker_id = p_liker_id
      and t.track_id = v_track;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'liker_id', p_liker_id,
      'track_id', v_track
    );
  end if;

  insert into public.like_thanks (
    thanker_id, liker_id, track_id, message
  )
  values (
    v_uid, p_liker_id, v_track, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_liker_id
      and n.actor_id = v_uid
      and n.kind = 'like_thanks'
      and n.track_id is not distinct from v_track
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'liker_id', p_liker_id,
      'track_id', v_track
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    p_liker_id,
    v_uid,
    'like_thanks',
    v_message,
    v_track
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'liker_id', p_liker_id,
    'track_id', v_track,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_like_thanks(uuid, text, text) from public;
grant execute on function public.send_like_thanks(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_like_activity_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_mix_activity_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thanks on a friend's public mix
-- Requires playlists + people_follows + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.mix_thanks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  thanker_id uuid not null references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (playlist_id, thanker_id),
  constraint mix_thanks_message_len check (char_length(message) <= 280),
  constraint mix_thanks_not_self check (thanker_id <> owner_id)
);

create index if not exists mix_thanks_owner_created_idx
  on public.mix_thanks (owner_id, created_at desc);

alter table public.mix_thanks enable row level security;

drop policy if exists "mix_thanks_select_own" on public.mix_thanks;
create policy "mix_thanks_select_own"
  on public.mix_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or owner_id = auth.uid());

drop policy if exists "mix_thanks_insert_own" on public.mix_thanks;
create policy "mix_thanks_insert_own"
  on public.mix_thanks for insert
  to authenticated
  with check (thanker_id = auth.uid());

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'listen',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'activity_thanks',
    'like_thanks',
    'mix_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.send_mix_thanks(
  p_playlist_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.is_public
  into v_owner, v_public
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner is null or v_owner = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  if to_regclass('public.people_follows') is null
     or not exists (
       select 1 from public.people_follows f
       where f.follower_id = v_uid and f.person_id = v_owner
     ) then
    raise exception 'not_following';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  if exists (
    select 1 from public.mix_thanks t
    where t.playlist_id = p_playlist_id and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.mix_thanks t
    where t.playlist_id = p_playlist_id and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'playlist_id', p_playlist_id
    );
  end if;

  insert into public.mix_thanks (
    playlist_id, thanker_id, owner_id, message
  )
  values (
    p_playlist_id, v_uid, v_owner, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'mix_thanks'
      and n.playlist_id is not distinct from p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'playlist_id', p_playlist_id,
      'owner_id', v_owner
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_owner,
    v_uid,
    'mix_thanks',
    v_message,
    p_playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'playlist_id', p_playlist_id,
    'owner_id', v_owner,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_mix_thanks(uuid, text) from public;
grant execute on function public.send_mix_thanks(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_mix_activity_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_comment_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist thanks a fan for a track comment (owner path)
-- Stores comment_id on listen-style comment notifs
-- Requires track_comments + tracks + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists comment_id bigint;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'listen',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'activity_thanks',
    'like_thanks',
    'comment_thanks',
    'mix_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create table if not exists public.comment_thanks (
  comment_id bigint not null references public.track_comments (id) on delete cascade,
  thanker_id uuid not null references auth.users (id) on delete cascade,
  commenter_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, thanker_id),
  constraint comment_thanks_message_len check (char_length(message) <= 280),
  constraint comment_thanks_not_self check (thanker_id <> commenter_id)
);

create index if not exists comment_thanks_commenter_created_idx
  on public.comment_thanks (commenter_id, created_at desc);

alter table public.comment_thanks enable row level security;

drop policy if exists "comment_thanks_select_own" on public.comment_thanks;
create policy "comment_thanks_select_own"
  on public.comment_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or commenter_id = auth.uid());

drop policy if exists "comment_thanks_insert_own" on public.comment_thanks;
create policy "comment_thanks_insert_own"
  on public.comment_thanks for insert
  to authenticated
  with check (thanker_id = auth.uid());

drop function if exists public.notify_track_comment(text, text);
drop function if exists public.notify_track_comment(text, text, bigint);

create or replace function public.notify_track_comment(
  p_track_id text,
  p_comment_preview text default null,
  p_comment_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_id bigint;
  v_body text;
  v_comment bigint := p_comment_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select
    nullif(trim(t.artist_id::text), '')::uuid,
    t.title
  into v_artist, v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_artist');
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  if v_comment is null then
    select c.id
    into v_comment
    from public.track_comments c
    where c.track_id = trim(p_track_id)
      and c.user_id = v_uid
    order by c.created_at desc
    limit 1;
  end if;

  v_body := coalesce(
    nullif(trim(p_comment_preview), ''),
    coalesce(nullif(trim(v_title), ''), 'your track')
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'comment'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'comment_id', v_comment
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, comment_id
  )
  values (
    v_artist,
    v_uid,
    'comment',
    left(v_body, 200),
    trim(p_track_id),
    v_comment
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', trim(p_track_id),
    'comment_id', v_comment
  );
end;
$$;

revoke all on function public.notify_track_comment(text, text, bigint) from public;
grant execute on function public.notify_track_comment(text, text, bigint) to authenticated;

create or replace function public.send_comment_thanks(
  p_comment_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment public.track_comments%rowtype;
  v_artist uuid;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select * into v_comment
  from public.track_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  if v_comment.user_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = v_comment.track_id;

  if v_artist is null or v_artist <> v_uid then
    raise exception 'not_track_owner';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_comment.user_id)
          or (b.blocker_id = v_comment.user_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  if exists (
    select 1 from public.comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.comment_thanks (
    comment_id, thanker_id, commenter_id, track_id, message
  )
  values (
    p_comment_id, v_uid, v_comment.user_id, v_comment.track_id, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_comment.user_id
      and n.actor_id = v_uid
      and n.kind = 'comment_thanks'
      and n.comment_id = p_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, comment_id
  )
  values (
    v_comment.user_id,
    v_uid,
    'comment_thanks',
    v_message,
    v_comment.track_id,
    p_comment_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'comment_id', p_comment_id,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_comment_thanks(bigint, text) from public;
grant execute on function public.send_comment_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_comment_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_comment_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Owner thanks a fan for a playlist/mix comment
-- Stores playlist_comment_id on playlist_comment notifs
-- Requires playlist_comments + playlists + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists playlist_comment_id bigint;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'listen',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'activity_thanks',
    'like_thanks',
    'comment_thanks',
    'playlist_comment_thanks',
    'mix_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create table if not exists public.playlist_comment_thanks (
  comment_id bigint not null references public.playlist_comments (id) on delete cascade,
  thanker_id uuid not null references auth.users (id) on delete cascade,
  commenter_id uuid not null references auth.users (id) on delete cascade,
  playlist_id uuid not null,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, thanker_id),
  constraint playlist_comment_thanks_message_len check (char_length(message) <= 280),
  constraint playlist_comment_thanks_not_self check (thanker_id <> commenter_id)
);

create index if not exists playlist_comment_thanks_commenter_created_idx
  on public.playlist_comment_thanks (commenter_id, created_at desc);

alter table public.playlist_comment_thanks enable row level security;

drop policy if exists "playlist_comment_thanks_select_own" on public.playlist_comment_thanks;
create policy "playlist_comment_thanks_select_own"
  on public.playlist_comment_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or commenter_id = auth.uid());

drop policy if exists "playlist_comment_thanks_insert_own" on public.playlist_comment_thanks;
create policy "playlist_comment_thanks_insert_own"
  on public.playlist_comment_thanks for insert
  to authenticated
  with check (thanker_id = auth.uid());

drop function if exists public.notify_playlist_comment(uuid, text);
drop function if exists public.notify_playlist_comment(uuid, text, bigint);

create or replace function public.notify_playlist_comment(
  p_playlist_id uuid,
  p_comment_preview text default null,
  p_comment_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_id bigint;
  v_body text;
  v_comment bigint := p_comment_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner is null or v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self_or_no_owner');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if v_comment is null then
    select c.id
    into v_comment
    from public.playlist_comments c
    where c.playlist_id = p_playlist_id
      and c.user_id = v_uid
    order by c.created_at desc
    limit 1;
  end if;

  v_body := nullif(trim(coalesce(p_comment_preview, '')), '');
  if v_body is not null and char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;
  if v_body is null then
    v_body := coalesce(nullif(trim(v_name), ''), 'your playlist');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'playlist_comment_id', v_comment
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_comment',
    v_body,
    p_playlist_id,
    v_comment
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'playlist_comment_id', v_comment
  );
end;
$$;

revoke all on function public.notify_playlist_comment(uuid, text, bigint) from public;
grant execute on function public.notify_playlist_comment(uuid, text, bigint) to authenticated;

create or replace function public.send_playlist_comment_thanks(
  p_comment_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment public.playlist_comments%rowtype;
  v_owner uuid;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select * into v_comment
  from public.playlist_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  if v_comment.user_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = v_comment.playlist_id;

  if v_owner is null or v_owner <> v_uid then
    raise exception 'not_playlist_owner';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_comment.user_id)
          or (b.blocker_id = v_comment.user_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  if exists (
    select 1 from public.playlist_comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.playlist_comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.playlist_comment_thanks (
    comment_id, thanker_id, commenter_id, playlist_id, message
  )
  values (
    p_comment_id, v_uid, v_comment.user_id, v_comment.playlist_id, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_comment.user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment_thanks'
      and n.playlist_comment_id = p_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_comment.user_id,
    v_uid,
    'playlist_comment_thanks',
    v_message,
    v_comment.playlist_id,
    p_comment_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'comment_id', p_comment_id,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_playlist_comment_thanks(bigint, text) from public;
grant execute on function public.send_playlist_comment_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_comment_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_tip_message_track.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Tip note + track attribution — paste in Supabase SQL Editor → Run
-- Requires 20260807_artist_tips.sql
-- ============================================================

alter table public.artist_tips
  add column if not exists message text;

alter table public.artist_tips
  add column if not exists track_id text;

alter table public.artist_tips
  drop constraint if exists artist_tips_message_len;

alter table public.artist_tips
  add constraint artist_tips_message_len
  check (message is null or char_length(message) <= 280);

create index if not exists artist_tips_track_id_idx
  on public.artist_tips (track_id)
  where track_id is not null;

-- Replace 2-arg RPC with optional note + track
drop function if exists public.send_artist_tip(uuid, integer);
drop function if exists public.send_artist_tip(uuid, integer, text, text);

create or replace function public.send_artist_tip(
  p_artist_id uuid,
  p_amount_xof integer,
  p_message text default null,
  p_track_id text default null
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
  v_message text;
  v_track text;
  v_track_ok boolean;
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

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is not null and char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  v_track := nullif(trim(coalesce(p_track_id, '')), '');
  if v_track is not null then
    select exists (
      select 1 from public.tracks t
      where t.id::text = v_track
        and t.artist_id::text = p_artist_id::text
    ) into v_track_ok;
    if not v_track_ok then
      v_track := null;
    end if;
  end if;

  insert into public.artist_tips (
    from_user_id, artist_id, amount_xof, status, payment_method, message, track_id
  )
  values (
    v_uid, p_artist_id, p_amount_xof, 'confirmed', 'stub', v_message, v_track
  )
  returning id into v_tip_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', v_tip_id,
    'artist_id', p_artist_id,
    'amount_xof', p_amount_xof,
    'payment_method', 'stub',
    'message', v_message,
    'track_id', v_track
  );
end;
$$;

revoke all on function public.send_artist_tip(uuid, integer, text, text) from public;
grant execute on function public.send_artist_tip(uuid, integer, text, text) to authenticated;

-- Tip notifications: optional note + track link
drop function if exists public.notify_artist(uuid, text, integer, text);
drop function if exists public.notify_artist(uuid, text, integer, text, text);

create or replace function public.notify_artist(
  p_recipient_id uuid,
  p_kind text,
  p_amount_xof integer default null,
  p_body text default null,
  p_track_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_track text;
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

  v_track := nullif(trim(coalesce(p_track_id, '')), '');

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, amount_xof, body, track_id
  )
  values (
    p_recipient_id,
    v_uid,
    p_kind,
    case when p_kind = 'tip' then p_amount_xof else null end,
    nullif(trim(coalesce(p_body, '')), ''),
    v_track
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_artist(uuid, text, integer, text, text) from public;
grant execute on function public.notify_artist(uuid, text, integer, text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_tip_message_track.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_tip_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Tip thank-you → fan inbox — paste in Supabase SQL Editor → Run
-- Requires artist_tips + artist_notifications
-- ============================================================

alter table public.artist_tips
  add column if not exists thanks_message text;

alter table public.artist_tips
  add column if not exists thanks_at timestamptz;

alter table public.artist_tips
  drop constraint if exists artist_tips_thanks_message_len;

alter table public.artist_tips
  add constraint artist_tips_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks'
  ));

-- Optional link from notification → tip row
alter table public.artist_notifications
  add column if not exists tip_id bigint;

create or replace function public.send_tip_thanks(
  p_tip_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tip public.artist_tips%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_tip_id is null then
    raise exception 'tip_required';
  end if;

  select * into v_tip
  from public.artist_tips t
  where t.id = p_tip_id;

  if not found then
    raise exception 'tip_not_found';
  end if;

  if v_tip.artist_id <> v_uid then
    raise exception 'not_tip_owner';
  end if;

  if v_tip.status is distinct from 'confirmed' then
    raise exception 'tip_not_confirmed';
  end if;

  if v_tip.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  update public.artist_tips
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_tip_id;

  -- One unread thank notice per tip
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_tip.from_user_id
      and n.actor_id = v_uid
      and n.kind = 'tip_thanks'
      and n.tip_id = p_tip_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'tip_id', p_tip_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, amount_xof, body, tip_id
  )
  values (
    v_tip.from_user_id,
    v_uid,
    'tip_thanks',
    v_tip.amount_xof,
    v_message,
    p_tip_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', p_tip_id,
    'notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_tip.from_user_id
  );
end;
$$;

revoke all on function public.send_tip_thanks(bigint, text) from public;
grant execute on function public.send_tip_thanks(bigint, text) to authenticated;

-- Artists can update thanks fields on their tips only via RPC;
-- no direct update policy needed.

notify pgrst, 'reload schema';

-- END 20260809_tip_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_tip_thanks_track.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Tip thanks copies tip track_id onto the fan inbox row
-- Paste in Supabase SQL Editor → Run
-- Requires 20260809_tip_thanks.sql + tip track_id (20260809_tip_message_track.sql)
-- ============================================================

create or replace function public.send_tip_thanks(
  p_tip_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tip public.artist_tips%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_tip_id is null then
    raise exception 'tip_required';
  end if;

  select * into v_tip
  from public.artist_tips t
  where t.id = p_tip_id;

  if not found then
    raise exception 'tip_not_found';
  end if;

  if v_tip.artist_id <> v_uid then
    raise exception 'not_tip_owner';
  end if;

  if v_tip.status is distinct from 'confirmed' then
    raise exception 'tip_not_confirmed';
  end if;

  if v_tip.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  update public.artist_tips
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_tip_id;

  -- One unread thank notice per tip
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_tip.from_user_id
      and n.actor_id = v_uid
      and n.kind = 'tip_thanks'
      and n.tip_id = p_tip_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'tip_id', p_tip_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, amount_xof, body, tip_id, track_id
  )
  values (
    v_tip.from_user_id,
    v_uid,
    'tip_thanks',
    v_tip.amount_xof,
    v_message,
    p_tip_id,
    v_tip.track_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', p_tip_id,
    'notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_tip.from_user_id,
    'track_id', v_tip.track_id
  );
end;
$$;

revoke all on function public.send_tip_thanks(bigint, text) from public;
grant execute on function public.send_tip_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_tip_thanks_track.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_tip_inbox_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Tip inbox → thank tipper (carry tip_id on tip notifications)
-- Requires tip_thanks (tip_id column) + tip_message_track notify_artist
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists tip_id bigint;

drop function if exists public.notify_artist(uuid, text, integer, text);
drop function if exists public.notify_artist(uuid, text, integer, text, text);
drop function if exists public.notify_artist(uuid, text, integer, text, text, bigint);

create or replace function public.notify_artist(
  p_recipient_id uuid,
  p_kind text,
  p_amount_xof integer default null,
  p_body text default null,
  p_track_id text default null,
  p_tip_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_track text;
  v_tip bigint;
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

  v_track := nullif(trim(coalesce(p_track_id, '')), '');
  v_tip := case when p_kind = 'tip' then p_tip_id else null end;

  -- Tip id must belong to this tipper → artist pair when provided
  if v_tip is not null then
    if not exists (
      select 1 from public.artist_tips t
      where t.id = v_tip
        and t.artist_id = p_recipient_id
        and t.from_user_id = v_uid
    ) then
      v_tip := null;
    end if;
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, amount_xof, body, track_id, tip_id
  )
  values (
    p_recipient_id,
    v_uid,
    p_kind,
    case when p_kind = 'tip' then p_amount_xof else null end,
    nullif(trim(coalesce(p_body, '')), ''),
    v_track,
    v_tip
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'tip_id', v_tip);
end;
$$;

revoke all on function public.notify_artist(uuid, text, integer, text, text, bigint) from public;
grant execute on function public.notify_artist(uuid, text, integer, text, text, bigint) to authenticated;

-- Best-effort: link older tip notifications to matching tip rows
update public.artist_notifications n
set tip_id = t.id
from public.artist_tips t
where n.kind = 'tip'
  and n.tip_id is null
  and t.artist_id = n.recipient_id
  and t.from_user_id = n.actor_id
  and t.amount_xof = n.amount_xof
  and n.created_at is not null
  and t.created_at is not null
  and abs(extract(epoch from (t.created_at - n.created_at))) < 120
  and not exists (
    select 1 from public.artist_notifications n2
    where n2.tip_id = t.id
      and n2.kind = 'tip'
      and n2.id <> n.id
  );

notify pgrst, 'reload schema';

-- END 20260809_tip_inbox_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_share_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Share thanks — thank someone who sent you a track/mix
-- Requires send_to_friend + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.send_share_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind not in ('track_share', 'playlist_share') then
    raise exception 'not_a_share';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_sharer';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  -- Respect blocks
  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = 'share_thanks'
      and n.read_at is null
      and (
        (v_n.kind = 'track_share' and n.track_id is not distinct from v_n.track_id)
        or (v_n.kind = 'playlist_share' and n.playlist_id is not distinct from v_n.playlist_id)
      )
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, playlist_id
  )
  values (
    v_n.actor_id,
    v_uid,
    'share_thanks',
    v_message,
    v_n.track_id,
    v_n.playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id
  );
end;
$$;

revoke all on function public.send_share_thanks(bigint, text) from public;
grant execute on function public.send_share_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_share_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_follow_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thank someone who saved your mix (playlist_follow)
-- Requires playlist_follows + artist_notifications (+ share thanks cols)
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'listen',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'playlist_follow_thanks',
    'activity_thanks',
    'like_thanks',
    'comment_thanks',
    'playlist_comment_thanks',
    'mix_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.send_playlist_follow_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind is distinct from 'playlist_follow' then
    raise exception 'not_a_playlist_follow';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_saver';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  -- Respect blocks
  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_follow_thanks'
      and n.read_at is null
      and n.playlist_id is not distinct from v_n.playlist_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_n.actor_id,
    v_uid,
    'playlist_follow_thanks',
    v_message,
    v_n.playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id
  );
end;
$$;

revoke all on function public.send_playlist_follow_thanks(bigint, text) from public;
grant execute on function public.send_playlist_follow_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_follow_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_people_follow_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thank someone who followed you (people_follow)
-- Requires people_follows + artist_notifications (+ thanks cols)
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'listen',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'playlist_follow_thanks',
    'people_follow_thanks',
    'activity_thanks',
    'like_thanks',
    'comment_thanks',
    'playlist_comment_thanks',
    'mix_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.send_people_follow_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind is distinct from 'people_follow' then
    raise exception 'not_a_people_follow';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_follower';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = 'people_follow_thanks'
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body
  )
  values (
    v_n.actor_id,
    v_uid,
    'people_follow_thanks',
    v_message
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id
  );
end;
$$;

revoke all on function public.send_people_follow_thanks(bigint, text) from public;
grant execute on function public.send_people_follow_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_people_follow_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_artist_follow_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thank a fan who followed you as an artist (kind: follow)
-- Requires artist_follows notify + artist_notifications (+ thanks cols)
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'listen',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'playlist_follow_thanks',
    'people_follow_thanks',
    'follow_thanks',
    'comment_like_thanks',
    'playlist_comment_like_thanks',
    'playlist_copy_thanks',
    'activity_thanks',
    'like_thanks',
    'comment_thanks',
    'playlist_comment_thanks',
    'mix_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.send_follow_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind is distinct from 'follow' then
    raise exception 'not_a_follow';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_follower';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = 'follow_thanks'
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body
  )
  values (
    v_n.actor_id,
    v_uid,
    'follow_thanks',
    v_message
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id
  );
end;
$$;

revoke all on function public.send_follow_thanks(bigint, text) from public;
grant execute on function public.send_follow_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_artist_follow_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_comment_like_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thank someone who liked your comment (track or mix)
-- Requires comment_likes / playlist_comment_likes + notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'listen',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'playlist_follow_thanks',
    'people_follow_thanks',
    'comment_like_thanks',
    'playlist_comment_like_thanks',
    'activity_thanks',
    'like_thanks',
    'comment_thanks',
    'playlist_comment_thanks',
    'mix_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.send_comment_like_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
  v_thanks_kind text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind not in ('comment_like', 'playlist_comment_like') then
    raise exception 'not_a_comment_like';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_liker';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  v_thanks_kind := case
    when v_n.kind = 'playlist_comment_like' then 'playlist_comment_like_thanks'
    else 'comment_like_thanks'
  end;

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = v_thanks_kind
      and n.read_at is null
      and (
        (v_n.kind = 'comment_like'
          and n.comment_id is not distinct from v_n.comment_id
          and n.track_id is not distinct from v_n.track_id)
        or (v_n.kind = 'playlist_comment_like'
          and n.playlist_comment_id is not distinct from v_n.playlist_comment_id
          and n.playlist_id is not distinct from v_n.playlist_id)
      )
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, playlist_id,
    comment_id, playlist_comment_id
  )
  values (
    v_n.actor_id,
    v_uid,
    v_thanks_kind,
    v_message,
    v_n.track_id,
    v_n.playlist_id,
    v_n.comment_id,
    v_n.playlist_comment_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id,
    'kind', v_thanks_kind
  );
end;
$$;

revoke all on function public.send_comment_like_thanks(bigint, text) from public;
grant execute on function public.send_comment_like_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_comment_like_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_comment_reply_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Reply thanks — store reply comment ids + allow parent to thank
-- Requires comment_thanks + playlist_comment_thanks migrations
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists comment_id bigint;

alter table public.artist_notifications
  add column if not exists playlist_comment_id bigint;

-- Track comment reply notify: store the reply's comment_id
drop function if exists public.notify_comment_reply(bigint, text);
drop function if exists public.notify_comment_reply(bigint, text, bigint);

create or replace function public.notify_comment_reply(
  p_parent_comment_id bigint,
  p_reply_preview text default null,
  p_reply_comment_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_parent_user uuid;
  v_track_id text;
  v_id bigint;
  v_body text;
  v_reply bigint := p_reply_comment_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_parent_comment_id is null then
    raise exception 'parent_required';
  end if;

  select c.user_id, c.track_id
  into v_parent_user, v_track_id
  from public.track_comments c
  where c.id = p_parent_comment_id;

  if not found then
    raise exception 'parent_not_found';
  end if;

  if v_parent_user = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_parent_user)
          or (b.blocker_id = v_parent_user and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if v_reply is null then
    select c.id
    into v_reply
    from public.track_comments c
    where c.parent_id = p_parent_comment_id
      and c.user_id = v_uid
    order by c.created_at desc
    limit 1;
  end if;

  v_body := coalesce(
    nullif(trim(p_reply_preview), ''),
    'replied to your comment'
  );
  if char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;

  -- Soft-cap: refresh unread row so thanks targets the latest reply
  update public.artist_notifications n
  set body = v_body,
      comment_id = coalesce(v_reply, n.comment_id)
  where n.recipient_id = v_parent_user
    and n.actor_id = v_uid
    and n.kind = 'comment_reply'
    and n.track_id = v_track_id
    and n.read_at is null;

  if found then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'comment_id', v_reply
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, comment_id
  )
  values (
    v_parent_user,
    v_uid,
    'comment_reply',
    v_body,
    v_track_id,
    v_reply
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', v_track_id,
    'comment_id', v_reply,
    'recipient_id', v_parent_user
  );
end;
$$;

revoke all on function public.notify_comment_reply(bigint, text, bigint) from public;
grant execute on function public.notify_comment_reply(bigint, text, bigint) to authenticated;

-- Playlist comment reply notify: store the reply's playlist_comment_id
drop function if exists public.notify_playlist_comment_reply(bigint, text);
drop function if exists public.notify_playlist_comment_reply(bigint, text, bigint);

create or replace function public.notify_playlist_comment_reply(
  p_parent_comment_id bigint,
  p_reply_preview text default null,
  p_reply_comment_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_parent_user uuid;
  v_playlist_id uuid;
  v_id bigint;
  v_body text;
  v_reply bigint := p_reply_comment_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_parent_comment_id is null then
    raise exception 'parent_required';
  end if;

  select c.user_id, c.playlist_id
  into v_parent_user, v_playlist_id
  from public.playlist_comments c
  where c.id = p_parent_comment_id;

  if not found then
    raise exception 'parent_not_found';
  end if;

  if v_parent_user = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_parent_user)
          or (b.blocker_id = v_parent_user and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if v_reply is null then
    select c.id
    into v_reply
    from public.playlist_comments c
    where c.parent_id = p_parent_comment_id
      and c.user_id = v_uid
    order by c.created_at desc
    limit 1;
  end if;

  v_body := coalesce(
    nullif(trim(p_reply_preview), ''),
    'replied to your comment'
  );
  if char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;

  update public.artist_notifications n
  set body = v_body,
      playlist_comment_id = coalesce(v_reply, n.playlist_comment_id)
  where n.recipient_id = v_parent_user
    and n.actor_id = v_uid
    and n.kind = 'playlist_comment_reply'
    and n.playlist_id = v_playlist_id
    and n.read_at is null;

  if found then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'playlist_comment_id', v_reply
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_parent_user,
    v_uid,
    'playlist_comment_reply',
    v_body,
    v_playlist_id,
    v_reply
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'playlist_comment_id', v_reply
  );
end;
$$;

revoke all on function public.notify_playlist_comment_reply(bigint, text, bigint) from public;
grant execute on function public.notify_playlist_comment_reply(bigint, text, bigint) to authenticated;

-- Parent comment author (or track owner) may thank a reply
create or replace function public.send_comment_thanks(
  p_comment_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment public.track_comments%rowtype;
  v_artist uuid;
  v_parent_user uuid;
  v_message text;
  v_notif_id bigint;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select * into v_comment
  from public.track_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  if v_comment.user_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = v_comment.track_id;

  if v_artist is not null and v_artist = v_uid then
    v_allowed := true;
  elsif v_comment.parent_id is not null then
    select c.user_id into v_parent_user
    from public.track_comments c
    where c.id = v_comment.parent_id;
    if v_parent_user is not null and v_parent_user = v_uid then
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    raise exception 'not_allowed';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_comment.user_id)
          or (b.blocker_id = v_comment.user_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  if exists (
    select 1 from public.comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.comment_thanks (
    comment_id, thanker_id, commenter_id, track_id, message
  )
  values (
    p_comment_id, v_uid, v_comment.user_id, v_comment.track_id, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_comment.user_id
      and n.actor_id = v_uid
      and n.kind = 'comment_thanks'
      and n.comment_id = p_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, comment_id
  )
  values (
    v_comment.user_id,
    v_uid,
    'comment_thanks',
    v_message,
    v_comment.track_id,
    p_comment_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'comment_id', p_comment_id,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_comment_thanks(bigint, text) from public;
grant execute on function public.send_comment_thanks(bigint, text) to authenticated;

-- Parent comment author (or playlist owner) may thank a mix reply
create or replace function public.send_playlist_comment_thanks(
  p_comment_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment public.playlist_comments%rowtype;
  v_owner uuid;
  v_parent_user uuid;
  v_message text;
  v_notif_id bigint;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select * into v_comment
  from public.playlist_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  if v_comment.user_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = v_comment.playlist_id;

  if v_owner is not null and v_owner = v_uid then
    v_allowed := true;
  elsif v_comment.parent_id is not null then
    select c.user_id into v_parent_user
    from public.playlist_comments c
    where c.id = v_comment.parent_id;
    if v_parent_user is not null and v_parent_user = v_uid then
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    raise exception 'not_allowed';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_comment.user_id)
          or (b.blocker_id = v_comment.user_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  if exists (
    select 1 from public.playlist_comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.playlist_comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.playlist_comment_thanks (
    comment_id, thanker_id, commenter_id, playlist_id, message
  )
  values (
    p_comment_id, v_uid, v_comment.user_id, v_comment.playlist_id, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_comment.user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment_thanks'
      and n.playlist_comment_id = p_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_comment.user_id,
    v_uid,
    'playlist_comment_thanks',
    v_message,
    v_comment.playlist_id,
    p_comment_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'comment_id', p_comment_id,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_playlist_comment_thanks(bigint, text) from public;
grant execute on function public.send_playlist_comment_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_comment_reply_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_people_follow_notify.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- People-follow → inbox — paste in Supabase SQL Editor → Run
-- Requires artist_notifications + people_follows
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in ('follow', 'tip', 'release', 'like', 'comment', 'people_follow'));

create or replace function public.notify_people_follow(p_person_id uuid)
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

  if p_person_id is null then
    raise exception 'person_required';
  end if;

  if p_person_id = v_uid then
    raise exception 'cannot_notify_self';
  end if;

  -- One unread peer-follow notice per actor
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_person_id
      and n.actor_id = v_uid
      and n.kind = 'people_follow'
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body
  )
  values (
    p_person_id,
    v_uid,
    'people_follow',
    'started following you'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_people_follow(uuid) from public;
grant execute on function public.notify_people_follow(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_people_follow_notify.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_send_to_friend.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- In-app send to friend — paste in Supabase SQL Editor → Run
-- Requires artist_notifications + people_follows
-- Optional: playlist_id on notifications (playlist follows migration)
-- ============================================================

alter table public.artist_notifications
  add column if not exists playlist_id uuid;

alter table public.artist_notifications
  add column if not exists track_id text;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share'
  ));

create or replace function public.notify_track_share(
  p_recipient_id uuid,
  p_track_id text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_title text;
  v_note text;
  v_follows boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_share_self';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_recipient_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id)
    and (
      t.status is null
      or t.status = 'published'
      or t.artist_id::text = v_uid::text
    );

  if not found then
    raise exception 'track_not_found';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 140 then
    v_note := left(v_note, 140);
  end if;

  -- One unread share per actor+track+recipient
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_recipient_id
      and n.actor_id = v_uid
      and n.kind = 'track_share'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    p_recipient_id,
    v_uid,
    'track_share',
    coalesce(v_note, coalesce(nullif(trim(v_title), ''), 'a track')),
    trim(p_track_id)
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', trim(p_track_id),
    'recipient_id', p_recipient_id
  );
end;
$$;

revoke all on function public.notify_track_share(uuid, text, text) from public;
grant execute on function public.notify_track_share(uuid, text, text) to authenticated;

create or replace function public.notify_playlist_share(
  p_recipient_id uuid,
  p_playlist_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_name text;
  v_public boolean;
  v_note text;
  v_follows boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_share_self';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_recipient_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select p.name, p.is_public
  into v_name, v_public
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 140 then
    v_note := left(v_note, 140);
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_recipient_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_share'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_recipient_id,
    v_uid,
    'playlist_share',
    coalesce(v_note, coalesce(nullif(trim(v_name), ''), 'a playlist')),
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'playlist_id', p_playlist_id,
    'recipient_id', p_recipient_id
  );
end;
$$;

revoke all on function public.notify_playlist_share(uuid, uuid, text) from public;
grant execute on function public.notify_playlist_share(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_send_to_friend.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_friend_mix_published.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Friend mix published → notify people who follow you
-- Requires people_follows + playlists.is_public + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'friend_mix',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.notify_friend_mix_published(
  p_playlist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
  v_name text;
  v_body text;
  v_notified integer := 0;
  v_skipped integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner is distinct from v_uid then
    raise exception 'not_owner';
  end if;

  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private', 'notified', 0);
  end if;

  if to_regclass('public.people_follows') is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_follows', 'notified', 0);
  end if;

  v_body := coalesce(nullif(trim(v_name), ''), 'a new mix');

  for r in
    select f.follower_id
    from public.people_follows f
    where f.person_id = v_uid
      and f.follower_id <> v_uid
    order by f.created_at desc
    limit 40
  loop
    if to_regclass('public.user_blocks') is not null
       and exists (
         select 1 from public.user_blocks b
         where (b.blocker_id = v_uid and b.blocked_id = r.follower_id)
            or (b.blocker_id = r.follower_id and b.blocked_id = v_uid)
       ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = r.follower_id
        and n.actor_id = v_uid
        and n.kind = 'friend_mix'
        and n.playlist_id = p_playlist_id
        and n.read_at is null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      r.follower_id,
      v_uid,
      'friend_mix',
      v_body,
      p_playlist_id
    );
    v_notified := v_notified + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'notified', v_notified,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.notify_friend_mix_published(uuid) from public;
grant execute on function public.notify_friend_mix_published(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_friend_mix_published.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_copy_notify.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Playlist copy → notify original owner
-- Requires playlists + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.notify_playlist_copy(
  p_playlist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
  v_name text;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  -- Copying your own mix — no notify
  if v_owner is null or v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  -- Only public mixes are copyable by others; keep consistent
  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_copy'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_copy',
    coalesce(nullif(trim(v_name), ''), 'your mix'),
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_copy(uuid) from public;
grant execute on function public.notify_playlist_copy(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_copy_notify.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_copy_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thank someone who copied your mix (playlist_copy)
-- Requires playlist_copy notify + artist_notifications (+ thanks cols)
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'listen',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'playlist_follow_thanks',
    'people_follow_thanks',
    'comment_like_thanks',
    'playlist_comment_like_thanks',
    'playlist_copy_thanks',
    'activity_thanks',
    'like_thanks',
    'comment_thanks',
    'playlist_comment_thanks',
    'mix_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.send_playlist_copy_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind is distinct from 'playlist_copy' then
    raise exception 'not_a_playlist_copy';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_copier';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_copy_thanks'
      and n.read_at is null
      and n.playlist_id is not distinct from v_n.playlist_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_n.actor_id,
    v_uid,
    'playlist_copy_thanks',
    v_message,
    v_n.playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id
  );
end;
$$;

revoke all on function public.send_playlist_copy_thanks(bigint, text) from public;
grant execute on function public.send_playlist_copy_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_copy_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_copy_related.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Playlist copy — store + open the copier's private mix
-- Requires playlist_copy notify + playlists RLS
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists related_playlist_id uuid
  references public.playlists (id) on delete set null;

create index if not exists artist_notifications_related_playlist_idx
  on public.artist_notifications (related_playlist_id)
  where related_playlist_id is not null;

-- Recipient of playlist_copy can read the private copy (and its tracks)
drop policy if exists "playlists_select_copy_notif_recipient" on public.playlists;
create policy "playlists_select_copy_notif_recipient"
  on public.playlists for select
  to authenticated
  using (
    exists (
      select 1
      from public.artist_notifications n
      where n.related_playlist_id = playlists.id
        and n.kind = 'playlist_copy'
        and n.recipient_id = auth.uid()
    )
  );

drop policy if exists "playlist_tracks_select_copy_notif_recipient"
  on public.playlist_tracks;
create policy "playlist_tracks_select_copy_notif_recipient"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1
      from public.artist_notifications n
      where n.related_playlist_id = playlist_tracks.playlist_id
        and n.kind = 'playlist_copy'
        and n.recipient_id = auth.uid()
    )
  );

drop function if exists public.notify_playlist_copy(uuid);

create or replace function public.notify_playlist_copy(
  p_source_id uuid,
  p_copy_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
  v_name text;
  v_copy_owner uuid;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_source_id is null then
    raise exception 'playlist_required';
  end if;

  if p_copy_id is null then
    raise exception 'copy_required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_source_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  select p.user_id into v_copy_owner
  from public.playlists p
  where p.id = p_copy_id;

  if not found then
    raise exception 'copy_not_found';
  end if;

  if v_copy_owner is distinct from v_uid then
    raise exception 'copy_not_yours';
  end if;

  if p_copy_id = p_source_id then
    raise exception 'copy_same_as_source';
  end if;

  -- Copying your own mix — no notify
  if v_owner is null or v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  -- Only public mixes are copyable by others; keep consistent
  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_copy'
      and n.playlist_id = p_source_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, related_playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_copy',
    coalesce(nullif(trim(v_name), ''), 'your mix'),
    p_source_id,
    p_copy_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_copy(uuid, uuid) from public;
grant execute on function public.notify_playlist_copy(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_copy_related.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_savers_roster.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Playlist savers roster + tighter RLS — paste in Supabase SQL Editor → Run
-- Requires 20260809_playlist_follows.sql
-- ============================================================

-- Stop open scrape of all saver rows; owners + own follows still readable
drop policy if exists "playlist_follows_select_public" on public.playlist_follows;

-- Public save counts without exposing the full roster
create or replace function public.playlist_save_count(p_playlist_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_public boolean;
  v_owner uuid;
begin
  if p_playlist_id is null then
    return 0;
  end if;

  select p.is_public, p.user_id
  into v_public, v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    return 0;
  end if;

  -- Private mixes: only owner sees a count
  if v_public is distinct from true and v_owner is distinct from auth.uid() then
    return 0;
  end if;

  select count(*)::integer into v_count
  from public.playlist_follows
  where playlist_id = p_playlist_id;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.playlist_save_count(uuid) from public;
grant execute on function public.playlist_save_count(uuid) to authenticated, anon;

notify pgrst, 'reload schema';

-- END 20260809_playlist_savers_roster.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_friends_who_saved_playlist.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Friends who saved a playlist (no full roster leak)
-- Requires playlist_follows + people_follows + playlists
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.friends_who_saved_playlist(
  p_playlist_id uuid,
  p_limit integer default 12
)
returns table (
  user_id uuid,
  saved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
  v_can_see boolean := false;
  v_lim integer := greatest(1, least(coalesce(p_limit, 12), 40));
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    return;
  end if;

  if to_regclass('public.playlist_follows') is null
     or to_regclass('public.people_follows') is null then
    return;
  end if;

  select p.user_id, p.is_public
  into v_owner, v_public
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    return;
  end if;

  if v_public is true or v_owner = v_uid then
    v_can_see := true;
  elsif to_regclass('public.playlist_collaborators') is not null
     and exists (
       select 1
       from public.playlist_collaborators c
       where c.playlist_id = p_playlist_id
         and c.user_id = v_uid
         and c.status = 'accepted'
     ) then
    v_can_see := true;
  end if;

  if not v_can_see then
    return;
  end if;

  return query
  select
    pf.follower_id as user_id,
    pf.created_at as saved_at
  from public.playlist_follows pf
  inner join public.people_follows f
    on f.person_id = pf.follower_id
   and f.follower_id = v_uid
  where pf.playlist_id = p_playlist_id
    and pf.follower_id is distinct from v_uid
    and (
      to_regclass('public.user_blocks') is null
      or not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = v_uid and b.blocked_id = pf.follower_id)
           or (b.blocker_id = pf.follower_id and b.blocked_id = v_uid)
      )
    )
  order by pf.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.friends_who_saved_playlist(uuid, integer) from public;
grant execute on function public.friends_who_saved_playlist(uuid, integer) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_friends_who_saved_playlist.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_person_saved_playlists.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Public profile: playlists a person saved (no full follows scrape)
-- Requires playlist_follows + playlists + users
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.person_saved_public_playlists(
  p_person_id uuid,
  p_limit integer default 12
)
returns table (
  playlist_id uuid,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_lim integer := greatest(1, least(coalesce(p_limit, 12), 40));
begin
  if p_person_id is null then
    return;
  end if;

  if to_regclass('public.playlist_follows') is null then
    return;
  end if;

  select coalesce(u.privacy_public_profile, true)
  into v_public
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true then
    return;
  end if;

  -- Self can always see own public saves on their profile
  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return;
  end if;

  return query
  select
    pf.playlist_id,
    pf.created_at as followed_at
  from public.playlist_follows pf
  inner join public.playlists p
    on p.id = pf.playlist_id
   and p.is_public is true
  where pf.follower_id = p_person_id
  order by pf.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.person_saved_public_playlists(uuid, integer) from public;
grant execute on function public.person_saved_public_playlists(uuid, integer) to authenticated, anon;

notify pgrst, 'reload schema';

-- END 20260809_person_saved_playlists.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_person_followed_artists.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Public profile: artists a person follows
-- Requires artist_follows + users
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.person_followed_artists(
  p_person_id uuid,
  p_limit integer default 12
)
returns table (
  artist_id uuid,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_lim integer := greatest(1, least(coalesce(p_limit, 12), 40));
begin
  if p_person_id is null then
    return;
  end if;

  if to_regclass('public.artist_follows') is null then
    return;
  end if;

  select coalesce(u.privacy_public_profile, true)
  into v_public
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true then
    return;
  end if;

  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return;
  end if;

  return query
  select
    f.artist_id,
    f.created_at as followed_at
  from public.artist_follows f
  inner join public.users a
    on a.id = f.artist_id
   and (
     a.account_type = 'artist'
     or a.role = 'artist'
   )
   and coalesce(a.privacy_public_profile, true) = true
  where f.follower_id = p_person_id
  order by f.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.person_followed_artists(uuid, integer) from public;
grant execute on function public.person_followed_artists(uuid, integer) to authenticated, anon;

notify pgrst, 'reload schema';

-- END 20260809_person_followed_artists.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_saver_track_notify.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Notify playlist savers when a track is added
-- Requires playlist_follows + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'comment_like',
    'playlist_track_add'
  ));

create or replace function public.notify_playlist_followers_track_add(
  p_playlist_id uuid,
  p_track_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
  v_name text;
  v_title text;
  v_body text;
  v_notified integer := 0;
  v_skipped integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  -- Only fan out for public mixes (that's who can save)
  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private', 'notified', 0);
  end if;

  -- Caller must be owner or accepted collaborator
  if v_owner <> v_uid then
    if not public.is_accepted_playlist_collaborator(p_playlist_id, v_uid) then
      raise exception 'not_allowed';
    end if;
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  v_body := coalesce(nullif(trim(v_title), ''), 'a track')
    || ' · '
    || coalesce(nullif(trim(v_name), ''), 'playlist');

  for r in
    select f.follower_id
    from public.playlist_follows f
    where f.playlist_id = p_playlist_id
      and f.follower_id <> v_uid
    order by f.created_at desc
    limit 40
  loop
    if exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = r.follower_id
        and n.kind = 'playlist_track_add'
        and n.playlist_id = p_playlist_id
        and n.track_id = trim(p_track_id)
        and n.read_at is null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id, track_id
    )
    values (
      r.follower_id,
      v_uid,
      'playlist_track_add',
      left(v_body, 280),
      p_playlist_id,
      trim(p_track_id)
    );
    v_notified := v_notified + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'notified', v_notified,
    'skipped_unread', v_skipped
  );
end;
$$;

revoke all on function public.notify_playlist_followers_track_add(uuid, text) from public;
grant execute on function public.notify_playlist_followers_track_add(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_saver_track_notify.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_collab_request.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Ask to collab → notify mix owner (owner still invites)
-- Requires playlist_collaborators + people_follows + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.notify_playlist_collab_request(
  p_playlist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
  v_name text;
  v_follows boolean;
  v_status text;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner is null or v_owner = v_uid then
    raise exception 'cannot_request_own';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  -- Must follow the owner (same graph invite uses)
  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = v_owner
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select c.status into v_status
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = v_uid;

  if found and v_status = 'accepted' then
    return jsonb_build_object('ok', true, 'skipped', 'already_collaborator');
  end if;

  if found and v_status = 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'invite_pending');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_request'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_collab_request',
    coalesce(nullif(trim(v_name), ''), 'your mix'),
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_collab_request(uuid) from public;
grant execute on function public.notify_playlist_collab_request(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_collab_request.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_collab_approve_from_request.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Collab ask → one-click Approve / Decline (no second invite hop)
-- Requires playlist_collab_request + playlist_collaborators + exit notify kinds
-- Paste in Supabase SQL Editor → Run
-- ============================================================

-- Asker can see whether their unread ask is still pending (RLS hides owner inbox)
create or replace function public.has_playlist_collab_ask_pending(
  p_playlist_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null or p_playlist_id is null then
    return false;
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found or v_owner is null or v_owner = v_uid then
    return false;
  end if;

  return exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_request'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  );
end;
$$;

revoke all on function public.has_playlist_collab_ask_pending(uuid) from public;
grant execute on function public.has_playlist_collab_ask_pending(uuid) to authenticated;

-- Owner approves an ask → asker becomes accepted collaborator immediately
create or replace function public.approve_playlist_collab_request(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_asked boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_approve_self';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
          or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_approve_owner';
  end if;

  select exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_uid
      and n.actor_id = p_user_id
      and n.kind = 'playlist_collab_request'
      and n.playlist_id = p_playlist_id
  ) into v_asked;

  if not v_asked then
    raise exception 'no_request';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_uid
      and actor_id = p_user_id
      and kind = 'playlist_collab_request'
      and playlist_id = p_playlist_id
      and read_at is null;

    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found then
    update public.playlist_collaborators
    set status = 'accepted',
        invited_by = coalesce(invited_by, v_uid),
        responded_at = now()
    where playlist_id = p_playlist_id and user_id = p_user_id;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status, responded_at
    )
    values (
      p_playlist_id, p_user_id, v_uid, 'accepted', now()
    );
  end if;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  -- Clear any leftover invite to the asker
  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = p_user_id
    and actor_id = v_uid
    and kind = 'playlist_collab_invite'
    and playlist_id = p_playlist_id
    and read_at is null;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_accepted'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      p_user_id,
      v_uid,
      'playlist_collab_accepted',
      coalesce(nullif(trim(v_name), ''), 'a playlist'),
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.approve_playlist_collab_request(uuid, uuid) from public;
grant execute on function public.approve_playlist_collab_request(uuid, uuid) to authenticated;

-- Owner declines an ask → notify asker, no membership
create or replace function public.decline_playlist_collab_request(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_asked boolean;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  select exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_uid
      and n.actor_id = p_user_id
      and n.kind = 'playlist_collab_request'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) into v_asked;

  if not v_asked then
    return jsonb_build_object('ok', true, 'skipped', 'no_unread_request');
  end if;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  if not (
       to_regclass('public.user_blocks') is not null
       and exists (
         select 1 from public.user_blocks b
         where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
            or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
       )
     )
     and not exists (
       select 1 from public.artist_notifications n
       where n.recipient_id = p_user_id
         and n.actor_id = v_uid
         and n.kind = 'playlist_collab_declined'
         and n.playlist_id = p_playlist_id
         and n.read_at is null
     )
  then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      p_user_id,
      v_uid,
      'playlist_collab_declined',
      coalesce(nullif(trim(v_name), ''), 'a playlist'),
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'declined',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.decline_playlist_collab_request(uuid, uuid) from public;
grant execute on function public.decline_playlist_collab_request(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_collab_approve_from_request.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_collab_invite_from_request.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Invite from collab request (skip follow gate when they asked)
-- Requires playlist_collab_request + invite_playlist_collaborator
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.invite_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_follows boolean;
  v_asked boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_invite_self';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
          or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_invite_owner';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_user_id
  ) into v_follows;

  select exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_uid
      and n.actor_id = p_user_id
      and n.kind = 'playlist_collab_request'
      and n.playlist_id = p_playlist_id
  ) into v_asked;

  if not v_follows and not v_asked then
    raise exception 'not_following';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found and v_existing = 'pending' then
    null;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status
    )
    values (p_playlist_id, p_user_id, v_uid, 'pending');
  end if;

  -- Mark matching collab requests as read
  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_invite'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'status', 'pending'
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_user_id,
    v_uid,
    'playlist_collab_invite',
    coalesce(nullif(trim(v_name), ''), 'a playlist'),
    p_playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.invite_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.invite_playlist_collaborator(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_collab_invite_from_request.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_collab_exit_notify.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Collab decline / leave / remove → inbox
-- Requires 20260809_playlist_collaborators.sql
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.respond_playlist_collab(
  p_playlist_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.playlist_collaborators%rowtype;
  v_name text;
  v_notif_id bigint;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select * into v_row
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = v_uid;

  if not found then
    raise exception 'invite_not_found';
  end if;

  if v_row.status = 'accepted' and p_accept then
    return jsonb_build_object('ok', true, 'skipped', 'already_accepted', 'status', 'accepted');
  end if;

  select coalesce(nullif(trim(p.name), ''), 'a playlist') into v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not p_accept then
    delete from public.playlist_collaborators
    where playlist_id = p_playlist_id and user_id = v_uid;

    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_uid
      and playlist_id = p_playlist_id
      and kind = 'playlist_collab_invite'
      and read_at is null;

    v_recipient := v_row.invited_by;
    if v_recipient is not null
       and v_recipient <> v_uid
       and not (
         to_regclass('public.user_blocks') is not null
         and exists (
           select 1 from public.user_blocks b
           where (b.blocker_id = v_uid and b.blocked_id = v_recipient)
              or (b.blocker_id = v_recipient and b.blocked_id = v_uid)
         )
       )
       and not exists (
         select 1 from public.artist_notifications n
         where n.recipient_id = v_recipient
           and n.actor_id = v_uid
           and n.kind = 'playlist_collab_declined'
           and n.playlist_id = p_playlist_id
           and n.read_at is null
       )
    then
      insert into public.artist_notifications (
        recipient_id, actor_id, kind, body, playlist_id
      )
      values (
        v_recipient,
        v_uid,
        'playlist_collab_declined',
        v_name,
        p_playlist_id
      )
      returning id into v_notif_id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'declined',
      'notification_id', v_notif_id
    );
  end if;

  update public.playlist_collaborators
  set status = 'accepted',
      responded_at = now()
  where playlist_id = p_playlist_id and user_id = v_uid;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and playlist_id = p_playlist_id
    and kind = 'playlist_collab_invite'
    and read_at is null;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_row.invited_by
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_accepted'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      v_row.invited_by,
      v_uid,
      'playlist_collab_accepted',
      v_name,
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.respond_playlist_collab(uuid, boolean) from public;
grant execute on function public.respond_playlist_collab(uuid, boolean) to authenticated;

create or replace function public.remove_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_target uuid;
  v_name text;
  v_notif_id bigint;
  v_recipient uuid;
  v_kind text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, coalesce(nullif(trim(p.name), ''), 'a playlist')
  into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  v_target := coalesce(p_user_id, v_uid);

  if v_uid = v_owner then
    if v_target = v_owner then
      raise exception 'cannot_remove_owner';
    end if;
  elsif v_uid = v_target then
    null; -- leave
  else
    raise exception 'not_allowed';
  end if;

  if not exists (
    select 1 from public.playlist_collaborators c
    where c.playlist_id = p_playlist_id and c.user_id = v_target
  ) then
    raise exception 'collaborator_not_found';
  end if;

  delete from public.playlist_collaborators
  where playlist_id = p_playlist_id and user_id = v_target;

  if v_uid = v_owner and v_target <> v_uid then
    v_recipient := v_target;
    v_kind := 'playlist_collab_removed';
  elsif v_uid = v_target and v_owner is not null and v_owner <> v_uid then
    v_recipient := v_owner;
    v_kind := 'playlist_collab_left';
  else
    return jsonb_build_object('ok', true, 'removed', v_target);
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_recipient)
          or (b.blocker_id = v_recipient and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'removed', v_target, 'skipped', 'blocked');
  end if;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_recipient
      and n.actor_id = v_uid
      and n.kind = v_kind
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      v_recipient,
      v_uid,
      v_kind,
      v_name,
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'removed', v_target,
    'kind', v_kind,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.remove_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.remove_playlist_collaborator(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_collab_exit_notify.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_track_likes_artist_select.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist can list who liked their tracks — paste in Supabase SQL Editor → Run
-- Requires 20260807_track_likes.sql
-- ============================================================

-- Owners read likes on their own tracks (inbox already notifies; this closes the roster loop)
drop policy if exists "track_likes_select_as_artist" on public.track_likes;
create policy "track_likes_select_as_artist"
  on public.track_likes for select
  to authenticated
  using (
    exists (
      select 1
      from public.tracks t
      where t.id::text = track_likes.track_id
        and t.artist_id::text = auth.uid()::text
    )
  );

notify pgrst, 'reload schema';

-- END 20260809_track_likes_artist_select.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_artist_listen_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist can thank a fan for listening (owner path)
-- - listen notifs store play_id
-- - send_play_thanks allows track owner OR people-follow
-- Requires plays + tracks + play_thanks + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists play_id text;

drop function if exists public.notify_track_listen(text);
drop function if exists public.notify_track_listen(text, text);

create or replace function public.notify_track_listen(
  p_track_id text,
  p_play_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_share boolean;
  v_play text;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select
    nullif(trim(t.artist_id::text), '')::uuid,
    t.title
  into v_artist, v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_artist');
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  select coalesce(u.privacy_show_activity, true)
  into v_share
  from public.users u
  where u.id = v_uid;

  if not found or v_share is not true then
    return jsonb_build_object('ok', true, 'skipped', 'privacy');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_artist)
          or (b.blocker_id = v_artist and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  v_play := nullif(trim(coalesce(p_play_id, '')), '');
  if v_play is null then
    select p.id::text
    into v_play
    from public.plays p
    where p.track_id::text = trim(p_track_id)
      and p.listener_id = v_uid
    order by p.created_at desc nulls last
    limit 1;
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'listen'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'play_id', v_play
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, play_id
  )
  values (
    v_artist,
    v_uid,
    'listen',
    coalesce(nullif(trim(v_title), ''), 'your track'),
    trim(p_track_id),
    v_play
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', trim(p_track_id),
    'play_id', v_play
  );
end;
$$;

revoke all on function public.notify_track_listen(text, text) from public;
grant execute on function public.notify_track_listen(text, text) to authenticated;

create or replace function public.send_play_thanks(
  p_play_id text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_listener uuid;
  v_track text;
  v_artist uuid;
  v_is_owner boolean := false;
  v_share boolean;
  v_message text;
  v_notif_id bigint;
  v_existing text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_play_id is null or length(trim(p_play_id)) = 0 then
    raise exception 'play_required';
  end if;

  select
    p.listener_id,
    p.track_id::text
  into v_listener, v_track
  from public.plays p
  where p.id::text = trim(p_play_id);

  if not found then
    raise exception 'play_not_found';
  end if;

  if v_listener is null or v_listener = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = coalesce(v_track, '');

  v_is_owner := v_artist is not null and v_artist = v_uid;

  if not v_is_owner then
    if to_regclass('public.people_follows') is null
       or not exists (
         select 1 from public.people_follows f
         where f.follower_id = v_uid and f.person_id = v_listener
       ) then
      raise exception 'not_following';
    end if;
  end if;

  select coalesce(u.privacy_show_activity, true)
  into v_share
  from public.users u
  where u.id = v_listener;

  if not found or v_share is not true then
    raise exception 'privacy';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_listener)
          or (b.blocker_id = v_listener and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  -- One thanks per thanker + listener + track (any play)
  select t.message
  into v_existing
  from public.play_thanks t
  where t.thanker_id = v_uid
    and t.listener_id = v_listener
    and t.track_id is not distinct from v_track
  order by t.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_existing,
      'play_id', trim(p_play_id)
    );
  end if;

  insert into public.play_thanks (
    play_id, thanker_id, listener_id, track_id, message
  )
  values (
    trim(p_play_id), v_uid, v_listener, v_track, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_listener
      and n.actor_id = v_uid
      and n.kind = 'activity_thanks'
      and n.track_id is not distinct from v_track
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'play_id', trim(p_play_id),
      'listener_id', v_listener
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_listener,
    v_uid,
    'activity_thanks',
    v_message,
    v_track
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'play_id', trim(p_play_id),
    'listener_id', v_listener,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_play_thanks(text, text) from public;
grant execute on function public.send_play_thanks(text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_artist_listen_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_artist_like_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist can thank a fan for liking (owner path)
-- send_like_thanks: track owner OR people-follow
-- Requires tracks + track_likes + like_thanks + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.send_like_thanks(
  p_liker_id uuid,
  p_track_id text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_is_owner boolean := false;
  v_share boolean;
  v_message text;
  v_track text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_liker_id is null then
    raise exception 'liker_required';
  end if;

  v_track := trim(coalesce(p_track_id, ''));
  if length(v_track) = 0 then
    raise exception 'track_required';
  end if;

  if p_liker_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = v_track;

  if not found then
    raise exception 'track_not_found';
  end if;

  v_is_owner := v_artist is not null and v_artist = v_uid;

  if not v_is_owner then
    if to_regclass('public.people_follows') is null
       or not exists (
         select 1 from public.people_follows f
         where f.follower_id = v_uid and f.person_id = p_liker_id
       ) then
      raise exception 'not_following';
    end if;
  end if;

  if not exists (
    select 1 from public.track_likes l
    where l.user_id = p_liker_id and l.track_id::text = v_track
  ) then
    raise exception 'like_not_found';
  end if;

  -- Friends feed: liker must opt into public likes.
  -- Owner path: artist already saw the like in studio / inbox.
  if not v_is_owner then
    select coalesce(u.privacy_show_likes, false)
    into v_share
    from public.users u
    where u.id = p_liker_id;

    if not found or v_share is not true then
      raise exception 'privacy';
    end if;
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_liker_id)
          or (b.blocker_id = p_liker_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  if exists (
    select 1 from public.like_thanks t
    where t.thanker_id = v_uid
      and t.liker_id = p_liker_id
      and t.track_id = v_track
  ) then
    select t.message into v_message
    from public.like_thanks t
    where t.thanker_id = v_uid
      and t.liker_id = p_liker_id
      and t.track_id = v_track;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'liker_id', p_liker_id,
      'track_id', v_track
    );
  end if;

  insert into public.like_thanks (
    thanker_id, liker_id, track_id, message
  )
  values (
    v_uid, p_liker_id, v_track, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_liker_id
      and n.actor_id = v_uid
      and n.kind = 'like_thanks'
      and n.track_id is not distinct from v_track
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'liker_id', p_liker_id,
      'track_id', v_track
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    p_liker_id,
    v_uid,
    'like_thanks',
    v_message,
    v_track
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'liker_id', p_liker_id,
    'track_id', v_track,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_like_thanks(uuid, text, text) from public;
grant execute on function public.send_like_thanks(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_artist_like_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260810_phase1_track_live_status.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Phase 1: track status + writer splits
-- Paste in Supabase SQL Editor → Run
--
-- tracks.id is UUID — writer splits must use uuid track_id.
-- Live catalog status = 'live' (pending = draft).
-- ============================================================

-- Allow pending (draft) + live (public). Keep published as alias for safety.
alter table public.tracks drop constraint if exists tracks_status_check;
alter table public.tracks
  add constraint tracks_status_check
  check (
    status is null
    or lower(status) in ('pending', 'live', 'published', 'draft', 'unpublished')
  );

-- Normalize any legacy published rows to live
update public.tracks
set status = 'live'
where lower(coalesce(status, '')) = 'published';

-- Default new rows to pending (draft) until artist publishes
alter table public.tracks
  alter column status set default 'pending';

-- Recreate writer splits with uuid FK matching tracks.id
drop function if exists public.set_track_writer_splits(text, jsonb);
drop function if exists public.set_track_writer_splits(uuid, jsonb);
drop table if exists public.track_writer_splits cascade;

create table public.track_writer_splits (
  id bigserial primary key,
  track_id uuid not null references public.tracks (id) on delete cascade,
  writer_name text not null,
  share_percent numeric(5, 2) not null
    check (share_percent > 0 and share_percent <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index track_writer_splits_track_id_idx
  on public.track_writer_splits (track_id);

alter table public.track_writer_splits enable row level security;

drop policy if exists "track_writer_splits_select_public" on public.track_writer_splits;
create policy "track_writer_splits_select_public"
  on public.track_writer_splits for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and (
          t.artist_id = auth.uid()
          or lower(coalesce(t.status, 'live'))
            not in ('pending', 'draft', 'unpublished')
        )
    )
  );

drop policy if exists "track_writer_splits_insert_own" on public.track_writer_splits;
create policy "track_writer_splits_insert_own"
  on public.track_writer_splits for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

drop policy if exists "track_writer_splits_update_own" on public.track_writer_splits;
create policy "track_writer_splits_update_own"
  on public.track_writer_splits for update
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

drop policy if exists "track_writer_splits_delete_own" on public.track_writer_splits;
create policy "track_writer_splits_delete_own"
  on public.track_writer_splits for delete
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

create or replace function public.set_track_writer_splits(
  p_track_id uuid,
  p_writers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_name text;
  v_pct numeric;
  v_ord integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null then
    raise exception 'track_required';
  end if;

  if p_writers is null or jsonb_typeof(p_writers) <> 'array' then
    raise exception 'writers_required';
  end if;

  if jsonb_array_length(p_writers) < 1 then
    raise exception 'writers_required';
  end if;

  select t.artist_id into v_artist
  from public.tracks t
  where t.id = p_track_id;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is distinct from v_uid then
    raise exception 'not_owner';
  end if;

  for v_item in select * from jsonb_array_elements(p_writers)
  loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    begin
      v_pct := (v_item->>'percent')::numeric;
    exception when others then
      raise exception 'invalid_percent';
    end;
    if v_name is null then
      raise exception 'writer_name_required';
    end if;
    if v_pct is null or v_pct <= 0 or v_pct > 100 then
      raise exception 'invalid_percent';
    end if;
    v_total := v_total + v_pct;
  end loop;

  if abs(v_total - 100) > 0.01 then
    raise exception 'splits_must_total_100';
  end if;

  delete from public.track_writer_splits where track_id = p_track_id;

  for v_item in select * from jsonb_array_elements(p_writers)
  loop
    v_name := trim(v_item->>'name');
    v_pct := (v_item->>'percent')::numeric;
    insert into public.track_writer_splits (
      track_id, writer_name, share_percent, sort_order
    ) values (
      p_track_id, left(v_name, 120), round(v_pct, 2), v_ord
    );
    v_ord := v_ord + 1;
  end loop;

  return jsonb_build_object('ok', true, 'total', 100);
end;
$$;

revoke all on function public.set_track_writer_splits(uuid, jsonb) from public;
grant execute on function public.set_track_writer_splits(uuid, jsonb) to authenticated;

-- Release notify: accept live OR published
-- Keep p_track_id text so existing callers still match; cast to uuid for tracks.id.
create or replace function public.notify_track_release(p_track_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_track uuid;
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

  begin
    v_track := trim(p_track_id)::uuid;
  exception when others then
    raise exception 'track_required';
  end;

  select artist_id, title, status
  into v_artist, v_title, v_status
  from public.tracks
  where id = v_track;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is distinct from v_uid then
    raise exception 'not_your_track';
  end if;

  if lower(coalesce(v_status, 'pending')) not in ('live', 'published') then
    raise exception 'track_not_published';
  end if;

  if to_regclass('public.artist_follows') is null
     or to_regclass('public.artist_notifications') is null then
    return jsonb_build_object('ok', true, 'notified', 0);
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
      v_track::text
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'notified', v_count);
exception
  when others then
    -- Soft-fail if notification schema differs
    return jsonb_build_object('ok', true, 'notified', 0, 'warning', SQLERRM);
end;
$$;

revoke all on function public.notify_track_release(text) from public;
grant execute on function public.notify_track_release(text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260810_phase1_track_live_status.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260810_track_writer_splits.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Track writer splits — paste in Supabase SQL Editor → Run
-- Prefer 20260810_phase1_track_live_status.sql (includes status fix)
-- tracks.id is UUID
-- ============================================================

drop function if exists public.set_track_writer_splits(text, jsonb);
drop function if exists public.set_track_writer_splits(uuid, jsonb);
drop table if exists public.track_writer_splits cascade;

create table public.track_writer_splits (
  id bigserial primary key,
  track_id uuid not null references public.tracks (id) on delete cascade,
  writer_name text not null,
  share_percent numeric(5, 2) not null
    check (share_percent > 0 and share_percent <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index track_writer_splits_track_id_idx
  on public.track_writer_splits (track_id);

alter table public.track_writer_splits enable row level security;

drop policy if exists "track_writer_splits_select_public" on public.track_writer_splits;
create policy "track_writer_splits_select_public"
  on public.track_writer_splits for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and (
          t.artist_id = auth.uid()
          or lower(coalesce(t.status, 'live'))
            not in ('pending', 'draft', 'unpublished')
        )
    )
  );

drop policy if exists "track_writer_splits_insert_own" on public.track_writer_splits;
create policy "track_writer_splits_insert_own"
  on public.track_writer_splits for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

drop policy if exists "track_writer_splits_update_own" on public.track_writer_splits;
create policy "track_writer_splits_update_own"
  on public.track_writer_splits for update
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

drop policy if exists "track_writer_splits_delete_own" on public.track_writer_splits;
create policy "track_writer_splits_delete_own"
  on public.track_writer_splits for delete
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

create or replace function public.set_track_writer_splits(
  p_track_id uuid,
  p_writers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_name text;
  v_pct numeric;
  v_ord integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null then
    raise exception 'track_required';
  end if;

  if p_writers is null or jsonb_typeof(p_writers) <> 'array' then
    raise exception 'writers_required';
  end if;

  if jsonb_array_length(p_writers) < 1 then
    raise exception 'writers_required';
  end if;

  select t.artist_id into v_artist
  from public.tracks t
  where t.id = p_track_id;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is distinct from v_uid then
    raise exception 'not_owner';
  end if;

  for v_item in select * from jsonb_array_elements(p_writers)
  loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    begin
      v_pct := (v_item->>'percent')::numeric;
    exception when others then
      raise exception 'invalid_percent';
    end;
    if v_name is null then
      raise exception 'writer_name_required';
    end if;
    if v_pct is null or v_pct <= 0 or v_pct > 100 then
      raise exception 'invalid_percent';
    end if;
    v_total := v_total + v_pct;
  end loop;

  if abs(v_total - 100) > 0.01 then
    raise exception 'splits_must_total_100';
  end if;

  delete from public.track_writer_splits where track_id = p_track_id;

  for v_item in select * from jsonb_array_elements(p_writers)
  loop
    v_name := trim(v_item->>'name');
    v_pct := (v_item->>'percent')::numeric;
    insert into public.track_writer_splits (
      track_id, writer_name, share_percent, sort_order
    ) values (
      p_track_id, left(v_name, 120), round(v_pct, 2), v_ord
    );
    v_ord := v_ord + 1;
  end loop;

  return jsonb_build_object('ok', true, 'total', 100);
end;
$$;

revoke all on function public.set_track_writer_splits(uuid, jsonb) from public;
grant execute on function public.set_track_writer_splits(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- END 20260810_track_writer_splits.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260811_record_credited_play.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Atomic credited play — paste in Supabase SQL Editor → Run
--
-- consume_play_credit + plays insert used to be two steps:
-- credit could burn even if the play row failed.
-- record_credited_play does both in one transaction.
-- ============================================================

drop function if exists public.record_credited_play(uuid);
drop function if exists public.record_credited_play(uuid, integer);

create or replace function public.record_credited_play(
  p_track_id uuid,
  p_starter integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new integer;
  v_play_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null then
    raise exception 'track_required';
  end if;

  if not exists (select 1 from public.tracks t where t.id = p_track_id) then
    raise exception 'track_not_found';
  end if;

  -- Same starter semantics as ensure_play_balance (first listen).
  insert into public.user_play_balances (user_id, credits, updated_at)
  values (v_uid, greatest(coalesce(p_starter, 25), 0), now())
  on conflict (user_id) do nothing;

  update public.user_play_balances
  set credits = credits - 1,
      updated_at = now()
  where user_id = v_uid
    and credits > 0
  returning credits into v_new;

  if not found then
    raise exception 'insufficient_credits';
  end if;

  insert into public.plays (track_id, listener_id)
  values (p_track_id, v_uid)
  returning id into v_play_id;

  return jsonb_build_object(
    'ok', true,
    'play_id', v_play_id,
    'credits_remaining', v_new
  );
end;
$$;

revoke all on function public.record_credited_play(uuid, integer) from public;
grant execute on function public.record_credited_play(uuid, integer) to authenticated;

notify pgrst, 'reload schema';

-- END 20260811_record_credited_play.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260811_play_pack_purchase_pending.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Play pack purchase state machine: pending → confirmed
-- Paste in Supabase SQL Editor → Run
--
-- Buy creates a pending purchase (no credits yet).
-- confirm_play_pack_purchase grants credits after "payment"
-- (demo confirm until a real rail exists).
-- ============================================================

-- Buy: pending only — do not credit balance yet
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
    'pending',
    'stub'
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
    'price_label', v_pack.price_label
  );
end;
$$;

revoke all on function public.purchase_play_pack(bigint) from public;
grant execute on function public.purchase_play_pack(bigint) to authenticated;

-- Confirm pending purchase (demo payment complete) → grant credits
create or replace function public.confirm_play_pack_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.play_pack_purchases%rowtype;
  v_new_balance integer;
  v_pack_name text;
  v_pack_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
  from public.play_pack_purchases
  where id = p_purchase_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    select credits into v_new_balance
    from public.user_play_balances
    where user_id = v_uid;

    select code, name into v_pack_code, v_pack_name
    from public.play_packs
    where id = v_row.pack_id;

    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'purchase_id', v_row.id,
      'credits_granted', v_row.credits_granted,
      'balance', coalesce(v_new_balance, 0),
      'pack_code', v_pack_code,
      'pack_name', v_pack_name,
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
  values (v_uid, v_row.credits_granted, now())
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

revoke all on function public.confirm_play_pack_purchase(bigint) from public;
grant execute on function public.confirm_play_pack_purchase(bigint) to authenticated;

-- Optional: abandon a pending purchase
create or replace function public.cancel_play_pack_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.play_pack_purchases%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
  from public.play_pack_purchases
  where id = p_purchase_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  update public.play_pack_purchases
  set status = 'failed'
  where id = v_row.id;

  return jsonb_build_object('ok', true, 'status', 'failed', 'purchase_id', v_row.id);
end;
$$;

revoke all on function public.cancel_play_pack_purchase(bigint) from public;
grant execute on function public.cancel_play_pack_purchase(bigint) to authenticated;

notify pgrst, 'reload schema';

-- END 20260811_play_pack_purchase_pending.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_tracks_editorial_boost.sql
-- ═══════════════════════════════════════════════════════════
-- Optional editorial boost for RECT SCORE (0–100). Paste in Supabase SQL Editor → Run.

alter table public.tracks
  add column if not exists editorial_boost smallint not null default 0;

alter table public.tracks
  drop constraint if exists tracks_editorial_boost_check;

alter table public.tracks
  add constraint tracks_editorial_boost_check
  check (editorial_boost >= 0 and editorial_boost <= 100);

notify pgrst, 'reload schema';

-- END 20260830_tracks_editorial_boost.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_plays_listened_secs.sql
-- ═══════════════════════════════════════════════════════════
-- Track how much of each credited play was listened to (for completion rate analytics).
-- Safe to re-run.

alter table public.plays
  add column if not exists listened_secs integer check (listened_secs is null or listened_secs >= 0);

create index if not exists plays_track_listened_idx
  on public.plays (track_id, listened_secs)
  where listened_secs is not null;

-- Credit threshold matches lib/dashboard/analytics-time.ts CREDIT_LISTEN_SECS
drop function if exists public.record_credited_play(uuid);
drop function if exists public.record_credited_play(uuid, integer);

create or replace function public.record_credited_play(
  p_track_id uuid,
  p_starter integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new integer;
  v_play_id uuid;
  v_credit_secs integer := 30;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null then
    raise exception 'track_required';
  end if;

  if not exists (select 1 from public.tracks t where t.id = p_track_id) then
    raise exception 'track_not_found';
  end if;

  insert into public.user_play_balances (user_id, credits, updated_at)
  values (v_uid, greatest(coalesce(p_starter, 25), 0), now())
  on conflict (user_id) do nothing;

  update public.user_play_balances
  set credits = credits - 1,
      updated_at = now()
  where user_id = v_uid
    and credits > 0
  returning credits into v_new;

  if not found then
    raise exception 'insufficient_credits';
  end if;

  insert into public.plays (track_id, listener_id, listened_secs)
  values (p_track_id, v_uid, v_credit_secs)
  returning id into v_play_id;

  return jsonb_build_object(
    'ok', true,
    'play_id', v_play_id,
    'credits_remaining', v_new,
    'listened_secs', v_credit_secs
  );
end;
$$;

revoke all on function public.record_credited_play(uuid, integer) from public;
grant execute on function public.record_credited_play(uuid, integer) to authenticated;

notify pgrst, 'reload schema';

-- END 20260830_plays_listened_secs.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_tracks_taali_fields.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Optional nullable columns on tracks (storage only — no external TAALI DB/API)
-- ============================================================

alter table public.tracks
  add column if not exists taali_registry_id text,
  add column if not exists isrc_code text,
  add column if not exists writer_splits jsonb,
  add column if not exists master_owner text,
  add column if not exists territory_of_origin char(2);

alter table public.tracks
  drop constraint if exists tracks_territory_of_origin_check;

alter table public.tracks
  add constraint tracks_territory_of_origin_check
  check (
    territory_of_origin is null
    or territory_of_origin ~ '^[A-Za-z]{2}$'
  );

notify pgrst, 'reload schema';

-- END 20260830_tracks_taali_fields.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_monetization_stack.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- RECT monetization stack — wallet, downloads, fan club, portal, fan charts
-- All money flows through JOKO. Safe to re-run (idempotent where possible).
-- ============================================================

-- ── Song download pricing ─────────────────────────────────────
alter table public.tracks
  add column if not exists download_price_xof integer
  check (download_price_xof is null or download_price_xof >= 0);

create table if not exists public.track_download_purchases (
  id bigserial primary key,
  track_id uuid not null references public.tracks (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  price_xof integer not null check (price_xof >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'failed')),
  payment_method text not null default 'joko',
  payment_phone text,
  joko_reference text,
  created_at timestamptz not null default now()
);

create index if not exists track_download_purchases_track_idx
  on public.track_download_purchases (track_id);

create index if not exists track_download_purchases_artist_idx
  on public.track_download_purchases (artist_id, created_at desc);

alter table public.track_download_purchases enable row level security;

drop policy if exists "track_download_purchases_select_parties" on public.track_download_purchases;
create policy "track_download_purchases_select_parties"
  on public.track_download_purchases for select
  to authenticated
  using (buyer_id = auth.uid() or artist_id = auth.uid());

-- ── Artist wallet + JOKO payouts ──────────────────────────────
create table if not exists public.artist_wallets (
  artist_id uuid primary key references auth.users (id) on delete cascade,
  payout_phone text,
  next_payout_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artist_wallet_ledger (
  id bigserial primary key,
  artist_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'stream', 'download', 'merch', 'fan_club', 'tip', 'payout', 'adjustment'
  )),
  amount_xof integer not null,
  reference_id text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists artist_wallet_ledger_artist_idx
  on public.artist_wallet_ledger (artist_id, created_at desc);

create table if not exists public.artist_joko_payouts (
  id bigserial primary key,
  artist_id uuid not null references auth.users (id) on delete cascade,
  amount_xof integer not null check (amount_xof > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed')),
  payout_phone text not null,
  joko_reference text,
  scheduled_for timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists artist_joko_payouts_artist_idx
  on public.artist_joko_payouts (artist_id, created_at desc);

alter table public.artist_wallets enable row level security;
alter table public.artist_wallet_ledger enable row level security;
alter table public.artist_joko_payouts enable row level security;

drop policy if exists "artist_wallets_select_own" on public.artist_wallets;
create policy "artist_wallets_select_own"
  on public.artist_wallets for select
  to authenticated
  using (artist_id = auth.uid());

drop policy if exists "artist_wallets_upsert_own" on public.artist_wallets;
create policy "artist_wallets_upsert_own"
  on public.artist_wallets for all
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "artist_wallet_ledger_select_own" on public.artist_wallet_ledger;
create policy "artist_wallet_ledger_select_own"
  on public.artist_wallet_ledger for select
  to authenticated
  using (artist_id = auth.uid());

drop policy if exists "artist_joko_payouts_select_own" on public.artist_joko_payouts;
create policy "artist_joko_payouts_select_own"
  on public.artist_joko_payouts for select
  to authenticated
  using (artist_id = auth.uid());

-- ── Fan club tiers ────────────────────────────────────────────
create table if not exists public.fan_club_tiers (
  id bigserial primary key,
  artist_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  price_xof_month integer not null check (price_xof_month >= 0),
  perks jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fan_club_tiers_artist_idx
  on public.fan_club_tiers (artist_id, sort_order);

create table if not exists public.fan_club_members (
  id bigserial primary key,
  tier_id bigint not null references public.fan_club_tiers (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  fan_id uuid not null references auth.users (id) on delete cascade,
  price_xof integer not null check (price_xof >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'cancelled')),
  payment_method text not null default 'joko',
  payment_phone text,
  joko_reference text,
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint fan_club_members_unique unique (fan_id, tier_id)
);

create index if not exists fan_club_members_artist_idx
  on public.fan_club_members (artist_id, status);

alter table public.fan_club_tiers enable row level security;
alter table public.fan_club_members enable row level security;

drop policy if exists "fan_club_tiers_select_public" on public.fan_club_tiers;
create policy "fan_club_tiers_select_public"
  on public.fan_club_tiers for select
  to anon, authenticated
  using (active = true);

drop policy if exists "fan_club_tiers_manage_own" on public.fan_club_tiers;
create policy "fan_club_tiers_manage_own"
  on public.fan_club_tiers for all
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "fan_club_members_select_parties" on public.fan_club_members;
create policy "fan_club_members_select_parties"
  on public.fan_club_members for select
  to authenticated
  using (fan_id = auth.uid() or artist_id = auth.uid());

-- ── Portal releases (separate artist world) ───────────────────
create table if not exists public.portal_releases (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  slug text,
  kind text not null default 'release'
    check (kind in ('release', 'remix', 'visual', 'personal', 'world')),
  description text,
  cover_url text,
  theme_color text default '#1DB954',
  portal_audio_url text,
  track_id uuid references public.tracks (id) on delete set null,
  published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_releases_artist_idx
  on public.portal_releases (artist_id, sort_order);

create table if not exists public.portal_release_media (
  id bigserial primary key,
  release_id uuid not null references public.portal_releases (id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists portal_release_media_release_idx
  on public.portal_release_media (release_id, sort_order);

alter table public.portal_releases enable row level security;
alter table public.portal_release_media enable row level security;

drop policy if exists "portal_releases_select_public" on public.portal_releases;
create policy "portal_releases_select_public"
  on public.portal_releases for select
  to anon, authenticated
  using (published = true);

drop policy if exists "portal_releases_manage_own" on public.portal_releases;
create policy "portal_releases_manage_own"
  on public.portal_releases for all
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "portal_release_media_select_public" on public.portal_release_media;
create policy "portal_release_media_select_public"
  on public.portal_release_media for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.portal_releases r
      where r.id = release_id and (r.published = true or r.artist_id = auth.uid())
    )
  );

drop policy if exists "portal_release_media_manage_own" on public.portal_release_media;
create policy "portal_release_media_manage_own"
  on public.portal_release_media for all
  to authenticated
  using (
    exists (
      select 1 from public.portal_releases r
      where r.id = release_id and r.artist_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.portal_releases r
      where r.id = release_id and r.artist_id = auth.uid()
    )
  );

-- ── Personal fan charts ───────────────────────────────────────
create table if not exists public.fan_charts (
  id uuid primary key default gen_random_uuid(),
  fan_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'My Chart',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fan_chart_entries (
  id bigserial primary key,
  chart_id uuid not null references public.fan_charts (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  position integer not null check (position > 0),
  added_at timestamptz not null default now(),
  constraint fan_chart_entries_unique unique (chart_id, track_id)
);

create index if not exists fan_charts_fan_idx on public.fan_charts (fan_id);
create index if not exists fan_chart_entries_chart_idx on public.fan_chart_entries (chart_id, position);

alter table public.fan_charts enable row level security;
alter table public.fan_chart_entries enable row level security;

drop policy if exists "fan_charts_select" on public.fan_charts;
create policy "fan_charts_select"
  on public.fan_charts for select
  to authenticated
  using (fan_id = auth.uid() or is_public = true);

drop policy if exists "fan_charts_manage_own" on public.fan_charts;
create policy "fan_charts_manage_own"
  on public.fan_charts for all
  to authenticated
  using (fan_id = auth.uid())
  with check (fan_id = auth.uid());

drop policy if exists "fan_chart_entries_select" on public.fan_chart_entries;
create policy "fan_chart_entries_select"
  on public.fan_chart_entries for select
  to authenticated
  using (
    exists (
      select 1 from public.fan_charts c
      where c.id = chart_id and (c.fan_id = auth.uid() or c.is_public = true)
    )
  );

drop policy if exists "fan_chart_entries_manage_own" on public.fan_chart_entries;
create policy "fan_chart_entries_manage_own"
  on public.fan_chart_entries for all
  to authenticated
  using (
    exists (
      select 1 from public.fan_charts c
      where c.id = chart_id and c.fan_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.fan_charts c
      where c.id = chart_id and c.fan_id = auth.uid()
    )
  );

-- ── Wallet helpers ────────────────────────────────────────────
create or replace function public.ensure_artist_wallet(p_artist_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist uuid := coalesce(p_artist_id, auth.uid());
  v_next timestamptz;
begin
  if v_artist is null then
    raise exception 'not_authenticated';
  end if;

  v_next := date_trunc('month', now()) + interval '1 month';

  insert into public.artist_wallets (artist_id, next_payout_at)
  values (v_artist, v_next)
  on conflict (artist_id) do nothing;

  return jsonb_build_object('ok', true, 'artist_id', v_artist);
end;
$$;

revoke all on function public.ensure_artist_wallet(uuid) from public;
grant execute on function public.ensure_artist_wallet(uuid) to authenticated;

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
begin
  if p_artist_id is null or p_amount_xof is null or p_amount_xof = 0 then
    return null;
  end if;

  perform public.ensure_artist_wallet(p_artist_id);

  insert into public.artist_wallet_ledger (
    artist_id, kind, amount_xof, reference_id, description
  )
  values (
    p_artist_id,
    coalesce(nullif(trim(p_kind), ''), 'adjustment'),
    p_amount_xof,
    nullif(trim(p_reference_id), ''),
    nullif(trim(p_description), '')
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

-- ── Track download purchase ───────────────────────────────────
create or replace function public.purchase_track_download(
  p_track_id uuid,
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
  v_track public.tracks%rowtype;
  v_price integer;
  v_purchase_id bigint;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_track from public.tracks where id = p_track_id;
  if not found then
    raise exception 'track_not_found';
  end if;

  if v_track.artist_id = v_uid then
    raise exception 'own_track';
  end if;

  v_price := coalesce(v_track.download_price_xof, 0);
  if v_price <= 0 then
    raise exception 'download_not_for_sale';
  end if;

  if exists (
    select 1 from public.track_download_purchases
    where track_id = p_track_id and buyer_id = v_uid and status = 'confirmed'
  ) then
    raise exception 'already_purchased';
  end if;

  insert into public.track_download_purchases (
    track_id, buyer_id, artist_id, price_xof, status, payment_method, payment_phone
  )
  values (
    p_track_id, v_uid, v_track.artist_id, v_price, 'pending', v_method, v_phone
  )
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase_id,
    'price_xof', v_price,
    'track_id', p_track_id,
    'artist_id', v_track.artist_id,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.purchase_track_download(uuid, text, text) from public;
grant execute on function public.purchase_track_download(uuid, text, text) to authenticated;

create or replace function public.confirm_track_download_system(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.track_download_purchases%rowtype;
begin
  select * into v_row
  from public.track_download_purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'skipped', 'already_confirmed');
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  update public.track_download_purchases set status = 'confirmed' where id = v_row.id;

  perform public.credit_artist_wallet(
    v_row.artist_id,
    v_row.price_xof,
    'download',
    v_row.id::text,
    'Track download'
  );

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_row.id,
    'track_id', v_row.track_id,
    'price_xof', v_row.price_xof
  );
end;
$$;

revoke all on function public.confirm_track_download_system(bigint) from public;
grant execute on function public.confirm_track_download_system(bigint) to service_role;

create or replace function public.set_track_download_joko_reference(
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
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.track_download_purchases
  set joko_reference = nullif(trim(p_reference), '')
  where id = p_purchase_id and buyer_id = v_uid;

  if not found then raise exception 'purchase_not_found'; end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_track_download_joko_reference(bigint, text) from public;
grant execute on function public.set_track_download_joko_reference(bigint, text) to authenticated;

-- ── Fan club subscribe ────────────────────────────────────────
create or replace function public.subscribe_fan_club_tier(
  p_tier_id bigint,
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
  v_tier public.fan_club_tiers%rowtype;
  v_member_id bigint;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_tier from public.fan_club_tiers
  where id = p_tier_id and active = true;

  if not found then raise exception 'tier_not_found'; end if;
  if v_tier.artist_id = v_uid then raise exception 'own_tier'; end if;

  insert into public.fan_club_members (
    tier_id, artist_id, fan_id, price_xof, status, payment_method, payment_phone
  )
  values (
    v_tier.id, v_tier.artist_id, v_uid, v_tier.price_xof_month, 'pending', v_method, v_phone
  )
  on conflict (fan_id, tier_id) do update
    set status = 'pending',
        payment_method = excluded.payment_method,
        payment_phone = excluded.payment_phone,
        price_xof = excluded.price_xof
  returning id into v_member_id;

  return jsonb_build_object(
    'ok', true,
    'member_id', v_member_id,
    'tier_id', v_tier.id,
    'artist_id', v_tier.artist_id,
    'price_xof', v_tier.price_xof_month,
    'tier_name', v_tier.name,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.subscribe_fan_club_tier(bigint, text, text) from public;
grant execute on function public.subscribe_fan_club_tier(bigint, text, text) to authenticated;

create or replace function public.confirm_fan_club_member_system(p_member_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fan_club_members%rowtype;
begin
  select * into v_row from public.fan_club_members where id = p_member_id for update;
  if not found then raise exception 'member_not_found'; end if;
  if v_row.status = 'active' then
    return jsonb_build_object('ok', true, 'skipped', 'already_active');
  end if;
  if v_row.status <> 'pending' then raise exception 'member_not_pending'; end if;

  update public.fan_club_members
  set status = 'active',
      started_at = now(),
      expires_at = now() + interval '30 days'
  where id = v_row.id;

  perform public.credit_artist_wallet(
    v_row.artist_id,
    v_row.price_xof,
    'fan_club',
    v_row.id::text,
    'Fan club membership'
  );

  return jsonb_build_object('ok', true, 'member_id', v_row.id);
end;
$$;

revoke all on function public.confirm_fan_club_member_system(bigint) from public;
grant execute on function public.confirm_fan_club_member_system(bigint) to service_role;

create or replace function public.set_fan_club_joko_reference(
  p_member_id bigint,
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
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.fan_club_members
  set joko_reference = nullif(trim(p_reference), '')
  where id = p_member_id and fan_id = v_uid;

  if not found then raise exception 'member_not_found'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_fan_club_joko_reference(bigint, text) from public;
grant execute on function public.set_fan_club_joko_reference(bigint, text) to authenticated;

-- ── JOKO payout request ───────────────────────────────────────
create or replace function public.request_joko_payout(
  p_amount_xof integer,
  p_payout_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer := 0;
  v_payout_id bigint;
  v_phone text := nullif(trim(coalesce(p_payout_phone, '')), '');
  v_next timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_amount_xof is null or p_amount_xof < 500 then
    raise exception 'minimum_payout_500';
  end if;
  if v_phone is null or length(v_phone) < 8 then
    raise exception 'payout_phone_required';
  end if;

  perform public.ensure_artist_wallet(v_uid);

  select coalesce(sum(amount_xof), 0) into v_balance
  from public.artist_wallet_ledger
  where artist_id = v_uid;

  if v_balance < p_amount_xof then
    raise exception 'insufficient_balance';
  end if;

  v_next := date_trunc('month', now()) + interval '1 month';

  insert into public.artist_joko_payouts (
    artist_id, amount_xof, status, payout_phone, scheduled_for
  )
  values (v_uid, p_amount_xof, 'pending', v_phone, v_next)
  returning id into v_payout_id;

  perform public.credit_artist_wallet(
    v_uid,
    -p_amount_xof,
    'payout',
    v_payout_id::text,
    'JOKO payout request'
  );

  update public.artist_wallets
  set payout_phone = v_phone,
      next_payout_at = v_next,
      updated_at = now()
  where artist_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'payout_id', v_payout_id,
    'amount_xof', p_amount_xof,
    'scheduled_for', v_next,
    'balance_after', v_balance - p_amount_xof
  );
end;
$$;

revoke all on function public.request_joko_payout(integer, text) from public;
grant execute on function public.request_joko_payout(integer, text) to authenticated;

-- Credit wallet when play earning recorded (if earnings table exists)
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
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_track_id is null or p_play_id is null then
    raise exception 'track_and_play_required';
  end if;

  select t.artist_id into v_artist from public.tracks t where t.id = p_track_id;
  if v_artist is null then raise exception 'track_not_found'; end if;
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

  if to_regclass('public.artist_wallet_ledger') is not null then
    perform public.credit_artist_wallet(
      v_artist, v_amount, 'stream', v_id::text, 'Play credit earning'
    );
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

-- END 20260830_monetization_stack.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_joko_play_pack_payment.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260830_joko_play_pack_payment.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_artist_merch_store.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist merch store — items, purchases, sales counts
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.artist_merch_items (
  id bigserial primary key,
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text,
  price_xof integer not null check (price_xof >= 0),
  image_urls jsonb not null default '[]'::jsonb,
  category text not null default 'physical'
    check (category in ('clothing', 'digital', 'physical')),
  quantity_available integer check (quantity_available is null or quantity_available >= 0),
  sales_count integer not null default 0 check (sales_count >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artist_merch_items_artist_id_idx
  on public.artist_merch_items (artist_id);

create index if not exists artist_merch_items_active_idx
  on public.artist_merch_items (artist_id, active);

create table if not exists public.merch_purchases (
  id bigserial primary key,
  merch_item_id bigint not null references public.artist_merch_items (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  price_xof integer not null check (price_xof >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'failed')),
  payment_method text not null default 'joko',
  payment_phone text,
  joko_reference text,
  created_at timestamptz not null default now()
);

create index if not exists merch_purchases_item_id_idx
  on public.merch_purchases (merch_item_id);

create index if not exists merch_purchases_buyer_id_idx
  on public.merch_purchases (buyer_id);

alter table public.artist_merch_items enable row level security;
alter table public.merch_purchases enable row level security;

drop policy if exists "artist_merch_items_select_public" on public.artist_merch_items;
create policy "artist_merch_items_select_public"
  on public.artist_merch_items for select
  to anon, authenticated
  using (active = true);

drop policy if exists "artist_merch_items_select_own" on public.artist_merch_items;
create policy "artist_merch_items_select_own"
  on public.artist_merch_items for select
  to authenticated
  using (artist_id = auth.uid());

drop policy if exists "artist_merch_items_insert_own" on public.artist_merch_items;
create policy "artist_merch_items_insert_own"
  on public.artist_merch_items for insert
  to authenticated
  with check (artist_id = auth.uid());

drop policy if exists "artist_merch_items_update_own" on public.artist_merch_items;
create policy "artist_merch_items_update_own"
  on public.artist_merch_items for update
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "artist_merch_items_delete_own" on public.artist_merch_items;
create policy "artist_merch_items_delete_own"
  on public.artist_merch_items for delete
  to authenticated
  using (artist_id = auth.uid());

drop policy if exists "merch_purchases_select_buyer" on public.merch_purchases;
create policy "merch_purchases_select_buyer"
  on public.merch_purchases for select
  to authenticated
  using (buyer_id = auth.uid() or artist_id = auth.uid());

-- Start merch purchase (pending)
create or replace function public.purchase_merch_item(
  p_merch_id bigint,
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
  v_item public.artist_merch_items%rowtype;
  v_purchase_id bigint;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_item
  from public.artist_merch_items
  where id = p_merch_id
    and active = true
  for update;

  if not found then
    raise exception 'merch_not_found';
  end if;

  if v_item.artist_id = v_uid then
    raise exception 'cannot_buy_own_merch';
  end if;

  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  insert into public.merch_purchases (
    merch_item_id,
    buyer_id,
    artist_id,
    price_xof,
    status,
    payment_method,
    payment_phone
  )
  values (
    v_item.id,
    v_uid,
    v_item.artist_id,
    v_item.price_xof,
    'pending',
    v_method,
    v_phone
  )
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'purchase_id', v_purchase_id,
    'merch_id', v_item.id,
    'title', v_item.title,
    'price_xof', v_item.price_xof,
    'payment_method', v_method,
    'payment_phone', v_phone
  );
end;
$$;

revoke all on function public.purchase_merch_item(bigint, text, text) from public;
grant execute on function public.purchase_merch_item(bigint, text, text) to authenticated;

create or replace function public.set_merch_joko_reference(
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

  update public.merch_purchases
  set joko_reference = nullif(trim(p_reference), '')
  where id = p_purchase_id
    and buyer_id = v_uid;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  return jsonb_build_object('ok', true, 'purchase_id', p_purchase_id);
end;
$$;

revoke all on function public.set_merch_joko_reference(bigint, text) from public;
grant execute on function public.set_merch_joko_reference(bigint, text) to authenticated;

create or replace function public.confirm_merch_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.merch_purchases%rowtype;
  v_item public.artist_merch_items%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
  from public.merch_purchases
  where id = p_purchase_id
    and buyer_id = v_uid
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    select * into v_item from public.artist_merch_items where id = v_row.merch_item_id;
    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'purchase_id', v_row.id,
      'merch_id', v_row.merch_item_id,
      'title', v_item.title,
      'skipped', 'already_confirmed'
    );
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  select * into v_item
  from public.artist_merch_items
  where id = v_row.merch_item_id
  for update;

  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  update public.merch_purchases
  set status = 'confirmed'
  where id = v_row.id;

  update public.artist_merch_items
  set
    sales_count = sales_count + 1,
    quantity_available = case
      when quantity_available is null then null
      else greatest(quantity_available - 1, 0)
    end,
    updated_at = now()
  where id = v_item.id;

  return jsonb_build_object(
    'ok', true,
    'status', 'confirmed',
    'purchase_id', v_row.id,
    'merch_id', v_row.merch_item_id,
    'title', v_item.title,
    'price_xof', v_row.price_xof
  );
end;
$$;

revoke all on function public.confirm_merch_purchase(bigint) from public;
grant execute on function public.confirm_merch_purchase(bigint) to authenticated;

create or replace function public.confirm_merch_purchase_system(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.merch_purchases%rowtype;
  v_item public.artist_merch_items%rowtype;
begin
  select * into v_row
  from public.merch_purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    select * into v_item from public.artist_merch_items where id = v_row.merch_item_id;
    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'purchase_id', v_row.id,
      'skipped', 'already_confirmed'
    );
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  select * into v_item
  from public.artist_merch_items
  where id = v_row.merch_item_id
  for update;

  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  update public.merch_purchases set status = 'confirmed' where id = v_row.id;

  update public.artist_merch_items
  set
    sales_count = sales_count + 1,
    quantity_available = case
      when quantity_available is null then null
      else greatest(quantity_available - 1, 0)
    end,
    updated_at = now()
  where id = v_item.id;

  return jsonb_build_object(
    'ok', true,
    'status', 'confirmed',
    'purchase_id', v_row.id,
    'merch_id', v_row.merch_item_id,
    'title', v_item.title
  );
end;
$$;

revoke all on function public.confirm_merch_purchase_system(bigint) from public;
grant execute on function public.confirm_merch_purchase_system(bigint) to service_role;

notify pgrst, 'reload schema';

-- END 20260830_artist_merch_store.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_merch_wallet_credit.sql
-- ═══════════════════════════════════════════════════════════
-- Merch purchase confirm → credit artist wallet (JOKO earnings)

create or replace function public.confirm_merch_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.merch_purchases%rowtype;
  v_item public.artist_merch_items%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
  from public.merch_purchases
  where id = p_purchase_id
    and buyer_id = v_uid
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    select * into v_item from public.artist_merch_items where id = v_row.merch_item_id;
    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'purchase_id', v_row.id,
      'merch_id', v_row.merch_item_id,
      'title', v_item.title,
      'skipped', 'already_confirmed'
    );
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  select * into v_item
  from public.artist_merch_items
  where id = v_row.merch_item_id
  for update;

  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  update public.merch_purchases
  set status = 'confirmed'
  where id = v_row.id;

  update public.artist_merch_items
  set
    sales_count = sales_count + 1,
    quantity_available = case
      when quantity_available is null then null
      else greatest(quantity_available - 1, 0)
    end,
    updated_at = now()
  where id = v_item.id;

  if to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null then
    perform public.credit_artist_wallet(
      v_row.artist_id,
      v_row.price_xof,
      'merch',
      v_row.id::text,
      coalesce(v_item.title, 'Merch sale')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'confirmed',
    'purchase_id', v_row.id,
    'merch_id', v_row.merch_item_id,
    'title', v_item.title,
    'price_xof', v_row.price_xof
  );
end;
$$;

create or replace function public.confirm_merch_purchase_system(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.merch_purchases%rowtype;
  v_item public.artist_merch_items%rowtype;
begin
  select * into v_row
  from public.merch_purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_row.status = 'confirmed' then
    select * into v_item from public.artist_merch_items where id = v_row.merch_item_id;
    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'purchase_id', v_row.id,
      'skipped', 'already_confirmed'
    );
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  select * into v_item
  from public.artist_merch_items
  where id = v_row.merch_item_id
  for update;

  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  update public.merch_purchases set status = 'confirmed' where id = v_row.id;

  update public.artist_merch_items
  set
    sales_count = sales_count + 1,
    quantity_available = case
      when quantity_available is null then null
      else greatest(quantity_available - 1, 0)
    end,
    updated_at = now()
  where id = v_item.id;

  if to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null then
    perform public.credit_artist_wallet(
      v_row.artist_id,
      v_row.price_xof,
      'merch',
      v_row.id::text,
      coalesce(v_item.title, 'Merch sale')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'confirmed',
    'purchase_id', v_row.id,
    'merch_id', v_row.merch_item_id,
    'title', v_item.title,
    'price_xof', v_row.price_xof
  );
end;
$$;

revoke all on function public.confirm_merch_purchase(bigint) from public;
grant execute on function public.confirm_merch_purchase(bigint) to authenticated;

revoke all on function public.confirm_merch_purchase_system(bigint) from public;
grant execute on function public.confirm_merch_purchase_system(bigint) to service_role;

notify pgrst, 'reload schema';

-- END 20260830_merch_wallet_credit.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_rect_score_music_purchases.sql
-- ═══════════════════════════════════════════════════════════
-- RECT SCORE — music purchase signals (album, CD, vinyl) on merch items
-- Song downloads use track_download_purchases (monetization_stack migration).

alter table public.artist_merch_items
  add column if not exists music_format text
  check (music_format is null or music_format in ('album', 'cd', 'vinyl'));

alter table public.artist_merch_items
  add column if not exists track_id uuid references public.tracks (id) on delete set null;

create index if not exists artist_merch_items_track_id_idx
  on public.artist_merch_items (track_id)
  where track_id is not null;

create index if not exists artist_merch_items_music_format_idx
  on public.artist_merch_items (music_format)
  where music_format is not null;

-- END 20260830_rect_score_music_purchases.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_tour_demand_fekk.sql
-- ═══════════════════════════════════════════════════════════
-- Tour demand (fan city requests) + FEKK-linked events / tickets
-- Paste in Supabase SQL Editor → Run

-- ── Fan: request artist to a city ─────────────────────────────
create table if not exists public.artist_city_requests (
  id bigserial primary key,
  artist_id uuid not null references auth.users (id) on delete cascade,
  fan_id uuid not null references auth.users (id) on delete cascade,
  city text not null check (char_length(trim(city)) > 0),
  place text,
  note text,
  created_at timestamptz not null default now(),
  unique (artist_id, fan_id, city)
);

create index if not exists artist_city_requests_artist_idx
  on public.artist_city_requests (artist_id, created_at desc);

create index if not exists artist_city_requests_city_idx
  on public.artist_city_requests (artist_id, city);

alter table public.artist_city_requests enable row level security;

drop policy if exists "artist_city_requests_select_parties" on public.artist_city_requests;
create policy "artist_city_requests_select_parties"
  on public.artist_city_requests for select
  to authenticated
  using (artist_id = auth.uid() or fan_id = auth.uid());

drop policy if exists "artist_city_requests_insert_fan" on public.artist_city_requests;
create policy "artist_city_requests_insert_fan"
  on public.artist_city_requests for insert
  to authenticated
  with check (fan_id = auth.uid() and artist_id <> auth.uid());

drop policy if exists "artist_city_requests_delete_own" on public.artist_city_requests;
create policy "artist_city_requests_delete_own"
  on public.artist_city_requests for delete
  to authenticated
  using (fan_id = auth.uid() or artist_id = auth.uid());

-- ── Artist tour / event shows (FEKK-linked) ───────────────────
create table if not exists public.artist_tour_events (
  id bigserial primary key,
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text,
  city text not null check (char_length(trim(city)) > 0),
  venue text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  ticket_price_xof integer check (ticket_price_xof is null or ticket_price_xof >= 0),
  capacity integer check (capacity is null or capacity >= 0),
  tickets_sold integer not null default 0 check (tickets_sold >= 0),
  fekk_event_id text,
  fekk_checkout_url text,
  cover_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artist_tour_events_artist_idx
  on public.artist_tour_events (artist_id, starts_at);

create index if not exists artist_tour_events_active_idx
  on public.artist_tour_events (artist_id, active, starts_at);

alter table public.artist_tour_events enable row level security;

drop policy if exists "artist_tour_events_select_public" on public.artist_tour_events;
create policy "artist_tour_events_select_public"
  on public.artist_tour_events for select
  to anon, authenticated
  using (active = true or artist_id = auth.uid());

drop policy if exists "artist_tour_events_insert_own" on public.artist_tour_events;
create policy "artist_tour_events_insert_own"
  on public.artist_tour_events for insert
  to authenticated
  with check (artist_id = auth.uid());

drop policy if exists "artist_tour_events_update_own" on public.artist_tour_events;
create policy "artist_tour_events_update_own"
  on public.artist_tour_events for update
  to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "artist_tour_events_delete_own" on public.artist_tour_events;
create policy "artist_tour_events_delete_own"
  on public.artist_tour_events for delete
  to authenticated
  using (artist_id = auth.uid());

-- ── Ticket purchases (FEKK checkout + confirm) ────────────────
create table if not exists public.tour_ticket_purchases (
  id bigserial primary key,
  event_id bigint not null references public.artist_tour_events (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0 and quantity <= 20),
  price_xof integer not null check (price_xof >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'failed', 'cancelled')),
  fekk_reference text,
  fekk_ticket_id text,
  payment_method text not null default 'fekk',
  payment_phone text,
  created_at timestamptz not null default now()
);

create index if not exists tour_ticket_purchases_event_idx
  on public.tour_ticket_purchases (event_id);

create index if not exists tour_ticket_purchases_artist_idx
  on public.tour_ticket_purchases (artist_id, created_at desc);

create index if not exists tour_ticket_purchases_buyer_idx
  on public.tour_ticket_purchases (buyer_id);

alter table public.tour_ticket_purchases enable row level security;

drop policy if exists "tour_ticket_purchases_select_parties" on public.tour_ticket_purchases;
create policy "tour_ticket_purchases_select_parties"
  on public.tour_ticket_purchases for select
  to authenticated
  using (buyer_id = auth.uid() or artist_id = auth.uid());

-- Wallet ledger: allow ticket kind (safe when table exists)
do $$
begin
  if to_regclass('public.artist_wallet_ledger') is not null then
    alter table public.artist_wallet_ledger drop constraint if exists artist_wallet_ledger_kind_check;
    alter table public.artist_wallet_ledger
      add constraint artist_wallet_ledger_kind_check
      check (kind in (
        'stream', 'download', 'merch', 'fan_club', 'tip', 'payout', 'adjustment', 'ticket'
      ));
  end if;
end $$;

-- ── RPCs ──────────────────────────────────────────────────────
create or replace function public.request_artist_city(
  p_artist_id uuid,
  p_city text,
  p_place text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_city text := trim(p_city);
  v_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_artist_id is null or p_artist_id = v_uid then
    raise exception 'invalid_artist';
  end if;
  if v_city is null or char_length(v_city) < 2 then
    raise exception 'city_required';
  end if;

  insert into public.artist_city_requests (
    artist_id, fan_id, city, place, note
  )
  values (
    p_artist_id,
    v_uid,
    v_city,
    nullif(trim(coalesce(p_place, '')), ''),
    nullif(trim(coalesce(p_note, '')), '')
  )
  on conflict (artist_id, fan_id, city) do update
    set place = excluded.place,
        note = excluded.note
  returning id into v_id;

  return jsonb_build_object('ok', true, 'request_id', v_id, 'city', v_city);
end;
$$;

revoke all on function public.request_artist_city(uuid, text, text, text) from public;
grant execute on function public.request_artist_city(uuid, text, text, text) to authenticated;

create or replace function public.purchase_tour_ticket(
  p_event_id bigint,
  p_quantity integer default 1,
  p_payment_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.artist_tour_events%rowtype;
  v_qty integer := greatest(1, least(coalesce(p_quantity, 1), 20));
  v_price integer;
  v_purchase_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_event
  from public.artist_tour_events
  where id = p_event_id
  for update;

  if not found or v_event.active = false then
    raise exception 'event_not_found';
  end if;

  if v_event.artist_id = v_uid then
    raise exception 'own_event';
  end if;

  if v_event.starts_at < now() - interval '6 hours' then
    raise exception 'event_passed';
  end if;

  if v_event.capacity is not null
     and v_event.tickets_sold + v_qty > v_event.capacity then
    raise exception 'sold_out';
  end if;

  v_price := coalesce(v_event.ticket_price_xof, 0) * v_qty;
  if v_price <= 0 then
    raise exception 'tickets_not_for_sale';
  end if;

  insert into public.tour_ticket_purchases (
    event_id, artist_id, buyer_id, quantity, price_xof, status, payment_phone
  )
  values (
    v_event.id, v_event.artist_id, v_uid, v_qty, v_price, 'pending',
    nullif(trim(coalesce(p_payment_phone, '')), '')
  )
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase_id,
    'event_id', v_event.id,
    'title', v_event.title,
    'city', v_event.city,
    'quantity', v_qty,
    'price_xof', v_price,
    'fekk_event_id', v_event.fekk_event_id,
    'fekk_checkout_url', v_event.fekk_checkout_url
  );
end;
$$;

revoke all on function public.purchase_tour_ticket(bigint, integer, text) from public;
grant execute on function public.purchase_tour_ticket(bigint, integer, text) to authenticated;

create or replace function public.set_tour_ticket_fekk_reference(
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
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.tour_ticket_purchases
  set fekk_reference = nullif(trim(p_reference), '')
  where id = p_purchase_id and buyer_id = v_uid;

  if not found then raise exception 'purchase_not_found'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_tour_ticket_fekk_reference(bigint, text) from public;
grant execute on function public.set_tour_ticket_fekk_reference(bigint, text) to authenticated;

create or replace function public.confirm_tour_ticket_system(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tour_ticket_purchases%rowtype;
  v_event public.artist_tour_events%rowtype;
begin
  select * into v_row
  from public.tour_ticket_purchases
  where id = p_purchase_id
  for update;

  if not found then raise exception 'purchase_not_found'; end if;

  if v_row.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'skipped', 'already_confirmed');
  end if;

  if v_row.status <> 'pending' then
    raise exception 'purchase_not_pending';
  end if;

  select * into v_event
  from public.artist_tour_events
  where id = v_row.event_id
  for update;

  if v_event.capacity is not null
     and v_event.tickets_sold + v_row.quantity > v_event.capacity then
    raise exception 'sold_out';
  end if;

  update public.tour_ticket_purchases
  set status = 'confirmed'
  where id = v_row.id;

  update public.artist_tour_events
  set
    tickets_sold = tickets_sold + v_row.quantity,
    updated_at = now()
  where id = v_event.id;

  if to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null then
    perform public.credit_artist_wallet(
      v_row.artist_id,
      v_row.price_xof,
      'ticket',
      v_row.id::text,
      coalesce(v_event.title, 'Tour ticket')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_row.id,
    'event_id', v_row.event_id,
    'price_xof', v_row.price_xof
  );
end;
$$;

revoke all on function public.confirm_tour_ticket_system(bigint) from public;
grant execute on function public.confirm_tour_ticket_system(bigint) to service_role;

notify pgrst, 'reload schema';

-- END 20260830_tour_demand_fekk.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_hardening_monetization.sql
-- ═══════════════════════════════════════════════════════════
-- Hardening patch: fan-club rejoin, ticket ledger kind, wallet ownership, play earning clamp
-- Apply AFTER monetization_stack / merch / tour migrations.

-- Ticket kind on wallet ledger (safe if already present)
do $$
begin
  if to_regclass('public.artist_wallet_ledger') is not null then
    alter table public.artist_wallet_ledger drop constraint if exists artist_wallet_ledger_kind_check;
    alter table public.artist_wallet_ledger
      add constraint artist_wallet_ledger_kind_check
      check (kind in (
        'stream', 'download', 'merch', 'fan_club', 'tip', 'payout', 'adjustment', 'ticket'
      ));
  end if;
end $$;

-- Fan club subscribe: do not demote active members to pending
create or replace function public.subscribe_fan_club_tier(
  p_tier_id bigint,
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
  v_tier public.fan_club_tiers%rowtype;
  v_existing public.fan_club_members%rowtype;
  v_member_id bigint;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_tier from public.fan_club_tiers
  where id = p_tier_id and active = true;

  if not found then raise exception 'tier_not_found'; end if;
  if v_tier.artist_id = v_uid then raise exception 'own_tier'; end if;

  select * into v_existing
  from public.fan_club_members
  where fan_id = v_uid and tier_id = v_tier.id;

  if found and v_existing.status = 'active'
     and (v_existing.expires_at is null or v_existing.expires_at > now()) then
    return jsonb_build_object(
      'ok', true,
      'member_id', v_existing.id,
      'tier_id', v_tier.id,
      'artist_id', v_tier.artist_id,
      'price_xof', v_existing.price_xof,
      'tier_name', v_tier.name,
      'status', 'active',
      'skipped', 'already_active'
    );
  end if;

  insert into public.fan_club_members (
    tier_id, artist_id, fan_id, price_xof, status, payment_method, payment_phone
  )
  values (
    v_tier.id, v_tier.artist_id, v_uid, v_tier.price_xof_month, 'pending', v_method, v_phone
  )
  on conflict (fan_id, tier_id) do update
    set status = 'pending',
        payment_method = excluded.payment_method,
        payment_phone = excluded.payment_phone,
        price_xof = excluded.price_xof
  returning id into v_member_id;

  return jsonb_build_object(
    'ok', true,
    'member_id', v_member_id,
    'tier_id', v_tier.id,
    'artist_id', v_tier.artist_id,
    'price_xof', v_tier.price_xof_month,
    'tier_name', v_tier.name,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.subscribe_fan_club_tier(bigint, text, text) from public;
grant execute on function public.subscribe_fan_club_tier(bigint, text, text) to authenticated;

-- ensure_artist_wallet: authenticated callers may only ensure *their* wallet.
-- Internal credit_artist_wallet creates rows directly (does not rely on this for others).
create or replace function public.ensure_artist_wallet(p_artist_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid := coalesce(p_artist_id, v_uid);
  v_next timestamptz := date_trunc('week', now() + interval '7 days') + interval '1 day';
begin
  if v_artist is null then
    raise exception 'not_authenticated';
  end if;

  -- JWT sessions: only own wallet. Service role / null jwt may ensure any artist
  -- (used by payout tooling). Wallet credits for buyers go through credit_artist_wallet.
  if v_uid is not null and v_uid <> v_artist then
    raise exception 'forbidden';
  end if;

  insert into public.artist_wallets (artist_id, next_payout_at)
  values (v_artist, v_next)
  on conflict (artist_id) do nothing;

  return jsonb_build_object('ok', true, 'artist_id', v_artist);
end;
$$;

revoke all on function public.ensure_artist_wallet(uuid) from public;
grant execute on function public.ensure_artist_wallet(uuid) to authenticated;
grant execute on function public.ensure_artist_wallet(uuid) to service_role;

-- credit_artist_wallet must create the wallet row itself so buyer-side confirm
-- RPCs (auth.uid = fan) can credit the artist without hitting ensure forbidden.
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
  v_next timestamptz := date_trunc('week', now() + interval '7 days') + interval '1 day';
begin
  if p_artist_id is null or p_amount_xof is null or p_amount_xof = 0 then
    return null;
  end if;

  insert into public.artist_wallets (artist_id, next_payout_at)
  values (p_artist_id, v_next)
  on conflict (artist_id) do nothing;

  insert into public.artist_wallet_ledger (
    artist_id, kind, amount_xof, reference_id, description
  )
  values (
    p_artist_id,
    coalesce(nullif(trim(p_kind), ''), 'adjustment'),
    p_amount_xof,
    nullif(trim(p_reference_id), ''),
    nullif(trim(p_description), '')
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

-- City demand aggregate for artists (security definer; fans can't see others' votes)
create or replace function public.artist_city_demand(p_artist_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist uuid := coalesce(p_artist_id, auth.uid());
  v_rows jsonb;
begin
  if v_artist is null then raise exception 'not_authenticated'; end if;
  if auth.uid() is not null and auth.uid() <> v_artist then
    raise exception 'forbidden';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.request_count desc), '[]'::jsonb)
  into v_rows
  from (
    select
      city,
      max(place) filter (where place is not null) as place,
      count(*)::int as request_count,
      count(distinct fan_id)::int as unique_fans
    from public.artist_city_requests
    where artist_id = v_artist
    group by city
  ) t;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$$;

revoke all on function public.artist_city_demand(uuid) from public;
grant execute on function public.artist_city_demand(uuid) to authenticated;

-- Merch confirm always credits wallet (idempotent with merch_wallet_credit.sql)
create or replace function public.confirm_merch_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.merch_purchases%rowtype;
  v_item public.artist_merch_items%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_row
  from public.merch_purchases
  where id = p_purchase_id and buyer_id = v_uid
  for update;

  if not found then raise exception 'purchase_not_found'; end if;

  if v_row.status = 'confirmed' then
    select * into v_item from public.artist_merch_items where id = v_row.merch_item_id;
    return jsonb_build_object(
      'ok', true, 'status', 'confirmed', 'purchase_id', v_row.id,
      'merch_id', v_row.merch_item_id, 'title', v_item.title,
      'skipped', 'already_confirmed'
    );
  end if;

  if v_row.status <> 'pending' then raise exception 'purchase_not_pending'; end if;

  select * into v_item from public.artist_merch_items where id = v_row.merch_item_id for update;
  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  update public.merch_purchases set status = 'confirmed' where id = v_row.id;
  update public.artist_merch_items
  set sales_count = sales_count + 1,
      quantity_available = case
        when quantity_available is null then null
        else greatest(quantity_available - 1, 0)
      end,
      updated_at = now()
  where id = v_item.id;

  if to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null then
    perform public.credit_artist_wallet(
      v_row.artist_id, v_row.price_xof, 'merch', v_row.id::text,
      coalesce(v_item.title, 'Merch sale')
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'status', 'confirmed', 'purchase_id', v_row.id,
    'merch_id', v_row.merch_item_id, 'title', v_item.title, 'price_xof', v_row.price_xof
  );
end;
$$;

create or replace function public.confirm_merch_purchase_system(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.merch_purchases%rowtype;
  v_item public.artist_merch_items%rowtype;
begin
  select * into v_row from public.merch_purchases where id = p_purchase_id for update;
  if not found then raise exception 'purchase_not_found'; end if;

  if v_row.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'status', 'confirmed', 'purchase_id', v_row.id, 'skipped', 'already_confirmed');
  end if;
  if v_row.status <> 'pending' then raise exception 'purchase_not_pending'; end if;

  select * into v_item from public.artist_merch_items where id = v_row.merch_item_id for update;
  if v_item.quantity_available is not null and v_item.quantity_available <= 0 then
    raise exception 'merch_sold_out';
  end if;

  update public.merch_purchases set status = 'confirmed' where id = v_row.id;
  update public.artist_merch_items
  set sales_count = sales_count + 1,
      quantity_available = case
        when quantity_available is null then null
        else greatest(quantity_available - 1, 0)
      end,
      updated_at = now()
  where id = v_item.id;

  if to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null then
    perform public.credit_artist_wallet(
      v_row.artist_id, v_row.price_xof, 'merch', v_row.id::text,
      coalesce(v_item.title, 'Merch sale')
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'status', 'confirmed', 'purchase_id', v_row.id,
    'merch_id', v_row.merch_item_id, 'title', v_item.title, 'price_xof', v_row.price_xof
  );
end;
$$;

revoke all on function public.confirm_merch_purchase(bigint) from public;
grant execute on function public.confirm_merch_purchase(bigint) to authenticated;
revoke all on function public.confirm_merch_purchase_system(bigint) from public;
grant execute on function public.confirm_merch_purchase_system(bigint) to service_role;

-- record_play_earning: verify play ownership, clamp amount (no client-chosen windfall)
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
  v_play_listener uuid;
  v_play_track uuid;
  v_amount integer := least(greatest(coalesce(p_amount_xof, 10), 1), 25);
  v_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_track_id is null or p_play_id is null then
    raise exception 'track_and_play_required';
  end if;

  select p.listener_id, p.track_id
  into v_play_listener, v_play_track
  from public.plays p
  where p.id::text = p_play_id::text;

  if not found then raise exception 'play_not_found'; end if;
  if v_play_listener is distinct from v_uid then raise exception 'play_not_owned'; end if;
  if v_play_track::text is distinct from p_track_id::text then
    raise exception 'play_track_mismatch';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = p_track_id::text;
  if v_artist is null then raise exception 'track_not_found'; end if;
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

  if to_regclass('public.artist_wallet_ledger') is not null then
    perform public.credit_artist_wallet(
      v_artist, v_amount, 'stream', v_id::text, 'Play credit earning'
    );
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

-- Wallet totals for studio (full ledger, not truncated)
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
    coalesce(sum(amount_xof), 0),
    coalesce(sum(case when kind = 'stream' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'download' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'merch' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'fan_club' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'tip' and amount_xof > 0 then amount_xof else 0 end), 0),
    coalesce(sum(case when kind = 'ticket' and amount_xof > 0 then amount_xof else 0 end), 0)
  into v_balance, v_streams, v_downloads, v_merch, v_fan_club, v_tips, v_tickets
  from public.artist_wallet_ledger
  where artist_id = v_artist;

  return jsonb_build_object(
    'ok', true,
    'balance_xof', v_balance,
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

-- Merch: hold inventory against pending purchases
create or replace function public.purchase_merch_item(
  p_merch_id bigint,
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
  v_item public.artist_merch_items%rowtype;
  v_purchase_id bigint;
  v_pending integer := 0;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_item
  from public.artist_merch_items
  where id = p_merch_id and active = true
  for update;

  if not found then raise exception 'merch_not_found'; end if;
  if v_item.artist_id = v_uid then raise exception 'cannot_buy_own_merch'; end if;

  if v_item.quantity_available is not null then
    select count(*)::int into v_pending
    from public.merch_purchases
    where merch_item_id = v_item.id and status = 'pending';
    if v_item.quantity_available - v_pending <= 0 then
      raise exception 'merch_sold_out';
    end if;
  end if;

  insert into public.merch_purchases (
    merch_item_id, buyer_id, artist_id, price_xof, status, payment_method, payment_phone
  )
  values (v_item.id, v_uid, v_item.artist_id, v_item.price_xof, 'pending', v_method, v_phone)
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true, 'status', 'pending', 'purchase_id', v_purchase_id,
    'merch_id', v_item.id, 'title', v_item.title, 'price_xof', v_item.price_xof,
    'payment_method', v_method, 'payment_phone', v_phone
  );
end;
$$;

revoke all on function public.purchase_merch_item(bigint, text, text) from public;
grant execute on function public.purchase_merch_item(bigint, text, text) to authenticated;

create or replace function public.cancel_merch_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.merch_purchases%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.merch_purchases
  where id = p_purchase_id and buyer_id = v_uid for update;
  if not found then raise exception 'purchase_not_found'; end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'not_pending');
  end if;
  update public.merch_purchases set status = 'cancelled' where id = v_row.id;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_merch_purchase(bigint) from public;
grant execute on function public.cancel_merch_purchase(bigint) to authenticated;

-- Tickets: count pending holds toward capacity
create or replace function public.purchase_tour_ticket(
  p_event_id bigint,
  p_quantity integer default 1,
  p_payment_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.artist_tour_events%rowtype;
  v_qty integer := greatest(1, least(coalesce(p_quantity, 1), 20));
  v_price integer;
  v_purchase_id bigint;
  v_pending_qty integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_event
  from public.artist_tour_events
  where id = p_event_id
  for update;

  if not found or v_event.active = false then raise exception 'event_not_found'; end if;
  if v_event.artist_id = v_uid then raise exception 'own_event'; end if;
  if v_event.starts_at < now() - interval '6 hours' then raise exception 'event_passed'; end if;

  select coalesce(sum(quantity), 0)::int into v_pending_qty
  from public.tour_ticket_purchases
  where event_id = v_event.id and status = 'pending';

  if v_event.capacity is not null
     and v_event.tickets_sold + v_pending_qty + v_qty > v_event.capacity then
    raise exception 'sold_out';
  end if;

  v_price := coalesce(v_event.ticket_price_xof, 0) * v_qty;
  if v_price <= 0 then raise exception 'tickets_not_for_sale'; end if;

  insert into public.tour_ticket_purchases (
    event_id, artist_id, buyer_id, quantity, price_xof, status, payment_phone
  )
  values (
    v_event.id, v_event.artist_id, v_uid, v_qty, v_price, 'pending',
    nullif(trim(coalesce(p_payment_phone, '')), '')
  )
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true, 'purchase_id', v_purchase_id, 'event_id', v_event.id,
    'title', v_event.title, 'city', v_event.city, 'quantity', v_qty,
    'price_xof', v_price, 'fekk_event_id', v_event.fekk_event_id,
    'fekk_checkout_url', v_event.fekk_checkout_url
  );
end;
$$;

revoke all on function public.purchase_tour_ticket(bigint, integer, text) from public;
grant execute on function public.purchase_tour_ticket(bigint, integer, text) to authenticated;

create or replace function public.cancel_tour_ticket_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.tour_ticket_purchases%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.tour_ticket_purchases
  where id = p_purchase_id and buyer_id = v_uid for update;
  if not found then raise exception 'purchase_not_found'; end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'not_pending');
  end if;
  update public.tour_ticket_purchases set status = 'cancelled' where id = v_row.id;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_tour_ticket_purchase(bigint) from public;
grant execute on function public.cancel_tour_ticket_purchase(bigint) to authenticated;

-- Downloads: reuse pending purchase; cancel helper
create or replace function public.purchase_track_download(
  p_track_id uuid,
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
  v_track public.tracks%rowtype;
  v_price integer;
  v_purchase_id bigint;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'joko');
  v_phone text := nullif(trim(coalesce(p_payment_phone, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_track from public.tracks where id = p_track_id;
  if not found then raise exception 'track_not_found'; end if;
  if v_track.artist_id = v_uid then raise exception 'own_track'; end if;

  v_price := coalesce(v_track.download_price_xof, 0);
  if v_price <= 0 then raise exception 'download_not_for_sale'; end if;

  if exists (
    select 1 from public.track_download_purchases
    where track_id = p_track_id and buyer_id = v_uid and status = 'confirmed'
  ) then
    raise exception 'already_purchased';
  end if;

  select id into v_purchase_id
  from public.track_download_purchases
  where track_id = p_track_id and buyer_id = v_uid and status = 'pending'
  order by created_at desc
  limit 1;

  if found then
    update public.track_download_purchases
    set payment_method = v_method, payment_phone = v_phone, price_xof = v_price
    where id = v_purchase_id;
    return jsonb_build_object(
      'ok', true, 'status', 'pending', 'purchase_id', v_purchase_id,
      'track_id', p_track_id, 'price_xof', v_price, 'reused', true
    );
  end if;

  insert into public.track_download_purchases (
    track_id, buyer_id, artist_id, price_xof, status, payment_method, payment_phone
  )
  values (p_track_id, v_uid, v_track.artist_id, v_price, 'pending', v_method, v_phone)
  returning id into v_purchase_id;

  return jsonb_build_object(
    'ok', true, 'status', 'pending', 'purchase_id', v_purchase_id,
    'track_id', p_track_id, 'price_xof', v_price
  );
end;
$$;

revoke all on function public.purchase_track_download(uuid, text, text) from public;
grant execute on function public.purchase_track_download(uuid, text, text) to authenticated;

create or replace function public.cancel_track_download_purchase(p_purchase_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.track_download_purchases%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.track_download_purchases
  where id = p_purchase_id and buyer_id = v_uid for update;
  if not found then raise exception 'purchase_not_found'; end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'not_pending');
  end if;
  update public.track_download_purchases set status = 'cancelled' where id = v_row.id;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_track_download_purchase(bigint) from public;
grant execute on function public.cancel_track_download_purchase(bigint) to authenticated;

notify pgrst, 'reload schema';

-- Clients must not confirm unpaid purchases; only service_role / webhooks / demo admin.
revoke all on function public.confirm_merch_purchase(bigint) from public;
revoke all on function public.confirm_merch_purchase(bigint) from authenticated;
grant execute on function public.confirm_merch_purchase_system(bigint) to service_role;

do $$
begin
  if to_regprocedure('public.confirm_play_pack_purchase(bigint)') is not null then
    revoke all on function public.confirm_play_pack_purchase(bigint) from public;
    revoke all on function public.confirm_play_pack_purchase(bigint) from authenticated;
  end if;
end $$;

-- Fan club: cancel pending subscribe (restore slot / avoid orphan)
create or replace function public.cancel_fan_club_subscribe(p_member_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.fan_club_members%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.fan_club_members
  where id = p_member_id and fan_id = v_uid for update;
  if not found then raise exception 'member_not_found'; end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'not_pending');
  end if;
  update public.fan_club_members set status = 'cancelled' where id = v_row.id;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_fan_club_subscribe(bigint) from public;
grant execute on function public.cancel_fan_club_subscribe(bigint) to authenticated;

notify pgrst, 'reload schema';

-- END 20260830_hardening_monetization.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_track_lyrics.sql
-- ═══════════════════════════════════════════════════════════
-- Track lyrics (plain text / timed-line friendly). Safe to re-run.

alter table public.tracks
  add column if not exists lyrics text;

comment on column public.tracks.lyrics is
  'Song lyrics as plain text. Artist-owned; visible with the track to fans.';

notify pgrst, 'reload schema';

-- END 20260830_track_lyrics.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_play_pack_prices.sql
-- ═══════════════════════════════════════════════════════════
-- Correct SN play pack prices to product spec: 100 / 200 / 500 XOF.
-- Safe to re-run.

update public.play_packs
set
  name = 'Micro',
  description = 'Quick listens for the day',
  price_label = '100 XOF',
  price_xof = 100,
  play_credits = 50,
  play_count = 50,
  sort_order = 1,
  active = true,
  updated_at = now()
where country = 'SN' and code = 'micro';

update public.play_packs
set
  name = 'Standard',
  description = 'Your weekly sound diet',
  price_label = '200 XOF',
  price_xof = 200,
  play_credits = 120,
  play_count = 120,
  sort_order = 2,
  active = true,
  updated_at = now()
where country = 'SN' and code = 'standard';

update public.play_packs
set
  name = 'Mega',
  description = 'Deep catalog access',
  price_label = '500 XOF',
  price_xof = 500,
  play_credits = 350,
  play_count = 350,
  sort_order = 3,
  active = true,
  updated_at = now()
where country = 'SN' and code = 'mega';

-- Ensure rows exist even if seed never ran
insert into public.play_packs (
  country, code, name, description, price_label, price_xof,
  play_credits, play_count, sort_order, active, updated_at
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

notify pgrst, 'reload schema';

-- END 20260830_play_pack_prices.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_live_rooms.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Live Rooms (casual) — Phase 1 of RECT presence
-- Paste in Supabase SQL Editor → Run
--
-- RECT Live (pro performances) = later phase, separate table.
-- Live Room = everyday go-live in Artist World:
--   mode: video | photos | audio
-- ============================================================

create table if not exists public.live_rooms (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Live Room',
  status text not null default 'offline'
    check (status in ('offline', 'live', 'ended')),
  mode text not null default 'video'
    check (mode in ('video', 'photos', 'audio')),
  visibility text not null default 'public'
    check (visibility in ('public', 'fan_club', 'private')),
  -- world = Artist World (default). portal = song/art portal (later).
  host text not null default 'world'
    check (host in ('world', 'portal')),
  portal_release_id uuid,
  country text,
  city text,
  neighborhood text,
  viewer_count integer not null default 0 check (viewer_count >= 0),
  stage_photo_url text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_rooms_artist_status_idx
  on public.live_rooms (artist_id, status);

create index if not exists live_rooms_live_viewers_idx
  on public.live_rooms (status, viewer_count desc)
  where status = 'live';

create index if not exists live_rooms_live_geo_idx
  on public.live_rooms (country, city)
  where status = 'live';

-- One active live room per artist
create unique index if not exists live_rooms_one_live_per_artist
  on public.live_rooms (artist_id)
  where status = 'live';

create table if not exists public.live_room_viewers (
  live_room_id uuid not null references public.live_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (live_room_id, user_id)
);

create index if not exists live_room_viewers_active_idx
  on public.live_room_viewers (live_room_id)
  where left_at is null;

create table if not exists public.live_room_messages (
  id bigserial primary key,
  live_room_id uuid not null references public.live_rooms (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null
    check (char_length(trim(body)) > 0 and char_length(body) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists live_room_messages_room_created_idx
  on public.live_room_messages (live_room_id, created_at desc);

create table if not exists public.live_room_photos (
  id bigserial primary key,
  live_room_id uuid not null references public.live_rooms (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  photo_url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists live_room_photos_room_idx
  on public.live_room_photos (live_room_id, sort_order, created_at);

alter table public.live_rooms enable row level security;
alter table public.live_room_viewers enable row level security;
alter table public.live_room_messages enable row level security;
alter table public.live_room_photos enable row level security;

drop policy if exists "live_rooms_select_visible" on public.live_rooms;
create policy "live_rooms_select_visible"
  on public.live_rooms for select
  to authenticated, anon
  using (
    artist_id = auth.uid()
    or status = 'live'
    or status = 'ended'
  );

drop policy if exists "live_room_viewers_select_participant" on public.live_room_viewers;
create policy "live_room_viewers_select_participant"
  on public.live_room_viewers for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id and r.artist_id = auth.uid()
    )
  );

drop policy if exists "live_room_messages_select" on public.live_room_messages;
create policy "live_room_messages_select"
  on public.live_room_messages for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id
        and (r.status in ('live', 'ended') or r.artist_id = auth.uid())
    )
  );

drop policy if exists "live_room_photos_select" on public.live_room_photos;
create policy "live_room_photos_select"
  on public.live_room_photos for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id
        and (r.status in ('live', 'ended') or r.artist_id = auth.uid())
    )
  );

-- Allow live_room notification kind (drop strict list if present)
alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

create or replace function public.start_live_room(
  p_title text default 'Live Room',
  p_mode text default 'video',
  p_visibility text default 'public',
  p_country text default null,
  p_city text default null,
  p_neighborhood text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := left(trim(coalesce(nullif(trim(p_title), ''), 'Live Room')), 120);
  v_mode text := lower(trim(coalesce(p_mode, 'video')));
  v_vis text := lower(trim(coalesce(p_visibility, 'public')));
  v_id uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if v_mode not in ('video', 'photos', 'audio') then
    raise exception 'invalid_mode';
  end if;
  if v_vis not in ('public', 'fan_club', 'private') then
    raise exception 'invalid_visibility';
  end if;

  select id into v_existing
  from public.live_rooms
  where artist_id = v_uid and status = 'live'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'live_room_id', v_existing,
      'skipped', 'already_live'
    );
  end if;

  insert into public.live_rooms (
    artist_id, title, status, mode, visibility, host,
    country, city, neighborhood, started_at, updated_at
  )
  values (
    v_uid, v_title, 'live', v_mode, v_vis, 'world',
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_neighborhood, '')), ''),
    now(), now()
  )
  returning id into v_id;

  -- Notify followers (best-effort)
  begin
    insert into public.artist_notifications (recipient_id, actor_id, kind, body)
    select f.follower_id, v_uid, 'live_room', left(v_title, 200)
    from public.artist_follows f
    where f.artist_id = v_uid
      and f.follower_id <> v_uid
    limit 200;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'live_room_id', v_id,
    'title', v_title,
    'mode', v_mode,
    'visibility', v_vis,
    'status', 'live'
  );
end;
$$;

revoke all on function public.start_live_room(text, text, text, text, text, text) from public;
grant execute on function public.start_live_room(text, text, text, text, text, text) to authenticated;

create or replace function public.end_live_room(p_live_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_live_room_id is null then raise exception 'room_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.artist_id <> v_uid then raise exception 'not_owner'; end if;
  if v_row.status <> 'live' then
    return jsonb_build_object('ok', true, 'skipped', 'not_live', 'status', v_row.status);
  end if;

  update public.live_rooms
  set status = 'ended',
      ended_at = now(),
      updated_at = now(),
      viewer_count = 0
  where id = p_live_room_id;

  update public.live_room_viewers
  set left_at = coalesce(left_at, now())
  where live_room_id = p_live_room_id and left_at is null;

  return jsonb_build_object('ok', true, 'live_room_id', p_live_room_id, 'status', 'ended');
end;
$$;

revoke all on function public.end_live_room(uuid) from public;
grant execute on function public.end_live_room(uuid) to authenticated;

create or replace function public.join_live_room(p_live_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
  v_member boolean := false;
  v_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_live_room_id is null then raise exception 'room_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.status <> 'live' then raise exception 'not_live'; end if;

  if v_row.visibility = 'private' and v_row.artist_id <> v_uid then
    raise exception 'private_room';
  end if;

  if v_row.visibility = 'fan_club' and v_row.artist_id <> v_uid then
    if to_regclass('public.fan_club_members') is not null then
      select exists (
        select 1 from public.fan_club_members m
        where m.artist_id = v_row.artist_id
          and m.fan_id = v_uid
          and m.status = 'active'
          and (m.expires_at is null or m.expires_at > now())
      ) into v_member;
    end if;
    if not v_member then raise exception 'fan_club_required'; end if;
  end if;

  insert into public.live_room_viewers (live_room_id, user_id, joined_at, left_at)
  values (p_live_room_id, v_uid, now(), null)
  on conflict (live_room_id, user_id) do update
    set joined_at = now(), left_at = null;

  select count(*)::integer into v_count
  from public.live_room_viewers
  where live_room_id = p_live_room_id and left_at is null;

  update public.live_rooms
  set viewer_count = v_count, updated_at = now()
  where id = p_live_room_id;

  return jsonb_build_object(
    'ok', true,
    'live_room_id', p_live_room_id,
    'viewer_count', v_count,
    'mode', v_row.mode,
    'title', v_row.title,
    'artist_id', v_row.artist_id
  );
end;
$$;

revoke all on function public.join_live_room(uuid) from public;
grant execute on function public.join_live_room(uuid) to authenticated;

create or replace function public.leave_live_room(p_live_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.live_room_viewers
  set left_at = now()
  where live_room_id = p_live_room_id
    and user_id = v_uid
    and left_at is null;

  select count(*)::integer into v_count
  from public.live_room_viewers
  where live_room_id = p_live_room_id and left_at is null;

  update public.live_rooms
  set viewer_count = v_count, updated_at = now()
  where id = p_live_room_id and status = 'live';

  return jsonb_build_object('ok', true, 'viewer_count', v_count);
end;
$$;

revoke all on function public.leave_live_room(uuid) from public;
grant execute on function public.leave_live_room(uuid) to authenticated;

create or replace function public.send_live_room_message(
  p_live_room_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
  v_body text := left(trim(coalesce(p_body, '')), 500);
  v_id bigint;
  v_created timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(v_body) = 0 then raise exception 'body_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.status <> 'live' then raise exception 'not_live'; end if;

  if v_row.artist_id <> v_uid then
    if not exists (
      select 1 from public.live_room_viewers v
      where v.live_room_id = p_live_room_id
        and v.user_id = v_uid
        and v.left_at is null
    ) then
      raise exception 'not_in_room';
    end if;
  end if;

  insert into public.live_room_messages (live_room_id, sender_id, body)
  values (p_live_room_id, v_uid, v_body)
  returning id, created_at into v_id, v_created;

  return jsonb_build_object(
    'ok', true,
    'message_id', v_id,
    'body', v_body,
    'sender_id', v_uid,
    'created_at', v_created
  );
end;
$$;

revoke all on function public.send_live_room_message(uuid, text) from public;
grant execute on function public.send_live_room_message(uuid, text) to authenticated;

create or replace function public.push_live_room_photo(
  p_live_room_id uuid,
  p_photo_url text,
  p_caption text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
  v_url text := trim(coalesce(p_photo_url, ''));
  v_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(v_url) < 8 then raise exception 'photo_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.artist_id <> v_uid then raise exception 'not_owner'; end if;
  if v_row.status <> 'live' then raise exception 'not_live'; end if;

  insert into public.live_room_photos (
    live_room_id, artist_id, photo_url, caption, sort_order
  )
  values (
    p_live_room_id, v_uid, left(v_url, 2000),
    nullif(left(trim(coalesce(p_caption, '')), 200), ''),
    (select coalesce(max(sort_order), 0) + 1 from public.live_room_photos where live_room_id = p_live_room_id)
  )
  returning id into v_id;

  update public.live_rooms
  set stage_photo_url = left(v_url, 2000), updated_at = now()
  where id = p_live_room_id;

  return jsonb_build_object('ok', true, 'photo_id', v_id, 'photo_url', v_url);
end;
$$;

revoke all on function public.push_live_room_photo(uuid, text, text) from public;
grant execute on function public.push_live_room_photo(uuid, text, text) to authenticated;

-- Realtime for chat / photos / status
do $$
begin
  begin
    alter publication supabase_realtime add table public.live_rooms;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.live_room_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.live_room_photos;
  exception when duplicate_object then null;
  end;
end $$;

notify pgrst, 'reload schema';

-- END 20260830_live_rooms.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_live_rooms_hardening.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Live Rooms hardening — visibility, notifs, kind check
-- Apply AFTER 20260830_live_rooms.sql
-- ============================================================

-- Deep-link for Hearing Aid / inbox
alter table public.artist_notifications
  add column if not exists live_room_id uuid;

create index if not exists artist_notifications_live_room_idx
  on public.artist_notifications (live_room_id)
  where live_room_id is not null;

-- Restore kind check including live_room (best-effort; widen list)
alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

-- Tighter SELECT: don't leak private / fan_club content to everyone
drop policy if exists "live_rooms_select_visible" on public.live_rooms;
create policy "live_rooms_select_visible"
  on public.live_rooms for select
  to authenticated, anon
  using (
    artist_id = auth.uid()
    or (
      status in ('live', 'ended')
      and visibility = 'public'
    )
    or (
      status in ('live', 'ended')
      and visibility = 'fan_club'
      and auth.uid() is not null
      and (
        artist_id = auth.uid()
        or exists (
          select 1 from public.fan_club_members m
          where m.artist_id = live_rooms.artist_id
            and m.fan_id = auth.uid()
            and m.status = 'active'
            and (m.expires_at is null or m.expires_at > now())
        )
      )
    )
  );

drop policy if exists "live_room_messages_select" on public.live_room_messages;
create policy "live_room_messages_select"
  on public.live_room_messages for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id
        and (
          r.artist_id = auth.uid()
          or (
            r.status in ('live', 'ended')
            and r.visibility = 'public'
          )
          or (
            r.status in ('live', 'ended')
            and r.visibility = 'fan_club'
            and auth.uid() is not null
            and exists (
              select 1 from public.fan_club_members m
              where m.artist_id = r.artist_id
                and m.fan_id = auth.uid()
                and m.status = 'active'
                and (m.expires_at is null or m.expires_at > now())
            )
          )
        )
    )
  );

drop policy if exists "live_room_photos_select" on public.live_room_photos;
create policy "live_room_photos_select"
  on public.live_room_photos for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id
        and (
          r.artist_id = auth.uid()
          or (
            r.status in ('live', 'ended')
            and r.visibility = 'public'
          )
          or (
            r.status in ('live', 'ended')
            and r.visibility = 'fan_club'
            and auth.uid() is not null
            and exists (
              select 1 from public.fan_club_members m
              where m.artist_id = r.artist_id
                and m.fan_id = auth.uid()
                and m.status = 'active'
                and (m.expires_at is null or m.expires_at > now())
            )
          )
        )
    )
  );

-- Fix start_live_room to store live_room_id on notifications
create or replace function public.start_live_room(
  p_title text default 'Live Room',
  p_mode text default 'video',
  p_visibility text default 'public',
  p_country text default null,
  p_city text default null,
  p_neighborhood text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := left(trim(coalesce(nullif(trim(p_title), ''), 'Live Room')), 120);
  v_mode text := lower(trim(coalesce(p_mode, 'photos')));
  v_vis text := lower(trim(coalesce(p_visibility, 'public')));
  v_id uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if v_mode not in ('video', 'photos', 'audio') then
    raise exception 'invalid_mode';
  end if;
  if v_vis not in ('public', 'fan_club', 'private') then
    raise exception 'invalid_visibility';
  end if;

  select id into v_existing
  from public.live_rooms
  where artist_id = v_uid and status = 'live'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'live_room_id', v_existing,
      'skipped', 'already_live'
    );
  end if;

  insert into public.live_rooms (
    artist_id, title, status, mode, visibility, host,
    country, city, neighborhood, started_at, updated_at
  )
  values (
    v_uid, v_title, 'live', v_mode, v_vis, 'world',
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_neighborhood, '')), ''),
    now(), now()
  )
  returning id into v_id;

  begin
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, live_room_id
    )
    select f.follower_id, v_uid, 'live_room', left(v_title, 200), v_id
    from public.artist_follows f
    where f.artist_id = v_uid
      and f.follower_id <> v_uid
    limit 200;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'live_room_id', v_id,
    'title', v_title,
    'mode', v_mode,
    'visibility', v_vis,
    'status', 'live'
  );
end;
$$;

revoke all on function public.start_live_room(text, text, text, text, text, text) from public;
grant execute on function public.start_live_room(text, text, text, text, text, text) to authenticated;

-- Validate photo URLs (https only)
create or replace function public.push_live_room_photo(
  p_live_room_id uuid,
  p_photo_url text,
  p_caption text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
  v_url text := trim(coalesce(p_photo_url, ''));
  v_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(v_url) < 12 then raise exception 'photo_required'; end if;
  if v_url !~* '^https://' then raise exception 'photo_https_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.artist_id <> v_uid then raise exception 'not_owner'; end if;
  if v_row.status <> 'live' then raise exception 'not_live'; end if;

  insert into public.live_room_photos (
    live_room_id, artist_id, photo_url, caption, sort_order
  )
  values (
    p_live_room_id, v_uid, left(v_url, 2000),
    nullif(left(trim(coalesce(p_caption, '')), 200), ''),
    (select coalesce(max(sort_order), 0) + 1 from public.live_room_photos where live_room_id = p_live_room_id)
  )
  returning id into v_id;

  update public.live_rooms
  set stage_photo_url = left(v_url, 2000), updated_at = now()
  where id = p_live_room_id;

  return jsonb_build_object('ok', true, 'photo_id', v_id, 'photo_url', v_url);
end;
$$;

revoke all on function public.push_live_room_photo(uuid, text, text) from public;
grant execute on function public.push_live_room_photo(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260830_live_rooms_hardening.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_rect_live.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- RECT Live — professional performances (Phase 3)
-- Separate from casual Live Rooms.
-- Paste after live_rooms migrations.
-- ============================================================

create table if not exists public.rect_lives (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'RECT Live',
  status text not null default 'offline'
    check (status in ('offline', 'live', 'ended')),
  visibility text not null default 'public'
    check (visibility in ('public', 'fan_club', 'private')),
  -- world default; portal = premiere / unlock party (Phase 4)
  host text not null default 'world'
    check (host in ('world', 'portal')),
  portal_release_id uuid,
  viewer_count integer not null default 0 check (viewer_count >= 0),
  country text,
  city text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rect_lives_one_live_per_artist
  on public.rect_lives (artist_id)
  where status = 'live';

create index if not exists rect_lives_live_idx
  on public.rect_lives (status, viewer_count desc)
  where status = 'live';

alter table public.rect_lives enable row level security;

drop policy if exists "rect_lives_select_visible" on public.rect_lives;
create policy "rect_lives_select_visible"
  on public.rect_lives for select
  to authenticated, anon
  using (
    artist_id = auth.uid()
    or (status in ('live', 'ended') and visibility = 'public')
    or (
      status in ('live', 'ended')
      and visibility = 'fan_club'
      and auth.uid() is not null
      and exists (
        select 1 from public.fan_club_members m
        where m.artist_id = rect_lives.artist_id
          and m.fan_id = auth.uid()
          and m.status = 'active'
          and (m.expires_at is null or m.expires_at > now())
      )
    )
  );

create or replace function public.start_rect_live(
  p_title text default 'RECT Live',
  p_visibility text default 'public',
  p_host text default 'world',
  p_portal_release_id uuid default null,
  p_country text default null,
  p_city text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := left(trim(coalesce(nullif(trim(p_title), ''), 'RECT Live')), 120);
  v_vis text := lower(trim(coalesce(p_visibility, 'public')));
  v_host text := lower(trim(coalesce(p_host, 'world')));
  v_id uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_vis not in ('public', 'fan_club', 'private') then raise exception 'invalid_visibility'; end if;
  if v_host not in ('world', 'portal') then raise exception 'invalid_host'; end if;
  if v_host = 'portal' and p_portal_release_id is null then
    raise exception 'portal_required';
  end if;

  -- Can't run casual Live Room and RECT Live at once
  if exists (
    select 1 from public.live_rooms
    where artist_id = v_uid and status = 'live'
  ) then
    raise exception 'live_room_active';
  end if;

  select id into v_existing
  from public.rect_lives
  where artist_id = v_uid and status = 'live'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'rect_live_id', v_existing, 'skipped', 'already_live');
  end if;

  insert into public.rect_lives (
    artist_id, title, status, visibility, host, portal_release_id,
    country, city, started_at, updated_at
  )
  values (
    v_uid, v_title, 'live', v_vis, v_host, p_portal_release_id,
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    now(), now()
  )
  returning id into v_id;

  begin
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body
    )
    select f.follower_id, v_uid, 'live_room',
           left('RECT Live · ' || v_title, 200)
    from public.artist_follows f
    where f.artist_id = v_uid and f.follower_id <> v_uid
    limit 200;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'rect_live_id', v_id,
    'title', v_title,
    'status', 'live',
    'host', v_host
  );
end;
$$;

revoke all on function public.start_rect_live(text, text, text, uuid, text, text) from public;
grant execute on function public.start_rect_live(text, text, text, uuid, text, text) to authenticated;

create or replace function public.end_rect_live(p_rect_live_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.rect_lives%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.rect_lives where id = p_rect_live_id;
  if not found then raise exception 'not_found'; end if;
  if v_row.artist_id <> v_uid then raise exception 'not_owner'; end if;
  if v_row.status <> 'live' then
    return jsonb_build_object('ok', true, 'skipped', 'not_live');
  end if;

  update public.rect_lives
  set status = 'ended', ended_at = now(), updated_at = now(), viewer_count = 0
  where id = p_rect_live_id;

  return jsonb_build_object('ok', true, 'status', 'ended');
end;
$$;

revoke all on function public.end_rect_live(uuid) from public;
grant execute on function public.end_rect_live(uuid) to authenticated;

-- Phase 4: casual Live Room can host in a portal
create or replace function public.start_live_room(
  p_title text default 'Live Room',
  p_mode text default 'photos',
  p_visibility text default 'public',
  p_country text default null,
  p_city text default null,
  p_neighborhood text default null,
  p_host text default 'world',
  p_portal_release_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := left(trim(coalesce(nullif(trim(p_title), ''), 'Live Room')), 120);
  v_mode text := lower(trim(coalesce(p_mode, 'photos')));
  v_vis text := lower(trim(coalesce(p_visibility, 'public')));
  v_host text := lower(trim(coalesce(p_host, 'world')));
  v_id uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_mode not in ('video', 'photos', 'audio') then raise exception 'invalid_mode'; end if;
  if v_vis not in ('public', 'fan_club', 'private') then raise exception 'invalid_visibility'; end if;
  if v_host not in ('world', 'portal') then raise exception 'invalid_host'; end if;
  if v_host = 'portal' and p_portal_release_id is null then
    raise exception 'portal_required';
  end if;

  if exists (
    select 1 from public.rect_lives where artist_id = v_uid and status = 'live'
  ) then
    raise exception 'rect_live_active';
  end if;

  select id into v_existing
  from public.live_rooms
  where artist_id = v_uid and status = 'live'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'live_room_id', v_existing, 'skipped', 'already_live');
  end if;

  insert into public.live_rooms (
    artist_id, title, status, mode, visibility, host, portal_release_id,
    country, city, neighborhood, started_at, updated_at
  )
  values (
    v_uid, v_title, 'live', v_mode, v_vis, v_host, p_portal_release_id,
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_neighborhood, '')), ''),
    now(), now()
  )
  returning id into v_id;

  begin
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, live_room_id
    )
    select f.follower_id, v_uid, 'live_room', left(v_title, 200), v_id
    from public.artist_follows f
    where f.artist_id = v_uid and f.follower_id <> v_uid
    limit 200;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'live_room_id', v_id,
    'title', v_title,
    'mode', v_mode,
    'visibility', v_vis,
    'host', v_host,
    'status', 'live'
  );
end;
$$;

-- Drop old 6-arg overload if present, grant new 8-arg
drop function if exists public.start_live_room(text, text, text, text, text, text);
revoke all on function public.start_live_room(text, text, text, text, text, text, text, uuid) from public;
grant execute on function public.start_live_room(text, text, text, text, text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260830_rect_live.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_discovery_trending.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Discovery trending — songs, portals, Live Rooms by geo
-- Paste after live_rooms migrations
-- ============================================================

create or replace function public.trending_tracks(p_limit integer default 20)
returns table (
  track_id uuid,
  title text,
  artist_id uuid,
  play_count bigint,
  cover_art_url text
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
    coalesce(c.play_count, 0)::bigint as play_count,
    t.cover_art_url
  from public.tracks t
  left join public.track_play_counts c on c.track_id = t.id
  where coalesce(t.status, 'live') in ('live', 'published')
    and t.audio_url is not null
  order by coalesce(c.play_count, 0) desc, t.created_at desc nulls last
  limit greatest(least(coalesce(p_limit, 20), 50), 1);
$$;

revoke all on function public.trending_tracks(integer) from public;
grant execute on function public.trending_tracks(integer) to anon, authenticated;

create or replace function public.trending_portals(p_limit integer default 12)
returns table (
  release_id uuid,
  artist_id uuid,
  title text,
  cover_url text,
  kind text,
  media_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if to_regclass('public.portal_releases') is null then
    return;
  end if;

  return query
  select
    r.id as release_id,
    r.artist_id,
    r.title,
    r.cover_url,
    r.kind,
    (
      select count(*)::bigint
      from public.portal_release_media m
      where m.release_id = r.id
    ) as media_count
  from public.portal_releases r
  where r.published = true
  order by (
      select count(*) from public.portal_release_media m where m.release_id = r.id
    ) desc,
    r.updated_at desc nulls last,
    r.created_at desc nulls last
  limit greatest(least(coalesce(p_limit, 12), 40), 1);
end;
$$;

revoke all on function public.trending_portals(integer) from public;
grant execute on function public.trending_portals(integer) to anon, authenticated;

create or replace function public.trending_live_rooms_by_place(
  p_country text default null,
  p_city text default null,
  p_neighborhood text default null,
  p_limit integer default 16
)
returns table (
  live_room_id uuid,
  artist_id uuid,
  title text,
  mode text,
  viewer_count integer,
  country text,
  city text,
  neighborhood text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id as live_room_id,
    r.artist_id,
    r.title,
    r.mode,
    r.viewer_count,
    r.country,
    r.city,
    r.neighborhood
  from public.live_rooms r
  where r.status = 'live'
    and r.visibility = 'public'
    and r.host = 'world'
    and (
      p_country is null
      or nullif(trim(p_country), '') is null
      or lower(coalesce(r.country, '')) = lower(trim(p_country))
    )
    and (
      p_city is null
      or nullif(trim(p_city), '') is null
      or lower(coalesce(r.city, '')) = lower(trim(p_city))
    )
    and (
      p_neighborhood is null
      or nullif(trim(p_neighborhood), '') is null
      or lower(coalesce(r.neighborhood, '')) = lower(trim(p_neighborhood))
    )
  order by r.viewer_count desc, r.started_at desc nulls last
  limit greatest(least(coalesce(p_limit, 16), 40), 1);
$$;

revoke all on function public.trending_live_rooms_by_place(text, text, text, integer) from public;
grant execute on function public.trending_live_rooms_by_place(text, text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';

-- END 20260830_discovery_trending.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_direct_messages.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Direct messages (1:1) — paste in Supabase SQL Editor → Run
-- Requires: user_blocks.users_are_blocked, auth.users
-- Safe to re-run.
-- ============================================================

create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  -- Canonical pair for uniqueness (lower uuid first)
  participant_low uuid not null references auth.users (id) on delete cascade,
  participant_high uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dm_conversations_ordered check (participant_low < participant_high),
  constraint dm_conversations_pair_unique unique (participant_low, participant_high)
);

create index if not exists dm_conversations_updated_idx
  on public.dm_conversations (updated_at desc);

create table if not exists public.dm_participants (
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists dm_participants_user_idx
  on public.dm_participants (user_id);

create table if not exists public.dm_messages (
  id bigserial primary key,
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null
    check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_conv_created_idx
  on public.dm_messages (conversation_id, created_at desc);

alter table public.dm_conversations enable row level security;
alter table public.dm_participants enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists "dm_conversations_select_participant" on public.dm_conversations;
create policy "dm_conversations_select_participant"
  on public.dm_conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants p
      where p.conversation_id = id and p.user_id = auth.uid()
    )
  );

drop policy if exists "dm_participants_select_own_thread" on public.dm_participants;
create policy "dm_participants_select_own_thread"
  on public.dm_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants me
      where me.conversation_id = conversation_id
        and me.user_id = auth.uid()
    )
  );

drop policy if exists "dm_participants_update_own" on public.dm_participants;
create policy "dm_participants_update_own"
  on public.dm_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "dm_messages_select_participant" on public.dm_messages;
create policy "dm_messages_select_participant"
  on public.dm_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants p
      where p.conversation_id = conversation_id
        and p.user_id = auth.uid()
    )
  );

-- No client inserts on conversations/messages — RPCs only.

create or replace function public.open_or_get_dm(p_other_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_other_id is null then
    raise exception 'user_required';
  end if;
  if p_other_id = v_uid then
    raise exception 'cannot_dm_self';
  end if;

  if to_regclass('public.user_blocks') is not null
     and public.users_are_blocked(v_uid, p_other_id) then
    raise exception 'blocked';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_other_id) then
    raise exception 'user_not_found';
  end if;

  if p_other_id < v_uid then
    v_low := p_other_id;
    v_high := v_uid;
  else
    v_low := v_uid;
    v_high := p_other_id;
  end if;

  select c.id into v_id
  from public.dm_conversations c
  where c.participant_low = v_low and c.participant_high = v_high;

  if v_id is null then
    begin
      insert into public.dm_conversations (participant_low, participant_high)
      values (v_low, v_high)
      returning id into v_id;
    exception
      when unique_violation then
        select c.id into v_id
        from public.dm_conversations c
        where c.participant_low = v_low and c.participant_high = v_high;
    end;

    insert into public.dm_participants (conversation_id, user_id, last_read_at)
    values
      (v_id, v_uid, now()),
      (v_id, p_other_id, null)
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', v_id,
    'other_id', p_other_id
  );
end;
$$;

revoke all on function public.open_or_get_dm(uuid) from public;
grant execute on function public.open_or_get_dm(uuid) to authenticated;

create or replace function public.send_dm(
  p_conversation_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
  v_body text := left(trim(coalesce(p_body, '')), 2000);
  v_id bigint;
  v_created timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;
  if length(v_body) = 0 then
    raise exception 'body_required';
  end if;

  if not exists (
    select 1 from public.dm_participants p
    where p.conversation_id = p_conversation_id and p.user_id = v_uid
  ) then
    raise exception 'not_participant';
  end if;

  select p.user_id into v_other
  from public.dm_participants p
  where p.conversation_id = p_conversation_id
    and p.user_id <> v_uid
  limit 1;

  if v_other is null then
    raise exception 'conversation_invalid';
  end if;

  if to_regclass('public.user_blocks') is not null
     and public.users_are_blocked(v_uid, v_other) then
    raise exception 'blocked';
  end if;

  insert into public.dm_messages (conversation_id, sender_id, body)
  values (p_conversation_id, v_uid, v_body)
  returning id, created_at into v_id, v_created;

  update public.dm_conversations
  set updated_at = v_created
  where id = p_conversation_id;

  update public.dm_participants
  set last_read_at = v_created
  where conversation_id = p_conversation_id and user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'message_id', v_id,
    'conversation_id', p_conversation_id,
    'sender_id', v_uid,
    'body', v_body,
    'created_at', v_created
  );
end;
$$;

revoke all on function public.send_dm(uuid, text) from public;
grant execute on function public.send_dm(uuid, text) to authenticated;

create or replace function public.mark_dm_read(p_conversation_id uuid)
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
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  update public.dm_participants
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and user_id = v_uid;

  if not found then
    raise exception 'not_participant';
  end if;

  return jsonb_build_object('ok', true, 'conversation_id', p_conversation_id);
end;
$$;

revoke all on function public.mark_dm_read(uuid) from public;
grant execute on function public.mark_dm_read(uuid) to authenticated;

-- Extend block: keep history but DMs cannot continue (send/open check blocked).
-- Also drop people/artist/playlist follows (same as prior block migrations).
create or replace function public.toggle_user_block(p_user_id uuid)
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

  if p_user_id is null then
    raise exception 'user_required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_block_self';
  end if;

  select exists (
    select 1 from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id
  ) into v_exists;

  if v_exists then
    delete from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id;
    return jsonb_build_object(
      'blocked', false,
      'user_id', p_user_id
    );
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id)
  on conflict do nothing;

  if to_regclass('public.people_follows') is not null then
    delete from public.people_follows
    where (follower_id = v_uid and person_id = p_user_id)
       or (follower_id = p_user_id and person_id = v_uid);
  end if;

  if to_regclass('public.artist_follows') is not null then
    delete from public.artist_follows
    where (follower_id = v_uid and artist_id = p_user_id)
       or (follower_id = p_user_id and artist_id = v_uid);
  end if;

  if to_regclass('public.playlist_follows') is not null
     and to_regclass('public.playlists') is not null then
    delete from public.playlist_follows pf
    using public.playlists p
    where pf.playlist_id = p.id
      and (
        (pf.follower_id = v_uid and p.user_id = p_user_id)
        or (pf.follower_id = p_user_id and p.user_id = v_uid)
      );
  end if;

  return jsonb_build_object(
    'blocked', true,
    'user_id', p_user_id
  );
end;
$$;

revoke all on function public.toggle_user_block(uuid) from public;
grant execute on function public.toggle_user_block(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260830_direct_messages.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260831_artist_os_delivery_suite.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260831_artist_os_delivery_suite.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260831_joko_tips.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- JOKO tips — pending → confirm → wallet (via tip→wallet trigger)
-- Paste AFTER 20260831_artist_os_delivery_suite.sql
-- ============================================================

alter table public.artist_tips
  add column if not exists joko_reference text;

create index if not exists artist_tips_joko_reference_idx
  on public.artist_tips (joko_reference)
  where joko_reference is not null;

-- Create tip in pending; confirm after JOKO payment
create or replace function public.create_pending_artist_tip(
  p_artist_id uuid,
  p_amount_xof integer,
  p_payment_method text,
  p_message text default null,
  p_track_id text default null
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
  v_message text;
  v_track text;
  v_track_ok boolean;
  v_method text;
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

  v_method := lower(trim(coalesce(p_payment_method, 'wave')));
  if v_method not in (
    'wave', 'orange_money', 'mtn_momo', 'mobile_money', 'joko_wallet', 'debit'
  ) then
    raise exception 'invalid_payment_method';
  end if;

  select exists (
    select 1 from public.users u
    where u.id = p_artist_id
      and (u.account_type = 'artist' or u.role = 'artist')
  ) into v_artist_ok;
  if not v_artist_ok then
    raise exception 'artist_not_found';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is not null and char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  v_track := nullif(trim(coalesce(p_track_id, '')), '');
  if v_track is not null then
    select exists (
      select 1 from public.tracks t
      where t.id::text = v_track and t.artist_id = p_artist_id
    ) into v_track_ok;
    if not v_track_ok then
      v_track := null;
    end if;
  end if;

  insert into public.artist_tips (
    from_user_id, artist_id, amount_xof, status, payment_method, message, track_id
  )
  values (
    v_uid, p_artist_id, p_amount_xof, 'pending', v_method, v_message, v_track
  )
  returning id into v_tip_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', v_tip_id,
    'artist_id', p_artist_id,
    'amount_xof', p_amount_xof,
    'payment_method', v_method,
    'status', 'pending',
    'message', v_message,
    'track_id', v_track
  );
end;
$$;

revoke all on function public.create_pending_artist_tip(uuid, integer, text, text, text) from public;
grant execute on function public.create_pending_artist_tip(uuid, integer, text, text, text) to authenticated;

create or replace function public.set_tip_joko_reference(
  p_tip_id bigint,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.artist_tips
  set joko_reference = nullif(trim(p_reference), '')
  where id = p_tip_id
    and from_user_id = auth.uid()
    and status = 'pending';
end;
$$;

revoke all on function public.set_tip_joko_reference(bigint, text) from public;
grant execute on function public.set_tip_joko_reference(bigint, text) to authenticated;

-- System confirm (webhook / demo instant)
create or replace function public.confirm_artist_tip_system(p_tip_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tip public.artist_tips%rowtype;
begin
  select * into v_tip from public.artist_tips where id = p_tip_id for update;
  if not found then
    raise exception 'tip_not_found';
  end if;
  if v_tip.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'already', true, 'tip_id', p_tip_id);
  end if;
  if v_tip.status is distinct from 'pending' then
    raise exception 'tip_not_pending';
  end if;

  update public.artist_tips
  set status = 'confirmed'
  where id = p_tip_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', p_tip_id,
    'artist_id', v_tip.artist_id,
    'amount_xof', v_tip.amount_xof
  );
end;
$$;

revoke all on function public.confirm_artist_tip_system(bigint) from public;
-- service role only via admin client; no grant to authenticated

notify pgrst, 'reload schema';

-- END 20260831_joko_tips.sql

