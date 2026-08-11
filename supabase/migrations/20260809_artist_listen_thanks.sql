-- ============================================================
-- Artist can thank a fan for listening (owner path)
-- - listen notifs store play_id
-- - send_play_thanks allows track owner OR people-follow
-- Requires plays + tracks + play_thanks + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists play_id text;

drop function if exists public.notify_track_listen(text);
drop function if exists public.notify_track_listen(text, text);

create or replace function public.notify_track_listen(
  p_track_id text,
  p_play_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_share boolean;
  v_play text;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select
    nullif(trim(t.artist_id::text), '')::uuid,
    t.title
  into v_artist, v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_artist');
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  select coalesce(u.privacy_show_activity, true)
  into v_share
  from public.users u
  where u.id = v_uid;

  if not found or v_share is not true then
    return jsonb_build_object('ok', true, 'skipped', 'privacy');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_artist)
          or (b.blocker_id = v_artist and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  v_play := nullif(trim(coalesce(p_play_id, '')), '');
  if v_play is null then
    select p.id::text
    into v_play
    from public.plays p
    where p.track_id::text = trim(p_track_id)
      and p.listener_id = v_uid
    order by p.created_at desc nulls last
    limit 1;
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'listen'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'play_id', v_play
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, play_id
  )
  values (
    v_artist,
    v_uid,
    'listen',
    coalesce(nullif(trim(v_title), ''), 'your track'),
    trim(p_track_id),
    v_play
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', trim(p_track_id),
    'play_id', v_play
  );
end;
$$;

revoke all on function public.notify_track_listen(text, text) from public;
grant execute on function public.notify_track_listen(text, text) to authenticated;

create or replace function public.send_play_thanks(
  p_play_id text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_listener uuid;
  v_track text;
  v_artist uuid;
  v_is_owner boolean := false;
  v_share boolean;
  v_message text;
  v_notif_id bigint;
  v_existing text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_play_id is null or length(trim(p_play_id)) = 0 then
    raise exception 'play_required';
  end if;

  select
    p.listener_id,
    p.track_id::text
  into v_listener, v_track
  from public.plays p
  where p.id::text = trim(p_play_id);

  if not found then
    raise exception 'play_not_found';
  end if;

  if v_listener is null or v_listener = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = coalesce(v_track, '');

  v_is_owner := v_artist is not null and v_artist = v_uid;

  if not v_is_owner then
    if to_regclass('public.people_follows') is null
       or not exists (
         select 1 from public.people_follows f
         where f.follower_id = v_uid and f.person_id = v_listener
       ) then
      raise exception 'not_following';
    end if;
  end if;

  select coalesce(u.privacy_show_activity, true)
  into v_share
  from public.users u
  where u.id = v_listener;

  if not found or v_share is not true then
    raise exception 'privacy';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_listener)
          or (b.blocker_id = v_listener and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  -- One thanks per thanker + listener + track (any play)
  select t.message
  into v_existing
  from public.play_thanks t
  where t.thanker_id = v_uid
    and t.listener_id = v_listener
    and t.track_id is not distinct from v_track
  order by t.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_existing,
      'play_id', trim(p_play_id)
    );
  end if;

  insert into public.play_thanks (
    play_id, thanker_id, listener_id, track_id, message
  )
  values (
    trim(p_play_id), v_uid, v_listener, v_track, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_listener
      and n.actor_id = v_uid
      and n.kind = 'activity_thanks'
      and n.track_id is not distinct from v_track
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'play_id', trim(p_play_id),
      'listener_id', v_listener
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_listener,
    v_uid,
    'activity_thanks',
    v_message,
    v_track
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'play_id', trim(p_play_id),
    'listener_id', v_listener,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_play_thanks(text, text) from public;
grant execute on function public.send_play_thanks(text, text) to authenticated;

notify pgrst, 'reload schema';
