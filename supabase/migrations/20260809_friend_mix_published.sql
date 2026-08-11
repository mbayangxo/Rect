-- ============================================================
-- Friend mix published → notify people who follow you
-- Requires people_follows + playlists.is_public + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

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
    'friend_mix',
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

create or replace function public.notify_friend_mix_published(
  p_playlist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
  v_name text;
  v_body text;
  v_notified integer := 0;
  v_skipped integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner is distinct from v_uid then
    raise exception 'not_owner';
  end if;

  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private', 'notified', 0);
  end if;

  if to_regclass('public.people_follows') is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_follows', 'notified', 0);
  end if;

  v_body := coalesce(nullif(trim(v_name), ''), 'a new mix');

  for r in
    select f.follower_id
    from public.people_follows f
    where f.person_id = v_uid
      and f.follower_id <> v_uid
    order by f.created_at desc
    limit 40
  loop
    if to_regclass('public.user_blocks') is not null
       and exists (
         select 1 from public.user_blocks b
         where (b.blocker_id = v_uid and b.blocked_id = r.follower_id)
            or (b.blocker_id = r.follower_id and b.blocked_id = v_uid)
       ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = r.follower_id
        and n.actor_id = v_uid
        and n.kind = 'friend_mix'
        and n.playlist_id = p_playlist_id
        and n.read_at is null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      r.follower_id,
      v_uid,
      'friend_mix',
      v_body,
      p_playlist_id
    );
    v_notified := v_notified + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'notified', v_notified,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.notify_friend_mix_published(uuid) from public;
grant execute on function public.notify_friend_mix_published(uuid) to authenticated;

notify pgrst, 'reload schema';
