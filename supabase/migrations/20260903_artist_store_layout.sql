-- Artist store layout preference for fan World page (grid | rail | featured).
alter table public.users
  add column if not exists artist_store_layout text;

alter table public.users
  drop constraint if exists users_artist_store_layout_check;

alter table public.users
  add constraint users_artist_store_layout_check
  check (
    artist_store_layout is null
    or artist_store_layout in ('grid', 'rail', 'featured')
  );

comment on column public.users.artist_store_layout is
  'RECT Artist store template: grid | rail | featured';
