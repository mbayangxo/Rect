-- ============================================================
-- Collab track adds: attribution, remove-own, owner notify
-- Requires 20260809_playlist_collaborators.sql
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.playlist_tracks
  add column if not exists added_by uuid references auth.users (id) on delete set null;

create index if not exists playlist_tracks_added_by_idx
  on public.playlist_tracks (playlist_id, added_by)
  where added_by is not null;

-- Default added_by on insert when client omits it
create or replace function public.playlist_tracks_set_added_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.added_by is null then
    new.added_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists playlist_tracks_set_added_by on public.playlist_tracks;
create trigger playlist_tracks_set_added_by
  before insert on public.playlist_tracks
  for each row
  execute function public.playlist_tracks_set_added_by();

-- Backfill nulls to playlist owner (best-effort)
update public.playlist_tracks pt
set added_by = p.user_id
from public.playlists p
where p.id = pt.playlist_id
  and pt.added_by is null;

drop policy if exists "playlist_tracks_delete_own" on public.playlist_tracks;
drop policy if exists "playlist_tracks_delete_editor" on public.playlist_tracks;
create policy "playlist_tracks_delete_editor"
  on public.playlist_tracks for delete
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (
          p.user_id = auth.uid()
          or (
            public.is_accepted_playlist_collaborator(p.id, auth.uid())
            and playlist_tracks.added_by = auth.uid()
          )
        )
    )
  );

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_playlist_collab_add(
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
  v_name text;
  v_title text;
  v_notif_id bigint;
  v_body text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'required';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  -- Only accepted collaborators notify the owner
  if v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'owner');
  end if;

  if not public.is_accepted_playlist_collaborator(p_playlist_id, v_uid) then
    raise exception 'not_collaborator';
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  v_body := coalesce(nullif(trim(v_title), ''), 'a track')
    || ' · '
    || coalesce(nullif(trim(v_name), ''), 'playlist');

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_add'
      and n.playlist_id = p_playlist_id
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, track_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_collab_add',
    left(v_body, 280),
    p_playlist_id,
    trim(p_track_id)
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', v_notif_id,
    'recipient_id', v_owner
  );
end;
$$;

revoke all on function public.notify_playlist_collab_add(uuid, text) from public;
grant execute on function public.notify_playlist_collab_add(uuid, text) to authenticated;

notify pgrst, 'reload schema';
