-- Artist / user avatar URL — paste in Supabase SQL Editor → Run

alter table public.users
  add column if not exists avatar_url text;

notify pgrst, 'reload schema';
