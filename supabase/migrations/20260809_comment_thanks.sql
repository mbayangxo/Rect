-- ============================================================
-- Artist thanks a fan for a track comment (owner path)
-- Stores comment_id on listen-style comment notifs
-- Requires track_comments + tracks + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists comment_id bigint;

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
    'comment_thanks',
    'mix_thanks',
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

create table if not exists public.comment_thanks (
  comment_id bigint not null references public.track_comments (id) on delete cascade,
  thanker_id uuid not null references auth.users (id) on delete cascade,
  commenter_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, thanker_id),
  constraint comment_thanks_message_len check (char_length(message) <= 280),
  constraint comment_thanks_not_self check (thanker_id <> commenter_id)
);

create index if not exists comment_thanks_commenter_created_idx
  on public.comment_thanks (commenter_id, created_at desc);

alter table public.comment_thanks enable row level security;

drop policy if exists "comment_thanks_select_own" on public.comment_thanks;
create policy "comment_thanks_select_own"
  on public.comment_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or commenter_id = auth.uid());

drop policy if exists "comment_thanks_insert_own" on public.comment_thanks;
create policy "comment_thanks_insert_own"
  on public.comment_thanks for insert
  to authenticated
  with check (thanker_id = auth.uid());

drop function if exists public.notify_track_comment(text, text);
drop function if exists public.notify_track_comment(text, text, bigint);

create or replace function public.notify_track_comment(
  p_track_id text,
  p_comment_preview text default null,
  p_comment_id bigint default null
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
  v_id bigint;
  v_body text;
  v_comment bigint := p_comment_id;
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

  if v_comment is null then
    select c.id
    into v_comment
    from public.track_comments c
    where c.track_id = trim(p_track_id)
      and c.user_id = v_uid
    order by c.created_at desc
    limit 1;
  end if;

  v_body := coalesce(
    nullif(trim(p_comment_preview), ''),
    coalesce(nullif(trim(v_title), ''), 'your track')
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'comment'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'comment_id', v_comment
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, comment_id
  )
  values (
    v_artist,
    v_uid,
    'comment',
    left(v_body, 200),
    trim(p_track_id),
    v_comment
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', trim(p_track_id),
    'comment_id', v_comment
  );
end;
$$;

revoke all on function public.notify_track_comment(text, text, bigint) from public;
grant execute on function public.notify_track_comment(text, text, bigint) to authenticated;

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
  v_message text;
  v_notif_id bigint;
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

  if v_artist is null or v_artist <> v_uid then
    raise exception 'not_track_owner';
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

notify pgrst, 'reload schema';
