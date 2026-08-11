-- ============================================================
-- Collab ask → one-click Approve / Decline (no second invite hop)
-- Requires playlist_collab_request + playlist_collaborators + exit notify kinds
-- Paste in Supabase SQL Editor → Run
-- ============================================================

-- Asker can see whether their unread ask is still pending (RLS hides owner inbox)
create or replace function public.has_playlist_collab_ask_pending(
  p_playlist_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null or p_playlist_id is null then
    return false;
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found or v_owner is null or v_owner = v_uid then
    return false;
  end if;

  return exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_request'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  );
end;
$$;

revoke all on function public.has_playlist_collab_ask_pending(uuid) from public;
grant execute on function public.has_playlist_collab_ask_pending(uuid) to authenticated;

-- Owner approves an ask → asker becomes accepted collaborator immediately
create or replace function public.approve_playlist_collab_request(
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
  v_asked boolean;
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
    raise exception 'cannot_approve_self';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
          or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
     ) then
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
    raise exception 'cannot_approve_owner';
  end if;

  select exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_uid
      and n.actor_id = p_user_id
      and n.kind = 'playlist_collab_request'
      and n.playlist_id = p_playlist_id
  ) into v_asked;

  if not v_asked then
    raise exception 'no_request';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_uid
      and actor_id = p_user_id
      and kind = 'playlist_collab_request'
      and playlist_id = p_playlist_id
      and read_at is null;

    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found then
    update public.playlist_collaborators
    set status = 'accepted',
        invited_by = coalesce(invited_by, v_uid),
        responded_at = now()
    where playlist_id = p_playlist_id and user_id = p_user_id;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status, responded_at
    )
    values (
      p_playlist_id, p_user_id, v_uid, 'accepted', now()
    );
  end if;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  -- Clear any leftover invite to the asker
  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = p_user_id
    and actor_id = v_uid
    and kind = 'playlist_collab_invite'
    and playlist_id = p_playlist_id
    and read_at is null;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_accepted'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      p_user_id,
      v_uid,
      'playlist_collab_accepted',
      coalesce(nullif(trim(v_name), ''), 'a playlist'),
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.approve_playlist_collab_request(uuid, uuid) from public;
grant execute on function public.approve_playlist_collab_request(uuid, uuid) to authenticated;

-- Owner declines an ask → notify asker, no membership
create or replace function public.decline_playlist_collab_request(
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
  v_asked boolean;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
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

  select exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_uid
      and n.actor_id = p_user_id
      and n.kind = 'playlist_collab_request'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) into v_asked;

  if not v_asked then
    return jsonb_build_object('ok', true, 'skipped', 'no_unread_request');
  end if;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  if not (
       to_regclass('public.user_blocks') is not null
       and exists (
         select 1 from public.user_blocks b
         where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
            or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
       )
     )
     and not exists (
       select 1 from public.artist_notifications n
       where n.recipient_id = p_user_id
         and n.actor_id = v_uid
         and n.kind = 'playlist_collab_declined'
         and n.playlist_id = p_playlist_id
         and n.read_at is null
     )
  then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      p_user_id,
      v_uid,
      'playlist_collab_declined',
      coalesce(nullif(trim(v_name), ''), 'a playlist'),
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'declined',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.decline_playlist_collab_request(uuid, uuid) from public;
grant execute on function public.decline_playlist_collab_request(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
