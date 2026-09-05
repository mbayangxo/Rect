-- ============================================================
-- In-app send to friend — paste in Supabase SQL Editor → Run
-- Requires artist_notifications + people_follows
-- Optional: playlist_id on notifications (playlist follows migration)
-- ============================================================

alter table public.artist_notifications
  add column if not exists playlist_id uuid;

alter table public.artist_notifications
  add column if not exists track_id text;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_track_share(
  p_recipient_id uuid,
  p_track_id text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_title text;
  v_note text;
  v_follows boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_share_self';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_recipient_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id)
    and (
      t.status is null
      or t.status = 'published'
      or t.artist_id::text = v_uid::text
    );

  if not found then
    raise exception 'track_not_found';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 140 then
    v_note := left(v_note, 140);
  end if;

  -- One unread share per actor+track+recipient
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_recipient_id
      and n.actor_id = v_uid
      and n.kind = 'track_share'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    p_recipient_id,
    v_uid,
    'track_share',
    coalesce(v_note, coalesce(nullif(trim(v_title), ''), 'a track')),
    trim(p_track_id)
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', trim(p_track_id),
    'recipient_id', p_recipient_id
  );
end;
$$;

revoke all on function public.notify_track_share(uuid, text, text) from public;
grant execute on function public.notify_track_share(uuid, text, text) to authenticated;

create or replace function public.notify_playlist_share(
  p_recipient_id uuid,
  p_playlist_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_name text;
  v_public boolean;
  v_note text;
  v_follows boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_share_self';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_recipient_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select p.name, p.is_public
  into v_name, v_public
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 140 then
    v_note := left(v_note, 140);
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_recipient_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_share'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_recipient_id,
    v_uid,
    'playlist_share',
    coalesce(v_note, coalesce(nullif(trim(v_name), ''), 'a playlist')),
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'playlist_id', p_playlist_id,
    'recipient_id', p_recipient_id
  );
end;
$$;

revoke all on function public.notify_playlist_share(uuid, uuid, text) from public;
grant execute on function public.notify_playlist_share(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
