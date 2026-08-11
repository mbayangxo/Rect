-- ============================================================
-- Reply thanks — store reply comment ids + allow parent to thank
-- Requires comment_thanks + playlist_comment_thanks migrations
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists comment_id bigint;

alter table public.artist_notifications
  add column if not exists playlist_comment_id bigint;

-- Track comment reply notify: store the reply's comment_id
drop function if exists public.notify_comment_reply(bigint, text);
drop function if exists public.notify_comment_reply(bigint, text, bigint);

create or replace function public.notify_comment_reply(
  p_parent_comment_id bigint,
  p_reply_preview text default null,
  p_reply_comment_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_parent_user uuid;
  v_track_id text;
  v_id bigint;
  v_body text;
  v_reply bigint := p_reply_comment_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_parent_comment_id is null then
    raise exception 'parent_required';
  end if;

  select c.user_id, c.track_id
  into v_parent_user, v_track_id
  from public.track_comments c
  where c.id = p_parent_comment_id;

  if not found then
    raise exception 'parent_not_found';
  end if;

  if v_parent_user = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_parent_user)
          or (b.blocker_id = v_parent_user and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if v_reply is null then
    select c.id
    into v_reply
    from public.track_comments c
    where c.parent_id = p_parent_comment_id
      and c.user_id = v_uid
    order by c.created_at desc
    limit 1;
  end if;

  v_body := coalesce(
    nullif(trim(p_reply_preview), ''),
    'replied to your comment'
  );
  if char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;

  -- Soft-cap: refresh unread row so thanks targets the latest reply
  update public.artist_notifications n
  set body = v_body,
      comment_id = coalesce(v_reply, n.comment_id)
  where n.recipient_id = v_parent_user
    and n.actor_id = v_uid
    and n.kind = 'comment_reply'
    and n.track_id = v_track_id
    and n.read_at is null;

  if found then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'comment_id', v_reply
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, comment_id
  )
  values (
    v_parent_user,
    v_uid,
    'comment_reply',
    v_body,
    v_track_id,
    v_reply
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', v_track_id,
    'comment_id', v_reply,
    'recipient_id', v_parent_user
  );
end;
$$;

revoke all on function public.notify_comment_reply(bigint, text, bigint) from public;
grant execute on function public.notify_comment_reply(bigint, text, bigint) to authenticated;

-- Playlist comment reply notify: store the reply's playlist_comment_id
drop function if exists public.notify_playlist_comment_reply(bigint, text);
drop function if exists public.notify_playlist_comment_reply(bigint, text, bigint);

create or replace function public.notify_playlist_comment_reply(
  p_parent_comment_id bigint,
  p_reply_preview text default null,
  p_reply_comment_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_parent_user uuid;
  v_playlist_id uuid;
  v_id bigint;
  v_body text;
  v_reply bigint := p_reply_comment_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_parent_comment_id is null then
    raise exception 'parent_required';
  end if;

  select c.user_id, c.playlist_id
  into v_parent_user, v_playlist_id
  from public.playlist_comments c
  where c.id = p_parent_comment_id;

  if not found then
    raise exception 'parent_not_found';
  end if;

  if v_parent_user = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_parent_user)
          or (b.blocker_id = v_parent_user and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if v_reply is null then
    select c.id
    into v_reply
    from public.playlist_comments c
    where c.parent_id = p_parent_comment_id
      and c.user_id = v_uid
    order by c.created_at desc
    limit 1;
  end if;

  v_body := coalesce(
    nullif(trim(p_reply_preview), ''),
    'replied to your comment'
  );
  if char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;

  update public.artist_notifications n
  set body = v_body,
      playlist_comment_id = coalesce(v_reply, n.playlist_comment_id)
  where n.recipient_id = v_parent_user
    and n.actor_id = v_uid
    and n.kind = 'playlist_comment_reply'
    and n.playlist_id = v_playlist_id
    and n.read_at is null;

  if found then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'playlist_comment_id', v_reply
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_parent_user,
    v_uid,
    'playlist_comment_reply',
    v_body,
    v_playlist_id,
    v_reply
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'playlist_comment_id', v_reply
  );
end;
$$;

revoke all on function public.notify_playlist_comment_reply(bigint, text, bigint) from public;
grant execute on function public.notify_playlist_comment_reply(bigint, text, bigint) to authenticated;

-- Parent comment author (or track owner) may thank a reply
create or replace function public.send_comment_thanks(
  p_comment_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment public.track_comments%rowtype;
  v_artist uuid;
  v_parent_user uuid;
  v_message text;
  v_notif_id bigint;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select * into v_comment
  from public.track_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  if v_comment.user_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = v_comment.track_id;

  if v_artist is not null and v_artist = v_uid then
    v_allowed := true;
  elsif v_comment.parent_id is not null then
    select c.user_id into v_parent_user
    from public.track_comments c
    where c.id = v_comment.parent_id;
    if v_parent_user is not null and v_parent_user = v_uid then
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    raise exception 'not_allowed';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_comment.user_id)
          or (b.blocker_id = v_comment.user_id and b.blocked_id = v_uid)
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
    select 1 from public.comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.comment_thanks (
    comment_id, thanker_id, commenter_id, track_id, message
  )
  values (
    p_comment_id, v_uid, v_comment.user_id, v_comment.track_id, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_comment.user_id
      and n.actor_id = v_uid
      and n.kind = 'comment_thanks'
      and n.comment_id = p_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, comment_id
  )
  values (
    v_comment.user_id,
    v_uid,
    'comment_thanks',
    v_message,
    v_comment.track_id,
    p_comment_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'comment_id', p_comment_id,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_comment_thanks(bigint, text) from public;
grant execute on function public.send_comment_thanks(bigint, text) to authenticated;

-- Parent comment author (or playlist owner) may thank a mix reply
create or replace function public.send_playlist_comment_thanks(
  p_comment_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment public.playlist_comments%rowtype;
  v_owner uuid;
  v_parent_user uuid;
  v_message text;
  v_notif_id bigint;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select * into v_comment
  from public.playlist_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  if v_comment.user_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = v_comment.playlist_id;

  if v_owner is not null and v_owner = v_uid then
    v_allowed := true;
  elsif v_comment.parent_id is not null then
    select c.user_id into v_parent_user
    from public.playlist_comments c
    where c.id = v_comment.parent_id;
    if v_parent_user is not null and v_parent_user = v_uid then
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    raise exception 'not_allowed';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_comment.user_id)
          or (b.blocker_id = v_comment.user_id and b.blocked_id = v_uid)
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
    select 1 from public.playlist_comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.playlist_comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.playlist_comment_thanks (
    comment_id, thanker_id, commenter_id, playlist_id, message
  )
  values (
    p_comment_id, v_uid, v_comment.user_id, v_comment.playlist_id, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_comment.user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment_thanks'
      and n.playlist_comment_id = p_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_comment.user_id,
    v_uid,
    'playlist_comment_thanks',
    v_message,
    v_comment.playlist_id,
    p_comment_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'comment_id', p_comment_id,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_playlist_comment_thanks(bigint, text) from public;
grant execute on function public.send_playlist_comment_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';
