-- Optional link between a RECT SOUND listener and a separate Artist OS user.
alter table public.users
  add column if not exists linked_artist_id uuid;

alter table public.users
  add column if not exists linked_listener_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_linked_artist_id_fkey'
  ) then
    alter table public.users
      add constraint users_linked_artist_id_fkey
      foreign key (linked_artist_id) references public.users(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'users_linked_listener_id_fkey'
  ) then
    alter table public.users
      add constraint users_linked_listener_id_fkey
      foreign key (linked_listener_id) references public.users(id) on delete set null;
  end if;
end $$;

create index if not exists users_linked_artist_id_idx
  on public.users (linked_artist_id)
  where linked_artist_id is not null;
