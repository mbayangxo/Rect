-- ============================================================
-- Playlist comment replies + likes — paste in Supabase SQL Editor → Run
-- Requires 20260809_playlist_comments.sql
-- ============================================================

alter table public.playlist_comments
  add column if not exists parent_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'playlist_comments_parent_fk'
  ) then
    alter table public.playlist_comments
      add constraint playlist_comments_parent_fk
      foreign key (parent_id)
      references public.playlist_comments (id)
      on delete cascade;
  end if;
end $$;

create index if not exists playlist_comments_parent_id_idx
  on public.playlist_comments (parent_id)
  where parent_id is not null;

create table if not exists public.playlist_comment_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  comment_id bigint not null references public.playlist_comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create index if not exists playlist_comment_likes_comment_id_idx
  on public.playlist_comment_likes (comment_id);

alter table public.playlist_comment_likes enable row level security;

drop policy if exists "playlist_comment_likes_select" on public.playlist_comment_likes;
create policy "playlist_comment_likes_select"
  on public.playlist_comment_likes for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.playlist_comments c
      where c.id = comment_id
    )
  );

drop policy if exists "playlist_comment_likes_insert_own" on public.playlist_comment_likes;
create policy "playlist_comment_likes_insert_own"
  on public.playlist_comment_likes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "playlist_comment_likes_delete_own" on public.playlist_comment_likes;
create policy "playlist_comment_likes_delete_own"
  on public.playlist_comment_likes for delete
  to authenticated
  using (user_id = auth.uid());

alter table public.artist_notifications
  add column if not exists playlist_comment_id bigint;

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
    'playlist_collab_invite',
    'playlist_collab_accepted',
    'playlist_collab_add',
    'comment_like',
    'playlist_track_add',
    'playlist_comment',
    'playlist_comment_reply',
    'playlist_comment_like'
  ));

create or replace function public.notify_playlist_comment_reply(
  p_parent_comment_id bigint,
  p_reply_preview text default null
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

  v_body := coalesce(
    nullif(trim(p_reply_preview), ''),
    'replied to your comment'
  );
  if char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_parent_user
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment_reply'
      and n.playlist_id = v_playlist_id
      and n.playlist_comment_id = p_parent_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
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
    p_parent_comment_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_comment_reply(bigint, text) from public;
grant execute on function public.notify_playlist_comment_reply(bigint, text) to authenticated;

create or replace function public.toggle_playlist_comment_like(p_comment_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count integer;
  v_author uuid;
  v_playlist uuid;
  v_snippet text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select c.user_id, c.playlist_id, left(trim(c.body), 80)
  into v_author, v_playlist, v_snippet
  from public.playlist_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  select exists (
    select 1 from public.playlist_comment_likes
    where user_id = v_uid and comment_id = p_comment_id
  ) into v_exists;

  if v_exists then
    delete from public.playlist_comment_likes
    where user_id = v_uid and comment_id = p_comment_id;

    select count(*)::integer into v_count
    from public.playlist_comment_likes
    where comment_id = p_comment_id;

    return jsonb_build_object(
      'liked', false,
      'comment_id', p_comment_id,
      'like_count', coalesce(v_count, 0)
    );
  end if;

  insert into public.playlist_comment_likes (user_id, comment_id)
  values (v_uid, p_comment_id)
  on conflict do nothing;

  select count(*)::integer into v_count
  from public.playlist_comment_likes
  where comment_id = p_comment_id;

  if v_author is not null and v_author <> v_uid then
    if not (
      to_regclass('public.user_blocks') is not null
      and exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = v_uid and b.blocked_id = v_author)
           or (b.blocker_id = v_author and b.blocked_id = v_uid)
      )
    ) then
      if not exists (
        select 1 from public.artist_notifications n
        where n.recipient_id = v_author
          and n.actor_id = v_uid
          and n.kind = 'playlist_comment_like'
          and n.playlist_comment_id = p_comment_id
          and n.read_at is null
      ) then
        insert into public.artist_notifications (
          recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
        )
        values (
          v_author,
          v_uid,
          'playlist_comment_like',
          coalesce(nullif(v_snippet, ''), 'your comment'),
          v_playlist,
          p_comment_id
        )
        returning id into v_notif_id;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'liked', true,
    'comment_id', p_comment_id,
    'like_count', coalesce(v_count, 0),
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.toggle_playlist_comment_like(bigint) from public;
grant execute on function public.toggle_playlist_comment_like(bigint) to authenticated;

notify pgrst, 'reload schema';
