-- ============================================================
-- Live Rooms hardening — visibility, notifs, kind check
-- Apply AFTER 20260830_live_rooms.sql
-- ============================================================

-- Deep-link for Hearing Aid / inbox
alter table public.artist_notifications
  add column if not exists live_room_id uuid;

create index if not exists artist_notifications_live_room_idx
  on public.artist_notifications (live_room_id)
  where live_room_id is not null;

-- Restore kind check including live_room (best-effort; widen list)
alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

-- Tighter SELECT: don't leak private / fan_club content to everyone
drop policy if exists "live_rooms_select_visible" on public.live_rooms;
create policy "live_rooms_select_visible"
  on public.live_rooms for select
  to authenticated, anon
  using (
    artist_id = auth.uid()
    or (
      status in ('live', 'ended')
      and visibility = 'public'
    )
    or (
      status in ('live', 'ended')
      and visibility = 'fan_club'
      and auth.uid() is not null
      and (
        artist_id = auth.uid()
        or exists (
          select 1 from public.fan_club_members m
          where m.artist_id = live_rooms.artist_id
            and m.fan_id = auth.uid()
            and m.status = 'active'
            and (m.expires_at is null or m.expires_at > now())
        )
      )
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
        and (
          r.artist_id = auth.uid()
          or (
            r.status in ('live', 'ended')
            and r.visibility = 'public'
          )
          or (
            r.status in ('live', 'ended')
            and r.visibility = 'fan_club'
            and auth.uid() is not null
            and exists (
              select 1 from public.fan_club_members m
              where m.artist_id = r.artist_id
                and m.fan_id = auth.uid()
                and m.status = 'active'
                and (m.expires_at is null or m.expires_at > now())
            )
          )
        )
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
        and (
          r.artist_id = auth.uid()
          or (
            r.status in ('live', 'ended')
            and r.visibility = 'public'
          )
          or (
            r.status in ('live', 'ended')
            and r.visibility = 'fan_club'
            and auth.uid() is not null
            and exists (
              select 1 from public.fan_club_members m
              where m.artist_id = r.artist_id
                and m.fan_id = auth.uid()
                and m.status = 'active'
                and (m.expires_at is null or m.expires_at > now())
            )
          )
        )
    )
  );

-- Fix start_live_room to store live_room_id on notifications
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
  v_mode text := lower(trim(coalesce(p_mode, 'photos')));
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

  begin
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, live_room_id
    )
    select f.follower_id, v_uid, 'live_room', left(v_title, 200), v_id
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

-- Validate photo URLs (https only)
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
  if length(v_url) < 12 then raise exception 'photo_required'; end if;
  if v_url !~* '^https://' then raise exception 'photo_https_required'; end if;

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

notify pgrst, 'reload schema';
