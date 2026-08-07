-- RECT SOUND roles: fan | artist (keep listener for legacy rows)
alter table public.users drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('fan', 'artist', 'listener', 'admin'));

-- Optional: normalize legacy listener → fan over time (do not force here)
