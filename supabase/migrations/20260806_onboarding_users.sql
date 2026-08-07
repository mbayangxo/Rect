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
