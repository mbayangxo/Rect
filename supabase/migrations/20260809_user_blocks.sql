-- ============================================================
-- User blocks — paste in Supabase SQL Editor → Run
-- Requires people_follows (optional hard-enforce on follow/share/invite)
-- ============================================================

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own"
  on public.user_blocks for select
  to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

drop policy if exists "user_blocks_insert_own" on public.user_blocks;
create policy "user_blocks_insert_own"
  on public.user_blocks for insert
  to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "user_blocks_delete_own" on public.user_blocks;
create policy "user_blocks_delete_own"
  on public.user_blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

create or replace function public.users_are_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke all on function public.users_are_blocked(uuid, uuid) from public;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;

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
  delete from public.people_follows
  where (follower_id = v_uid and person_id = p_user_id)
     or (follower_id = p_user_id and person_id = v_uid);

  return jsonb_build_object(
    'blocked', true,
    'user_id', p_user_id
  );
end;
$$;

revoke all on function public.toggle_user_block(uuid) from public;
grant execute on function public.toggle_user_block(uuid) to authenticated;

-- Enforce on people follow
create or replace function public.toggle_people_follow(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count bigint;
  v_public boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_person_id is null then
    raise exception 'person_required';
  end if;

  if p_person_id = v_uid then
    raise exception 'cannot_follow_self';
  end if;

  select exists (
    select 1 from public.people_follows
    where follower_id = v_uid and person_id = p_person_id
  ) into v_exists;

  if v_exists then
    delete from public.people_follows
    where follower_id = v_uid and person_id = p_person_id;
  else
    if public.users_are_blocked(v_uid, p_person_id) then
      raise exception 'blocked';
    end if;

    select coalesce(privacy_public_profile, true)
    into v_public
    from public.users
    where id = p_person_id;

    if not found then
      raise exception 'person_not_found';
    end if;

    if v_public is distinct from true then
      raise exception 'profile_private';
    end if;

    insert into public.people_follows (follower_id, person_id)
    values (v_uid, p_person_id)
    on conflict do nothing;
  end if;

  select count(*) into v_count
  from public.people_follows
  where person_id = p_person_id;

  return jsonb_build_object(
    'following', not v_exists,
    'person_id', p_person_id,
    'follower_count', v_count
  );
end;
$$;

-- Enforce on collab invite (no-op replace if function missing — create or replace)
create or replace function public.invite_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid
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
  v_follows boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_invite_self';
  end if;

  if public.users_are_blocked(v_uid, p_user_id) then
    raise exception 'blocked';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_invite_owner';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_user_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found and v_existing = 'pending' then
    null;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status
    )
    values (p_playlist_id, p_user_id, v_uid, 'pending');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_invite'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'status', 'pending'
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_user_id,
    v_uid,
    'playlist_collab_invite',
    coalesce(nullif(trim(v_name), ''), 'a playlist'),
    p_playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'notification_id', v_notif_id
  );
end;
$$;

-- Soft-patch share RPCs with block check (recreate bodies from send_to_friend)
create or replace function public.notify_track_share(
  p_recipient_id uuid,
  p_track_id text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_title text;
  v_note text;
  v_follows boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_share_self';
  end if;

  if public.users_are_blocked(v_uid, p_recipient_id) then
    raise exception 'blocked';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_recipient_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id)
    and (
      t.status is null
      or t.status = 'published'
      or t.artist_id::text = v_uid::text
    );

  if not found then
    raise exception 'track_not_found';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 140 then
    v_note := left(v_note, 140);
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_recipient_id
      and n.actor_id = v_uid
      and n.kind = 'track_share'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    p_recipient_id,
    v_uid,
    'track_share',
    case
      when v_note is null then coalesce(nullif(trim(v_title), ''), 'a track')
      else left(coalesce(nullif(trim(v_title), ''), 'a track') || ' — ' || v_note, 280)
    end,
    trim(p_track_id)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.notify_playlist_share(
  p_recipient_id uuid,
  p_playlist_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_name text;
  v_public boolean;
  v_note text;
  v_follows boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_share_self';
  end if;

  if public.users_are_blocked(v_uid, p_recipient_id) then
    raise exception 'blocked';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_recipient_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select p.name, p.is_public into v_name, v_public
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 140 then
    v_note := left(v_note, 140);
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_recipient_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_share'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_recipient_id,
    v_uid,
    'playlist_share',
    case
      when v_note is null then coalesce(nullif(trim(v_name), ''), 'a playlist')
      else left(coalesce(nullif(trim(v_name), ''), 'a playlist') || ' — ' || v_note, 280)
    end,
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

notify pgrst, 'reload schema';
