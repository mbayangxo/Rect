-- ============================================================
-- Thanks on a friend's shared listen (play activity)
-- Requires plays + people_follows + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.play_thanks (
  play_id text not null,
  thanker_id uuid not null references auth.users (id) on delete cascade,
  listener_id uuid not null references auth.users (id) on delete cascade,
  track_id text,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (play_id, thanker_id),
  constraint play_thanks_message_len check (char_length(message) <= 280),
  constraint play_thanks_not_self check (thanker_id <> listener_id)
);

create index if not exists play_thanks_listener_created_idx
  on public.play_thanks (listener_id, created_at desc);

alter table public.play_thanks enable row level security;

drop policy if exists "play_thanks_select_own" on public.play_thanks;
create policy "play_thanks_select_own"
  on public.play_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or listener_id = auth.uid());

drop policy if exists "play_thanks_insert_own" on public.play_thanks;
create policy "play_thanks_insert_own"
  on public.play_thanks for insert
  to authenticated
  with check (thanker_id = auth.uid());

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
    'activity_thanks',
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
  v_share boolean;
  v_message text;
  v_notif_id bigint;
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

  -- Must follow the listener (friends feed)
  if to_regclass('public.people_follows') is null
     or not exists (
       select 1 from public.people_follows f
       where f.follower_id = v_uid and f.person_id = v_listener
     ) then
    raise exception 'not_following';
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

  if exists (
    select 1 from public.play_thanks t
    where t.play_id = trim(p_play_id) and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.play_thanks t
    where t.play_id = trim(p_play_id) and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'play_id', trim(p_play_id)
    );
  end if;

  insert into public.play_thanks (
    play_id, thanker_id, listener_id, track_id, message
  )
  values (
    trim(p_play_id), v_uid, v_listener, v_track, v_message
  );

  -- Soft-cap: one unread activity_thanks per actor+track
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
