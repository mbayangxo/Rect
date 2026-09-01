-- ============================================================
-- Live Rooms (casual) — Phase 1 of RECT presence
-- Paste in Supabase SQL Editor → Run
--
-- RECT Live (pro performances) = later phase, separate table.
-- Live Room = everyday go-live in Artist World:
--   mode: video | photos | audio
-- ============================================================

create table if not exists public.live_rooms (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Live Room',
  status text not null default 'offline'
    check (status in ('offline', 'live', 'ended')),
  mode text not null default 'video'
    check (mode in ('video', 'photos', 'audio')),
  visibility text not null default 'public'
    check (visibility in ('public', 'fan_club', 'private')),
  -- world = Artist World (default). portal = song/art portal (later).
  host text not null default 'world'
    check (host in ('world', 'portal')),
  portal_release_id uuid,
  country text,
  city text,
  neighborhood text,
  viewer_count integer not null default 0 check (viewer_count >= 0),
  stage_photo_url text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_rooms_artist_status_idx
  on public.live_rooms (artist_id, status);

create index if not exists live_rooms_live_viewers_idx
  on public.live_rooms (status, viewer_count desc)
  where status = 'live';

create index if not exists live_rooms_live_geo_idx
  on public.live_rooms (country, city)
  where status = 'live';

-- One active live room per artist
create unique index if not exists live_rooms_one_live_per_artist
  on public.live_rooms (artist_id)
  where status = 'live';

create table if not exists public.live_room_viewers (
  live_room_id uuid not null references public.live_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (live_room_id, user_id)
);

create index if not exists live_room_viewers_active_idx
  on public.live_room_viewers (live_room_id)
  where left_at is null;

create table if not exists public.live_room_messages (
  id bigserial primary key,
  live_room_id uuid not null references public.live_rooms (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null
    check (char_length(trim(body)) > 0 and char_length(body) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists live_room_messages_room_created_idx
  on public.live_room_messages (live_room_id, created_at desc);

create table if not exists public.live_room_photos (
  id bigserial primary key,
  live_room_id uuid not null references public.live_rooms (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  photo_url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists live_room_photos_room_idx
  on public.live_room_photos (live_room_id, sort_order, created_at);

alter table public.live_rooms enable row level security;
alter table public.live_room_viewers enable row level security;
alter table public.live_room_messages enable row level security;
alter table public.live_room_photos enable row level security;

drop policy if exists "live_rooms_select_visible" on public.live_rooms;
create policy "live_rooms_select_visible"
  on public.live_rooms for select
  to authenticated, anon
  using (
    artist_id = auth.uid()
    or status = 'live'
    or status = 'ended'
  );

drop policy if exists "live_room_viewers_select_participant" on public.live_room_viewers;
create policy "live_room_viewers_select_participant"
  on public.live_room_viewers for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id and r.artist_id = auth.uid()
    )
  );

drop policy if exists "live_room_messages_select" on public.live_room_messages;
create policy "live_room_messages_select"
  on public.live_room_messages for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id
        and (r.status in ('live', 'ended') or r.artist_id = auth.uid())
    )
  );

drop policy if exists "live_room_photos_select" on public.live_room_photos;
create policy "live_room_photos_select"
  on public.live_room_photos for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.live_rooms r
      where r.id = live_room_id
        and (r.status in ('live', 'ended') or r.artist_id = auth.uid())
    )
  );

-- Allow live_room notification kind (drop strict list if present)
alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

create or replace function public.start_live_room(
  p_title text default 'Live Room',
  p_mode text default 'video',
  p_visibility text default 'public',
  p_country text default null,
  p_city text default null,
  p_neighborhood text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := left(trim(coalesce(nullif(trim(p_title), ''), 'Live Room')), 120);
  v_mode text := lower(trim(coalesce(p_mode, 'video')));
  v_vis text := lower(trim(coalesce(p_visibility, 'public')));
  v_id uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if v_mode not in ('video', 'photos', 'audio') then
    raise exception 'invalid_mode';
  end if;
  if v_vis not in ('public', 'fan_club', 'private') then
    raise exception 'invalid_visibility';
  end if;

  select id into v_existing
  from public.live_rooms
  where artist_id = v_uid and status = 'live'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'live_room_id', v_existing,
      'skipped', 'already_live'
    );
  end if;

  insert into public.live_rooms (
    artist_id, title, status, mode, visibility, host,
    country, city, neighborhood, started_at, updated_at
  )
  values (
    v_uid, v_title, 'live', v_mode, v_vis, 'world',
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_neighborhood, '')), ''),
    now(), now()
  )
  returning id into v_id;

  -- Notify followers (best-effort)
  begin
    insert into public.artist_notifications (recipient_id, actor_id, kind, body)
    select f.follower_id, v_uid, 'live_room', left(v_title, 200)
    from public.artist_follows f
    where f.artist_id = v_uid
      and f.follower_id <> v_uid
    limit 200;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'live_room_id', v_id,
    'title', v_title,
    'mode', v_mode,
    'visibility', v_vis,
    'status', 'live'
  );
end;
$$;

revoke all on function public.start_live_room(text, text, text, text, text, text) from public;
grant execute on function public.start_live_room(text, text, text, text, text, text) to authenticated;

create or replace function public.end_live_room(p_live_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_live_room_id is null then raise exception 'room_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.artist_id <> v_uid then raise exception 'not_owner'; end if;
  if v_row.status <> 'live' then
    return jsonb_build_object('ok', true, 'skipped', 'not_live', 'status', v_row.status);
  end if;

  update public.live_rooms
  set status = 'ended',
      ended_at = now(),
      updated_at = now(),
      viewer_count = 0
  where id = p_live_room_id;

  update public.live_room_viewers
  set left_at = coalesce(left_at, now())
  where live_room_id = p_live_room_id and left_at is null;

  return jsonb_build_object('ok', true, 'live_room_id', p_live_room_id, 'status', 'ended');
end;
$$;

revoke all on function public.end_live_room(uuid) from public;
grant execute on function public.end_live_room(uuid) to authenticated;

create or replace function public.join_live_room(p_live_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
  v_member boolean := false;
  v_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_live_room_id is null then raise exception 'room_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.status <> 'live' then raise exception 'not_live'; end if;

  if v_row.visibility = 'private' and v_row.artist_id <> v_uid then
    raise exception 'private_room';
  end if;

  if v_row.visibility = 'fan_club' and v_row.artist_id <> v_uid then
    if to_regclass('public.fan_club_members') is not null then
      select exists (
        select 1 from public.fan_club_members m
        where m.artist_id = v_row.artist_id
          and m.fan_id = v_uid
          and m.status = 'active'
          and (m.expires_at is null or m.expires_at > now())
      ) into v_member;
    end if;
    if not v_member then raise exception 'fan_club_required'; end if;
  end if;

  insert into public.live_room_viewers (live_room_id, user_id, joined_at, left_at)
  values (p_live_room_id, v_uid, now(), null)
  on conflict (live_room_id, user_id) do update
    set joined_at = now(), left_at = null;

  select count(*)::integer into v_count
  from public.live_room_viewers
  where live_room_id = p_live_room_id and left_at is null;

  update public.live_rooms
  set viewer_count = v_count, updated_at = now()
  where id = p_live_room_id;

  return jsonb_build_object(
    'ok', true,
    'live_room_id', p_live_room_id,
    'viewer_count', v_count,
    'mode', v_row.mode,
    'title', v_row.title,
    'artist_id', v_row.artist_id
  );
end;
$$;

revoke all on function public.join_live_room(uuid) from public;
grant execute on function public.join_live_room(uuid) to authenticated;

create or replace function public.leave_live_room(p_live_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.live_room_viewers
  set left_at = now()
  where live_room_id = p_live_room_id
    and user_id = v_uid
    and left_at is null;

  select count(*)::integer into v_count
  from public.live_room_viewers
  where live_room_id = p_live_room_id and left_at is null;

  update public.live_rooms
  set viewer_count = v_count, updated_at = now()
  where id = p_live_room_id and status = 'live';

  return jsonb_build_object('ok', true, 'viewer_count', v_count);
end;
$$;

revoke all on function public.leave_live_room(uuid) from public;
grant execute on function public.leave_live_room(uuid) to authenticated;

create or replace function public.send_live_room_message(
  p_live_room_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
  v_body text := left(trim(coalesce(p_body, '')), 500);
  v_id bigint;
  v_created timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(v_body) = 0 then raise exception 'body_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.status <> 'live' then raise exception 'not_live'; end if;

  if v_row.artist_id <> v_uid then
    if not exists (
      select 1 from public.live_room_viewers v
      where v.live_room_id = p_live_room_id
        and v.user_id = v_uid
        and v.left_at is null
    ) then
      raise exception 'not_in_room';
    end if;
  end if;

  insert into public.live_room_messages (live_room_id, sender_id, body)
  values (p_live_room_id, v_uid, v_body)
  returning id, created_at into v_id, v_created;

  return jsonb_build_object(
    'ok', true,
    'message_id', v_id,
    'body', v_body,
    'sender_id', v_uid,
    'created_at', v_created
  );
end;
$$;

revoke all on function public.send_live_room_message(uuid, text) from public;
grant execute on function public.send_live_room_message(uuid, text) to authenticated;

create or replace function public.push_live_room_photo(
  p_live_room_id uuid,
  p_photo_url text,
  p_caption text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.live_rooms%rowtype;
  v_url text := trim(coalesce(p_photo_url, ''));
  v_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(v_url) < 8 then raise exception 'photo_required'; end if;

  select * into v_row from public.live_rooms where id = p_live_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_row.artist_id <> v_uid then raise exception 'not_owner'; end if;
  if v_row.status <> 'live' then raise exception 'not_live'; end if;

  insert into public.live_room_photos (
    live_room_id, artist_id, photo_url, caption, sort_order
  )
  values (
    p_live_room_id, v_uid, left(v_url, 2000),
    nullif(left(trim(coalesce(p_caption, '')), 200), ''),
    (select coalesce(max(sort_order), 0) + 1 from public.live_room_photos where live_room_id = p_live_room_id)
  )
  returning id into v_id;

  update public.live_rooms
  set stage_photo_url = left(v_url, 2000), updated_at = now()
  where id = p_live_room_id;

  return jsonb_build_object('ok', true, 'photo_id', v_id, 'photo_url', v_url);
end;
$$;

revoke all on function public.push_live_room_photo(uuid, text, text) from public;
grant execute on function public.push_live_room_photo(uuid, text, text) to authenticated;

-- Realtime for chat / photos / status
do $$
begin
  begin
    alter publication supabase_realtime add table public.live_rooms;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.live_room_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.live_room_photos;
  exception when duplicate_object then null;
  end;
end $$;

notify pgrst, 'reload schema';
