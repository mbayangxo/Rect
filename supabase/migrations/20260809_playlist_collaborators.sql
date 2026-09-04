-- ============================================================
-- Collaborative playlists — paste in Supabase SQL Editor → Run
-- Requires playlists + people_follows + artist_notifications
-- ============================================================

create table if not exists public.playlist_collaborators (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (playlist_id, user_id),
  constraint playlist_collaborators_not_owner check (user_id <> invited_by)
);

create index if not exists playlist_collaborators_user_status_idx
  on public.playlist_collaborators (user_id, status);

create index if not exists playlist_collaborators_playlist_status_idx
  on public.playlist_collaborators (playlist_id, status);

alter table public.playlist_collaborators enable row level security;

drop policy if exists "playlist_collaborators_select" on public.playlist_collaborators;
create policy "playlist_collaborators_select"
  on public.playlist_collaborators for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

-- No direct insert/update/delete — RPCs only

create or replace function public.is_accepted_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.playlist_collaborators c
    where c.playlist_id = p_playlist_id
      and c.user_id = p_user_id
      and c.status = 'accepted'
  );
$$;

revoke all on function public.is_accepted_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.is_accepted_playlist_collaborator(uuid, uuid) to authenticated;

-- Collaborators can read private playlists they're on (pending or accepted)
drop policy if exists "playlists_select_own_or_public" on public.playlists;
create policy "playlists_select_own_or_public"
  on public.playlists for select
  to authenticated
  using (
    user_id = auth.uid()
    or is_public = true
    or exists (
      select 1 from public.playlist_collaborators c
      where c.playlist_id = id
        and c.user_id = auth.uid()
        and c.status in ('pending', 'accepted')
    )
  );

drop policy if exists "playlist_tracks_select_own_or_public" on public.playlist_tracks;
create policy "playlist_tracks_select_own_or_public"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (
          p.user_id = auth.uid()
          or p.is_public = true
          or public.is_accepted_playlist_collaborator(p.id, auth.uid())
          or exists (
            select 1 from public.playlist_collaborators c
            where c.playlist_id = p.id
              and c.user_id = auth.uid()
              and c.status = 'pending'
          )
        )
    )
  );

drop policy if exists "playlist_tracks_insert_own" on public.playlist_tracks;
drop policy if exists "playlist_tracks_insert_editor" on public.playlist_tracks;
create policy "playlist_tracks_insert_editor"
  on public.playlist_tracks for insert
  to authenticated
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (
          p.user_id = auth.uid()
          or public.is_accepted_playlist_collaborator(p.id, auth.uid())
        )
    )
  );

-- Bump playlist updated_at when tracks change (owners + collabs)
create or replace function public.touch_playlist_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.playlists
  set updated_at = now()
  where id = coalesce(new.playlist_id, old.playlist_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists playlist_tracks_touch_playlist on public.playlist_tracks;
create trigger playlist_tracks_touch_playlist
  after insert or delete or update on public.playlist_tracks
  for each row
  execute function public.touch_playlist_updated_at();

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

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
    -- refresh invite notification if needed
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

revoke all on function public.invite_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.invite_playlist_collaborator(uuid, uuid) to authenticated;

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

  if not p_accept then
    delete from public.playlist_collaborators
    where playlist_id = p_playlist_id and user_id = v_uid;

    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_uid
      and playlist_id = p_playlist_id
      and kind = 'playlist_collab_invite'
      and read_at is null;

    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  update public.playlist_collaborators
  set status = 'accepted',
      responded_at = now()
  where playlist_id = p_playlist_id and user_id = v_uid;

  select coalesce(nullif(trim(p.name), ''), 'a playlist') into v_name
  from public.playlists p
  where p.id = p_playlist_id;

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

  v_target := coalesce(p_user_id, v_uid);

  -- Owner removes someone, or collaborator leaves
  if v_uid = v_owner then
    if v_target = v_owner then
      raise exception 'cannot_remove_owner';
    end if;
  elsif v_uid = v_target then
    null; -- leave
  else
    raise exception 'not_allowed';
  end if;

  delete from public.playlist_collaborators
  where playlist_id = p_playlist_id and user_id = v_target
  returning user_id into v_target;

  if not found then
    raise exception 'collaborator_not_found';
  end if;

  return jsonb_build_object('ok', true, 'removed', v_target);
end;
$$;

revoke all on function public.remove_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.remove_playlist_collaborator(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
