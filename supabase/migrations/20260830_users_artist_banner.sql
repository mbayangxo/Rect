-- Artist portal banner image (optional)
alter table public.users
  add column if not exists artist_banner_url text;

notify pgrst, 'reload schema';
