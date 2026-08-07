-- Keep auth trigger aligned with phone_number NOT NULL on public.users
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
begin
  v_display := nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), '');
  if v_display is null then
    v_display := split_part(coalesce(new.email, 'user'), '@', 1);
  end if;

  v_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'fan');
  if v_role not in ('fan', 'artist') then
    v_role := 'fan';
  end if;

  v_phone := coalesce(nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), ''), '');

  insert into public.users (
    id,
    display_name,
    role,
    email,
    phone,
    phone_number,
    city,
    artist_bio,
    listen_liked,
    onboarding_completed,
    created_at,
    updated_at
  )
  values (
    new.id,
    v_display,
    v_role,
    new.email,
    nullif(v_phone, ''),
    v_phone,
    nullif(new.raw_user_meta_data->>'city', ''),
    nullif(new.raw_user_meta_data->>'artist_bio', ''),
    case
      when new.raw_user_meta_data->>'listen_liked' = 'true' then true
      when new.raw_user_meta_data->>'listen_liked' = 'false' then false
      else null
    end,
    coalesce((new.raw_user_meta_data->>'onboarding_completed')::boolean, false),
    now(),
    now()
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    email = coalesce(excluded.email, public.users.email),
    phone = coalesce(excluded.phone, public.users.phone),
    phone_number = coalesce(nullif(excluded.phone_number, ''), public.users.phone_number, ''),
    city = coalesce(excluded.city, public.users.city),
    artist_bio = coalesce(excluded.artist_bio, public.users.artist_bio),
    listen_liked = coalesce(excluded.listen_liked, public.users.listen_liked),
    onboarding_completed = excluded.onboarding_completed or public.users.onboarding_completed,
    updated_at = now();

  return new;
exception
  when undefined_column then
    -- Fallback if phone_number column naming differs
    insert into public.users (id, display_name, role, email)
    values (new.id, v_display, v_role, new.email)
    on conflict (id) do update set
      display_name = excluded.display_name,
      role = excluded.role,
      email = coalesce(excluded.email, public.users.email),
      updated_at = now();
    return new;
end;
$$;
