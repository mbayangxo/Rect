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
