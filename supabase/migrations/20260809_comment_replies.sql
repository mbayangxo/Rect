-- ============================================================
-- Comment replies + fan notify — paste in Supabase SQL Editor → Run
-- Requires 20260809_track_comments.sql (+ later notification kinds)
-- ============================================================

alter table public.track_comments
  add column if not exists parent_id bigint;

-- Self-FK (one-level replies: parent must be top-level — enforced in app/RPC)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'track_comments_parent_fk'
  ) then
    alter table public.track_comments
      add constraint track_comments_parent_fk
      foreign key (parent_id)
      references public.track_comments (id)
      on delete cascade;
  end if;
end $$;

create index if not exists track_comments_parent_id_idx
  on public.track_comments (parent_id)
  where parent_id is not null;

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
    'comment_reply'
  ));

create or replace function public.notify_comment_reply(
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
  v_track_id text;
  v_id bigint;
  v_body text;
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

  v_body := coalesce(
    nullif(trim(p_reply_preview), ''),
    'replied to your comment'
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_parent_user
      and n.actor_id = v_uid
      and n.kind = 'comment_reply'
      and n.track_id = v_track_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_parent_user,
    v_uid,
    'comment_reply',
    left(v_body, 200),
    v_track_id
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', v_track_id,
    'recipient_id', v_parent_user
  );
end;
$$;

revoke all on function public.notify_comment_reply(bigint, text) from public;
grant execute on function public.notify_comment_reply(bigint, text) to authenticated;

notify pgrst, 'reload schema';
