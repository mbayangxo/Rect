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
