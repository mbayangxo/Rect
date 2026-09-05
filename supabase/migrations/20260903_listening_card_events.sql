-- RECT listening cards — track share / card opens for analytics + royalties later.
-- Safe to re-run.

create table if not exists public.listening_card_events (
  id bigserial primary key,
  track_id uuid not null references public.tracks (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null
    check (event_type in ('view', 'share', 'copy_link', 'send_friend', 'open_card')),
  channel text,
  recipient_id uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists listening_card_events_track_created_idx
  on public.listening_card_events (track_id, created_at desc);

create index if not exists listening_card_events_actor_created_idx
  on public.listening_card_events (actor_id, created_at desc)
  where actor_id is not null;

alter table public.listening_card_events enable row level security;

drop policy if exists "listening_card_events_insert_own" on public.listening_card_events;
create policy "listening_card_events_insert_own"
  on public.listening_card_events for insert
  to authenticated
  with check (actor_id is null or actor_id = auth.uid());

drop policy if exists "listening_card_events_select_artist" on public.listening_card_events;
create policy "listening_card_events_select_artist"
  on public.listening_card_events for select
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id and t.artist_id = auth.uid()
    )
    or actor_id = auth.uid()
  );

notify pgrst, 'reload schema';
