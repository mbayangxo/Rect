-- Privacy preferences on public.users for You / Settings

alter table public.users
  add column if not exists privacy_public_profile boolean not null default true,
  add column if not exists privacy_show_activity boolean not null default true,
  add column if not exists privacy_show_on_charts boolean not null default true;

-- Allow users to update their own privacy flags (covered by users_update_own)
