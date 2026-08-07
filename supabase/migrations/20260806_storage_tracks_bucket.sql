-- Storage + plays RLS for artist upload / home playback
-- Run in Supabase SQL Editor if the API cannot create the bucket automatically.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tracks',
  'tracks',
  true,
  52428800,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set public = excluded.public;

-- Public read of audio/cover objects
drop policy if exists "tracks_storage_public_read" on storage.objects;
create policy "tracks_storage_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'tracks');

-- Authenticated artists upload into their folder: {user_id}/...
drop policy if exists "tracks_storage_insert_own" on storage.objects;
create policy "tracks_storage_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "tracks_storage_update_own" on storage.objects;
create policy "tracks_storage_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "tracks_storage_delete_own" on storage.objects;
create policy "tracks_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Plays: listeners can insert their own play rows
alter table public.plays enable row level security;

drop policy if exists "plays_insert_own" on public.plays;
create policy "plays_insert_own"
  on public.plays for insert
  to authenticated
  with check (listener_id = auth.uid());

drop policy if exists "plays_select_own" on public.plays;
create policy "plays_select_own"
  on public.plays for select
  to authenticated
  using (listener_id = auth.uid());
