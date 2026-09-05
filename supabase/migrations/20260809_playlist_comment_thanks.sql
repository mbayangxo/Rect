-- ============================================================
-- Owner thanks a fan for a playlist/mix comment
-- Stores playlist_comment_id on playlist_comment notifs
-- Requires playlist_comments + playlists + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists playlist_comment_id bigint;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create table if not exists public.playlist_comment_thanks (
  comment_id bigint not null references public.playlist_comments (id) on delete cascade,
  thanker_id uuid not null references auth.users (id) on delete cascade,
  commenter_id uuid not null references auth.users (id) on delete cascade,
  playlist_id uuid not null,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, thanker_id),
  constraint playlist_comment_thanks_message_len check (char_length(message) <= 280),
  constraint playlist_comment_thanks_not_self check (thanker_id <> commenter_id)
);

create index if not exists playlist_comment_thanks_commenter_created_idx
  on public.playlist_comment_thanks (commenter_id, created_at desc);

alter table public.playlist_comment_thanks enable row level security;

drop policy if exists "playlist_comment_thanks_select_own" on public.playlist_comment_thanks;
create policy "playlist_comment_thanks_select_own"
  on public.playlist_comment_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or commenter_id = auth.uid());

drop policy if exists "playlist_comment_thanks_insert_own" on public.playlist_comment_thanks;
create policy "playlist_comment_thanks_insert_own"
  on public.playlist_comment_thanks for insert
  to authenticated
  with check (thanker_id = auth.uid());

drop function if exists public.notify_playlist_comment(uuid, text);
drop function if exists public.notify_playlist_comment(uuid, text, bigint);

create or replace function public.notify_playlist_comment(
  p_playlist_id uuid,
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
  v_owner uuid;
  v_name text;
  v_id bigint;
  v_body text;
  v_comment bigint := p_comment_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner is null or v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self_or_no_owner');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if v_comment is null then
    select c.id
    into v_comment
    from public.playlist_comments c
    where c.playlist_id = p_playlist_id
      and c.user_id = v_uid
    order by c.created_at desc
    limit 1;
  end if;

  v_body := nullif(trim(coalesce(p_comment_preview, '')), '');
  if v_body is not null and char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;
  if v_body is null then
    v_body := coalesce(nullif(trim(v_name), ''), 'your playlist');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'playlist_comment_id', v_comment
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_comment',
    v_body,
    p_playlist_id,
    v_comment
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'playlist_comment_id', v_comment
  );
end;
$$;

revoke all on function public.notify_playlist_comment(uuid, text, bigint) from public;
grant execute on function public.notify_playlist_comment(uuid, text, bigint) to authenticated;

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

  if v_owner is null or v_owner <> v_uid then
    raise exception 'not_playlist_owner';
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
