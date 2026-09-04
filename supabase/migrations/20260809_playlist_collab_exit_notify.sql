-- ============================================================
-- Collab decline / leave / remove → inbox
-- Requires 20260809_playlist_collaborators.sql
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.respond_playlist_collab(
  p_playlist_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.playlist_collaborators%rowtype;
  v_name text;
  v_notif_id bigint;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select * into v_row
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = v_uid;

  if not found then
    raise exception 'invite_not_found';
  end if;

  if v_row.status = 'accepted' and p_accept then
    return jsonb_build_object('ok', true, 'skipped', 'already_accepted', 'status', 'accepted');
  end if;

  select coalesce(nullif(trim(p.name), ''), 'a playlist') into v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not p_accept then
    delete from public.playlist_collaborators
    where playlist_id = p_playlist_id and user_id = v_uid;

    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_uid
      and playlist_id = p_playlist_id
      and kind = 'playlist_collab_invite'
      and read_at is null;

    v_recipient := v_row.invited_by;
    if v_recipient is not null
       and v_recipient <> v_uid
       and not (
         to_regclass('public.user_blocks') is not null
         and exists (
           select 1 from public.user_blocks b
           where (b.blocker_id = v_uid and b.blocked_id = v_recipient)
              or (b.blocker_id = v_recipient and b.blocked_id = v_uid)
         )
       )
       and not exists (
         select 1 from public.artist_notifications n
         where n.recipient_id = v_recipient
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
        v_recipient,
        v_uid,
        'playlist_collab_declined',
        v_name,
        p_playlist_id
      )
      returning id into v_notif_id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'declined',
      'notification_id', v_notif_id
    );
  end if;

  update public.playlist_collaborators
  set status = 'accepted',
      responded_at = now()
  where playlist_id = p_playlist_id and user_id = v_uid;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and playlist_id = p_playlist_id
    and kind = 'playlist_collab_invite'
    and read_at is null;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_row.invited_by
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_accepted'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      v_row.invited_by,
      v_uid,
      'playlist_collab_accepted',
      v_name,
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

revoke all on function public.respond_playlist_collab(uuid, boolean) from public;
grant execute on function public.respond_playlist_collab(uuid, boolean) to authenticated;

create or replace function public.remove_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_target uuid;
  v_name text;
  v_notif_id bigint;
  v_recipient uuid;
  v_kind text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, coalesce(nullif(trim(p.name), ''), 'a playlist')
  into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  v_target := coalesce(p_user_id, v_uid);

  if v_uid = v_owner then
    if v_target = v_owner then
      raise exception 'cannot_remove_owner';
    end if;
  elsif v_uid = v_target then
    null; -- leave
  else
    raise exception 'not_allowed';
  end if;

  if not exists (
    select 1 from public.playlist_collaborators c
    where c.playlist_id = p_playlist_id and c.user_id = v_target
  ) then
    raise exception 'collaborator_not_found';
  end if;

  delete from public.playlist_collaborators
  where playlist_id = p_playlist_id and user_id = v_target;

  if v_uid = v_owner and v_target <> v_uid then
    v_recipient := v_target;
    v_kind := 'playlist_collab_removed';
  elsif v_uid = v_target and v_owner is not null and v_owner <> v_uid then
    v_recipient := v_owner;
    v_kind := 'playlist_collab_left';
  else
    return jsonb_build_object('ok', true, 'removed', v_target);
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_recipient)
          or (b.blocker_id = v_recipient and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'removed', v_target, 'skipped', 'blocked');
  end if;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_recipient
      and n.actor_id = v_uid
      and n.kind = v_kind
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      v_recipient,
      v_uid,
      v_kind,
      v_name,
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'removed', v_target,
    'kind', v_kind,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.remove_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.remove_playlist_collaborator(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
