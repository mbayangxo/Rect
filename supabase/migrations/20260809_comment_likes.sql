-- ============================================================
-- Comment likes — paste in Supabase SQL Editor → Run
-- Requires track_comments + artist_notifications
-- ============================================================

create table if not exists public.comment_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  comment_id bigint not null references public.track_comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create index if not exists comment_likes_comment_id_idx
  on public.comment_likes (comment_id);

create index if not exists comment_likes_user_created_idx
  on public.comment_likes (user_id, created_at desc);

alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes_select_own" on public.comment_likes;
create policy "comment_likes_select_own"
  on public.comment_likes for select
  to authenticated
  using (user_id = auth.uid());

-- Anyone signed in can count likes on readable comments
drop policy if exists "comment_likes_select_counts" on public.comment_likes;
create policy "comment_likes_select_counts"
  on public.comment_likes for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.track_comments c
      where c.id = comment_likes.comment_id
    )
  );

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own"
  on public.comment_likes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own"
  on public.comment_likes for delete
  to authenticated
  using (user_id = auth.uid());

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
    'comment_like'
  ));

create or replace function public.toggle_comment_like(p_comment_id bigint)
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
  v_track text;
  v_snippet text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select c.user_id, c.track_id, left(trim(c.body), 80)
  into v_author, v_track, v_snippet
  from public.track_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  select exists (
    select 1 from public.comment_likes
    where user_id = v_uid and comment_id = p_comment_id
  ) into v_exists;

  if v_exists then
    delete from public.comment_likes
    where user_id = v_uid and comment_id = p_comment_id;

    select count(*)::integer into v_count
    from public.comment_likes
    where comment_id = p_comment_id;

    return jsonb_build_object(
      'liked', false,
      'comment_id', p_comment_id,
      'like_count', coalesce(v_count, 0)
    );
  end if;

  insert into public.comment_likes (user_id, comment_id)
  values (v_uid, p_comment_id)
  on conflict do nothing;

  select count(*)::integer into v_count
  from public.comment_likes
  where comment_id = p_comment_id;

  -- Soft-notify comment author (not self)
  if v_author is not null and v_author <> v_uid then
    if not exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = v_author
        and n.actor_id = v_uid
        and n.kind = 'comment_like'
        and n.comment_id = p_comment_id
        and n.read_at is null
    ) then
      insert into public.artist_notifications (
        recipient_id, actor_id, kind, body, track_id, comment_id
      )
      values (
        v_author,
        v_uid,
        'comment_like',
        coalesce(nullif(v_snippet, ''), 'your comment'),
        v_track,
        p_comment_id
      )
      returning id into v_notif_id;
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

revoke all on function public.toggle_comment_like(bigint) from public;
grant execute on function public.toggle_comment_like(bigint) to authenticated;

notify pgrst, 'reload schema';
