-- ============================================================
-- RECT Live — professional performances (Phase 3)
-- Separate from casual Live Rooms.
-- Paste after live_rooms migrations.
-- ============================================================

create table if not exists public.rect_lives (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'RECT Live',
  status text not null default 'offline'
    check (status in ('offline', 'live', 'ended')),
  visibility text not null default 'public'
    check (visibility in ('public', 'fan_club', 'private')),
  -- world default; portal = premiere / unlock party (Phase 4)
  host text not null default 'world'
    check (host in ('world', 'portal')),
  portal_release_id uuid,
  viewer_count integer not null default 0 check (viewer_count >= 0),
  country text,
  city text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rect_lives_one_live_per_artist
  on public.rect_lives (artist_id)
  where status = 'live';

create index if not exists rect_lives_live_idx
  on public.rect_lives (status, viewer_count desc)
  where status = 'live';

alter table public.rect_lives enable row level security;

drop policy if exists "rect_lives_select_visible" on public.rect_lives;
create policy "rect_lives_select_visible"
  on public.rect_lives for select
  to authenticated, anon
  using (
    artist_id = auth.uid()
    or (status in ('live', 'ended') and visibility = 'public')
    or (
      status in ('live', 'ended')
      and visibility = 'fan_club'
      and auth.uid() is not null
      and exists (
        select 1 from public.fan_club_members m
        where m.artist_id = rect_lives.artist_id
          and m.fan_id = auth.uid()
          and m.status = 'active'
          and (m.expires_at is null or m.expires_at > now())
      )
    )
  );

create or replace function public.start_rect_live(
  p_title text default 'RECT Live',
  p_visibility text default 'public',
  p_host text default 'world',
  p_portal_release_id uuid default null,
  p_country text default null,
  p_city text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := left(trim(coalesce(nullif(trim(p_title), ''), 'RECT Live')), 120);
  v_vis text := lower(trim(coalesce(p_visibility, 'public')));
  v_host text := lower(trim(coalesce(p_host, 'world')));
  v_id uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_vis not in ('public', 'fan_club', 'private') then raise exception 'invalid_visibility'; end if;
  if v_host not in ('world', 'portal') then raise exception 'invalid_host'; end if;
  if v_host = 'portal' and p_portal_release_id is null then
    raise exception 'portal_required';
  end if;

  -- Can't run casual Live Room and RECT Live at once
  if exists (
    select 1 from public.live_rooms
    where artist_id = v_uid and status = 'live'
  ) then
    raise exception 'live_room_active';
  end if;

  select id into v_existing
  from public.rect_lives
  where artist_id = v_uid and status = 'live'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'rect_live_id', v_existing, 'skipped', 'already_live');
  end if;

  insert into public.rect_lives (
    artist_id, title, status, visibility, host, portal_release_id,
    country, city, started_at, updated_at
  )
  values (
    v_uid, v_title, 'live', v_vis, v_host, p_portal_release_id,
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    now(), now()
  )
  returning id into v_id;

  begin
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body
    )
    select f.follower_id, v_uid, 'live_room',
           left('RECT Live · ' || v_title, 200)
    from public.artist_follows f
    where f.artist_id = v_uid and f.follower_id <> v_uid
    limit 200;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'rect_live_id', v_id,
    'title', v_title,
    'status', 'live',
    'host', v_host
  );
end;
$$;

revoke all on function public.start_rect_live(text, text, text, uuid, text, text) from public;
grant execute on function public.start_rect_live(text, text, text, uuid, text, text) to authenticated;

create or replace function public.end_rect_live(p_rect_live_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.rect_lives%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.rect_lives where id = p_rect_live_id;
  if not found then raise exception 'not_found'; end if;
  if v_row.artist_id <> v_uid then raise exception 'not_owner'; end if;
  if v_row.status <> 'live' then
    return jsonb_build_object('ok', true, 'skipped', 'not_live');
  end if;

  update public.rect_lives
  set status = 'ended', ended_at = now(), updated_at = now(), viewer_count = 0
  where id = p_rect_live_id;

  return jsonb_build_object('ok', true, 'status', 'ended');
end;
$$;

revoke all on function public.end_rect_live(uuid) from public;
grant execute on function public.end_rect_live(uuid) to authenticated;

-- Phase 4: casual Live Room can host in a portal
create or replace function public.start_live_room(
  p_title text default 'Live Room',
  p_mode text default 'photos',
  p_visibility text default 'public',
  p_country text default null,
  p_city text default null,
  p_neighborhood text default null,
  p_host text default 'world',
  p_portal_release_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := left(trim(coalesce(nullif(trim(p_title), ''), 'Live Room')), 120);
  v_mode text := lower(trim(coalesce(p_mode, 'photos')));
  v_vis text := lower(trim(coalesce(p_visibility, 'public')));
  v_host text := lower(trim(coalesce(p_host, 'world')));
  v_id uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_mode not in ('video', 'photos', 'audio') then raise exception 'invalid_mode'; end if;
  if v_vis not in ('public', 'fan_club', 'private') then raise exception 'invalid_visibility'; end if;
  if v_host not in ('world', 'portal') then raise exception 'invalid_host'; end if;
  if v_host = 'portal' and p_portal_release_id is null then
    raise exception 'portal_required';
  end if;

  if exists (
    select 1 from public.rect_lives where artist_id = v_uid and status = 'live'
  ) then
    raise exception 'rect_live_active';
  end if;

  select id into v_existing
  from public.live_rooms
  where artist_id = v_uid and status = 'live'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'live_room_id', v_existing, 'skipped', 'already_live');
  end if;

  insert into public.live_rooms (
    artist_id, title, status, mode, visibility, host, portal_release_id,
    country, city, neighborhood, started_at, updated_at
  )
  values (
    v_uid, v_title, 'live', v_mode, v_vis, v_host, p_portal_release_id,
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_neighborhood, '')), ''),
    now(), now()
  )
  returning id into v_id;

  begin
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, live_room_id
    )
    select f.follower_id, v_uid, 'live_room', left(v_title, 200), v_id
    from public.artist_follows f
    where f.artist_id = v_uid and f.follower_id <> v_uid
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
    'host', v_host,
    'status', 'live'
  );
end;
$$;

-- Drop old 6-arg overload if present, grant new 8-arg
drop function if exists public.start_live_room(text, text, text, text, text, text);
revoke all on function public.start_live_room(text, text, text, text, text, text, text, uuid) from public;
grant execute on function public.start_live_room(text, text, text, text, text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
