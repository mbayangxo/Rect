-- ============================================================
-- Thanks on a friend's public like
-- Requires track_likes + people_follows + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.like_thanks (
  thanker_id uuid not null references auth.users (id) on delete cascade,
  liker_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (thanker_id, liker_id, track_id),
  constraint like_thanks_message_len check (char_length(message) <= 280),
  constraint like_thanks_not_self check (thanker_id <> liker_id)
);

create index if not exists like_thanks_liker_created_idx
  on public.like_thanks (liker_id, created_at desc);

alter table public.like_thanks enable row level security;

drop policy if exists "like_thanks_select_own" on public.like_thanks;
create policy "like_thanks_select_own"
  on public.like_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or liker_id = auth.uid());

drop policy if exists "like_thanks_insert_own" on public.like_thanks;
create policy "like_thanks_insert_own"
  on public.like_thanks for insert
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
    'like_thanks',
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

  if to_regclass('public.people_follows') is null
     or not exists (
       select 1 from public.people_follows f
       where f.follower_id = v_uid and f.person_id = p_liker_id
     ) then
    raise exception 'not_following';
  end if;

  if not exists (
    select 1 from public.track_likes l
    where l.user_id = p_liker_id and l.track_id::text = v_track
  ) then
    raise exception 'like_not_found';
  end if;

  select coalesce(u.privacy_show_likes, false)
  into v_share
  from public.users u
  where u.id = p_liker_id;

  if not found or v_share is not true then
    raise exception 'privacy';
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
