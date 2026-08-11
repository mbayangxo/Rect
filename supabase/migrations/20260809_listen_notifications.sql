-- ============================================================
-- Soft-notify artist when an opted-in listener plays a track
-- Respects privacy_show_activity + user_blocks; unread dedupe
-- Requires artist_notifications + tracks + users
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'listen',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'friend_mix',
    'playlist_copy',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'playlist_collab_request',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.notify_track_listen(p_track_id text)
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

  -- Settings promise: only named when Listening activity is on
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

  -- One unread listen notice per actor+track (avoid play spam)
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'listen'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_artist,
    v_uid,
    'listen',
    coalesce(nullif(trim(v_title), ''), 'your track'),
    trim(p_track_id)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'track_id', trim(p_track_id));
end;
$$;

revoke all on function public.notify_track_listen(text) from public;
grant execute on function public.notify_track_listen(text) to authenticated;

notify pgrst, 'reload schema';
