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
