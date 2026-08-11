-- ============================================================
-- Durable mix collab asks (survive Mark all read)
-- Requires collab_approve_from_request + playlist_collab_request
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.playlist_collab_asks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  asker_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  notification_id bigint,
  primary key (playlist_id, asker_id)
);

create index if not exists playlist_collab_asks_asker_idx
  on public.playlist_collab_asks (asker_id, created_at desc);

create index if not exists playlist_collab_asks_playlist_idx
  on public.playlist_collab_asks (playlist_id, created_at desc);

alter table public.playlist_collab_asks enable row level security;

-- No direct client writes — RPCs only. Select: owner or asker.
drop policy if exists "playlist_collab_asks_select" on public.playlist_collab_asks;
create policy "playlist_collab_asks_select"
  on public.playlist_collab_asks for select
  to authenticated
  using (
    asker_id = auth.uid()
    or exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

grant select on public.playlist_collab_asks to authenticated;

-- Backfill open asks from request notifications (prefer unread; else any if not collab)
insert into public.playlist_collab_asks (playlist_id, asker_id, created_at, notification_id)
select distinct on (n.playlist_id, n.actor_id)
  n.playlist_id,
  n.actor_id,
  n.created_at,
  n.id
from public.artist_notifications n
join public.playlists p on p.id = n.playlist_id
where n.kind = 'playlist_collab_request'
  and n.playlist_id is not null
  and n.actor_id is not null
  and n.recipient_id = p.user_id
  and not exists (
    select 1 from public.playlist_collaborators c
    where c.playlist_id = n.playlist_id
      and c.user_id = n.actor_id
      and c.status = 'accepted'
  )
order by n.playlist_id, n.actor_id, (n.read_at is null) desc, n.created_at desc
on conflict (playlist_id, asker_id) do nothing;

-- Drop asks that were already resolved as accepted collabs
delete from public.playlist_collab_asks a
using public.playlist_collaborators c
where a.playlist_id = c.playlist_id
  and a.asker_id = c.user_id
  and c.status = 'accepted';

create or replace function public.notify_playlist_collab_request(
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
  v_follows boolean;
  v_status text;
  v_id bigint;
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

  if v_owner is null or v_owner = v_uid then
    raise exception 'cannot_request_own';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = v_owner
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select c.status into v_status
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = v_uid;

  if found and v_status = 'accepted' then
    return jsonb_build_object('ok', true, 'skipped', 'already_collaborator');
  end if;

  if found and v_status = 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'invite_pending');
  end if;

  -- Durable open ask (survives Mark all read)
  if exists (
    select 1 from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id and a.asker_id = v_uid
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_asked');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_collab_request',
    coalesce(nullif(trim(v_name), ''), 'your mix'),
    p_playlist_id
  )
  returning id into v_id;

  insert into public.playlist_collab_asks (
    playlist_id, asker_id, notification_id
  )
  values (p_playlist_id, v_uid, v_id)
  on conflict (playlist_id, asker_id) do nothing;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_collab_request(uuid) from public;
grant execute on function public.notify_playlist_collab_request(uuid) to authenticated;

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
begin
  if v_uid is null or p_playlist_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id
      and a.asker_id = v_uid
  );
end;
$$;

revoke all on function public.has_playlist_collab_ask_pending(uuid) from public;
grant execute on function public.has_playlist_collab_ask_pending(uuid) to authenticated;

create or replace function public.cancel_playlist_collab_ask(
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
  v_deleted int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  delete from public.playlist_collab_asks
  where playlist_id = p_playlist_id and asker_id = v_uid;

  get diagnostics v_deleted = row_count;

  if v_owner is not null then
    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_owner
      and actor_id = v_uid
      and kind = 'playlist_collab_request'
      and playlist_id = p_playlist_id
      and read_at is null;
  end if;

  if v_deleted = 0 then
    return jsonb_build_object('ok', true, 'skipped', 'not_asked');
  end if;

  return jsonb_build_object('ok', true, 'cancelled', true);
end;
$$;

revoke all on function public.cancel_playlist_collab_ask(uuid) from public;
grant execute on function public.cancel_playlist_collab_ask(uuid) to authenticated;

create or replace function public.list_playlist_collab_asks(
  p_playlist_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'asker_id', a.asker_id,
          'created_at', a.created_at,
          'notification_id', a.notification_id
        )
        order by a.created_at asc
      )
      from public.playlist_collab_asks a
      where a.playlist_id = p_playlist_id
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_playlist_collab_asks(uuid) from public;
grant execute on function public.list_playlist_collab_asks(uuid) to authenticated;

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
    select 1 from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id and a.asker_id = p_user_id
  ) into v_asked;

  -- Fallback: legacy notification-only asks before this migration
  if not v_asked then
    select exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = v_uid
        and n.actor_id = p_user_id
        and n.kind = 'playlist_collab_request'
        and n.playlist_id = p_playlist_id
    ) into v_asked;
  end if;

  if not v_asked then
    raise exception 'no_request';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    delete from public.playlist_collab_asks
    where playlist_id = p_playlist_id and asker_id = p_user_id;

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

  delete from public.playlist_collab_asks
  where playlist_id = p_playlist_id and asker_id = p_user_id;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

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
    select 1 from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id and a.asker_id = p_user_id
  ) into v_asked;

  if not v_asked then
    select exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = v_uid
        and n.actor_id = p_user_id
        and n.kind = 'playlist_collab_request'
        and n.playlist_id = p_playlist_id
        and n.read_at is null
    ) into v_asked;
  end if;

  if not v_asked then
    return jsonb_build_object('ok', true, 'skipped', 'no_open_request');
  end if;

  delete from public.playlist_collab_asks
  where playlist_id = p_playlist_id and asker_id = p_user_id;

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

-- Invite-from-ask also honors durable asks
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
    raise exception 'cannot_invite_self';
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
    raise exception 'cannot_invite_owner';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_user_id
  ) into v_follows;

  select exists (
    select 1 from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id and a.asker_id = p_user_id
  ) into v_asked;

  if not v_asked then
    select exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = v_uid
        and n.actor_id = p_user_id
        and n.kind = 'playlist_collab_request'
        and n.playlist_id = p_playlist_id
    ) into v_asked;
  end if;

  if not v_follows and not v_asked then
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

  delete from public.playlist_collab_asks
  where playlist_id = p_playlist_id and asker_id = p_user_id;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

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

revoke all on function public.invite_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.invite_playlist_collaborator(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
