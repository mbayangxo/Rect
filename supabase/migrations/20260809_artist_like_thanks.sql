-- ============================================================
-- Artist can thank a fan for liking (owner path)
-- send_like_thanks: track owner OR people-follow
-- Requires tracks + track_likes + like_thanks + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.send_like_thanks(
  p_liker_id uuid,
  p_track_id text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_is_owner boolean := false;
  v_share boolean;
  v_message text;
  v_track text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_liker_id is null then
    raise exception 'liker_required';
  end if;

  v_track := trim(coalesce(p_track_id, ''));
  if length(v_track) = 0 then
    raise exception 'track_required';
  end if;

  if p_liker_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = v_track;

  if not found then
    raise exception 'track_not_found';
  end if;

  v_is_owner := v_artist is not null and v_artist = v_uid;

  if not v_is_owner then
    if to_regclass('public.people_follows') is null
       or not exists (
         select 1 from public.people_follows f
         where f.follower_id = v_uid and f.person_id = p_liker_id
       ) then
      raise exception 'not_following';
    end if;
  end if;

  if not exists (
    select 1 from public.track_likes l
    where l.user_id = p_liker_id and l.track_id::text = v_track
  ) then
    raise exception 'like_not_found';
  end if;

  -- Friends feed: liker must opt into public likes.
  -- Owner path: artist already saw the like in studio / inbox.
  if not v_is_owner then
    select coalesce(u.privacy_show_likes, false)
    into v_share
    from public.users u
    where u.id = p_liker_id;

    if not found or v_share is not true then
      raise exception 'privacy';
    end if;
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_liker_id)
          or (b.blocker_id = p_liker_id and b.blocked_id = v_uid)
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

  if exists (
    select 1 from public.like_thanks t
    where t.thanker_id = v_uid
      and t.liker_id = p_liker_id
      and t.track_id = v_track
  ) then
    select t.message into v_message
    from public.like_thanks t
    where t.thanker_id = v_uid
      and t.liker_id = p_liker_id
      and t.track_id = v_track;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'liker_id', p_liker_id,
      'track_id', v_track
    );
  end if;

  insert into public.like_thanks (
    thanker_id, liker_id, track_id, message
  )
  values (
    v_uid, p_liker_id, v_track, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_liker_id
      and n.actor_id = v_uid
      and n.kind = 'like_thanks'
      and n.track_id is not distinct from v_track
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'liker_id', p_liker_id,
      'track_id', v_track
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    p_liker_id,
    v_uid,
    'like_thanks',
    v_message,
    v_track
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'liker_id', p_liker_id,
    'track_id', v_track,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_like_thanks(uuid, text, text) from public;
grant execute on function public.send_like_thanks(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
