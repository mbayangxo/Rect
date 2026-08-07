-- Privacy preferences on public.users for You / Settings
-- Paste in Supabase SQL Editor if not already applied.

alter table public.users
  add column if not exists privacy_public_profile boolean not null default true,
  add column if not exists privacy_show_activity boolean not null default true,
  add column if not exists privacy_show_on_charts boolean not null default true;

notify pgrst, 'reload schema';
