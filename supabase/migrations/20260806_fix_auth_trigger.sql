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
