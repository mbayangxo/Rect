-- ============================================================
-- Share thanks — thank someone who sent you a track/mix
-- Requires send_to_friend + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (kind in (
    'follow',
    'tip',
    'release',
    'like',
    'comment',
    'people_follow',
    'playlist_follow',
    'track_share',
    'playlist_share',
    'comment_reply',
    'tip_thanks',
    'share_thanks',
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'playlist_collab_declined',
    'playlist_collab_left',
    'playlist_collab_removed',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.send_share_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind not in ('track_share', 'playlist_share') then
    raise exception 'not_a_share';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_sharer';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  -- Respect blocks
  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
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

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = 'share_thanks'
      and n.read_at is null
      and (
        (v_n.kind = 'track_share' and n.track_id is not distinct from v_n.track_id)
        or (v_n.kind = 'playlist_share' and n.playlist_id is not distinct from v_n.playlist_id)
      )
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, playlist_id
  )
  values (
    v_n.actor_id,
    v_uid,
    'share_thanks',
    v_message,
    v_n.track_id,
    v_n.playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id
  );
end;
$$;

revoke all on function public.send_share_thanks(bigint, text) from public;
grant execute on function public.send_share_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';
