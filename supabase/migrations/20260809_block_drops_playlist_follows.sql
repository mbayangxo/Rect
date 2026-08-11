-- ============================================================
-- Block also drops playlist follows + gates new mix saves
-- Requires user_blocks + playlist_follows + playlists
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.toggle_user_block(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_user_id is null then
    raise exception 'user_required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_block_self';
  end if;

  select exists (
    select 1 from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id
  ) into v_exists;

  if v_exists then
    delete from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id;
    return jsonb_build_object(
      'blocked', false,
      'user_id', p_user_id
    );
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id)
  on conflict do nothing;

  -- Drop people-follow edges both ways
  if to_regclass('public.people_follows') is not null then
    delete from public.people_follows
    where (follower_id = v_uid and person_id = p_user_id)
       or (follower_id = p_user_id and person_id = v_uid);
  end if;

  -- Drop artist-follow edges both ways
  if to_regclass('public.artist_follows') is not null then
    delete from public.artist_follows
    where (follower_id = v_uid and artist_id = p_user_id)
       or (follower_id = p_user_id and artist_id = v_uid);
  end if;

  -- Drop mix saves where either person follows the other's playlists
  if to_regclass('public.playlist_follows') is not null
     and to_regclass('public.playlists') is not null then
    delete from public.playlist_follows pf
    using public.playlists p
    where pf.playlist_id = p.id
      and (
        (pf.follower_id = v_uid and p.user_id = p_user_id)
        or (pf.follower_id = p_user_id and p.user_id = v_uid)
      );
  end if;

  return jsonb_build_object(
    'blocked', true,
    'user_id', p_user_id
  );
end;
$$;

revoke all on function public.toggle_user_block(uuid) from public;
grant execute on function public.toggle_user_block(uuid) to authenticated;

create or replace function public.toggle_playlist_follow(p_playlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count bigint;
  v_owner uuid;
  v_public boolean;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select exists (
    select 1 from public.playlist_follows
    where follower_id = v_uid and playlist_id = p_playlist_id
  ) into v_exists;

  if v_exists then
    delete from public.playlist_follows
    where follower_id = v_uid and playlist_id = p_playlist_id;
  else
    select p.user_id, p.is_public, p.name
    into v_owner, v_public, v_name
    from public.playlists p
    where p.id = p_playlist_id;

    if not found then
      raise exception 'playlist_not_found';
    end if;

    if v_owner = v_uid then
      raise exception 'cannot_follow_own';
    end if;

    if v_public is distinct from true then
      raise exception 'playlist_private';
    end if;

    if to_regclass('public.user_blocks') is not null
       and public.users_are_blocked(v_uid, v_owner) then
      raise exception 'blocked';
    end if;

    insert into public.playlist_follows (follower_id, playlist_id)
    values (v_uid, p_playlist_id)
    on conflict do nothing;
  end if;

  select count(*) into v_count
  from public.playlist_follows
  where playlist_id = p_playlist_id;

  return jsonb_build_object(
    'following', not v_exists,
    'playlist_id', p_playlist_id,
    'follower_count', v_count
  );
end;
$$;

revoke all on function public.toggle_playlist_follow(uuid) from public;
grant execute on function public.toggle_playlist_follow(uuid) to authenticated;

create or replace function public.notify_playlist_follow(p_playlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_owner uuid;
  v_public boolean;
  v_name text;
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

  if v_owner = v_uid then
    raise exception 'cannot_notify_self';
  end if;

  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private');
  end if;

  if to_regclass('public.user_blocks') is not null
     and public.users_are_blocked(v_uid, v_owner) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_follow'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_follow',
    coalesce(nullif(trim(v_name), ''), 'your playlist'),
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_follow(uuid) from public;
grant execute on function public.notify_playlist_follow(uuid) to authenticated;

create or replace function public.notify_playlist_followers_track_add(
  p_playlist_id uuid,
  p_track_id text
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
  v_title text;
  v_body text;
  v_notified integer := 0;
  v_skipped integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private', 'notified', 0);
  end if;

  if v_owner <> v_uid then
    if not public.is_accepted_playlist_collaborator(p_playlist_id, v_uid) then
      raise exception 'not_allowed';
    end if;
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  v_body := coalesce(nullif(trim(v_title), ''), 'a track')
    || ' · '
    || coalesce(nullif(trim(v_name), ''), 'playlist');

  for r in
    select f.follower_id
    from public.playlist_follows f
    where f.playlist_id = p_playlist_id
      and f.follower_id <> v_uid
    order by f.created_at desc
    limit 40
  loop
    if to_regclass('public.user_blocks') is not null
       and public.users_are_blocked(v_uid, r.follower_id) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = r.follower_id
        and n.kind = 'playlist_track_add'
        and n.playlist_id = p_playlist_id
        and n.track_id = trim(p_track_id)
        and n.read_at is null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id, track_id
    )
    values (
      r.follower_id,
      v_uid,
      'playlist_track_add',
      left(v_body, 280),
      p_playlist_id,
      trim(p_track_id)
    );
    v_notified := v_notified + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'notified', v_notified,
    'skipped_unread', v_skipped
  );
end;
$$;

revoke all on function public.notify_playlist_followers_track_add(uuid, text) from public;
grant execute on function public.notify_playlist_followers_track_add(uuid, text) to authenticated;

notify pgrst, 'reload schema';
