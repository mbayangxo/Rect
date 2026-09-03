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
