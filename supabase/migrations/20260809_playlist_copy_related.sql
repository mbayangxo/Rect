-- ============================================================
-- Playlist copy — store + open the copier's private mix
-- Requires playlist_copy notify + playlists RLS
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists related_playlist_id uuid
  references public.playlists (id) on delete set null;

create index if not exists artist_notifications_related_playlist_idx
  on public.artist_notifications (related_playlist_id)
  where related_playlist_id is not null;

-- Recipient of playlist_copy can read the private copy (and its tracks)
drop policy if exists "playlists_select_copy_notif_recipient" on public.playlists;
create policy "playlists_select_copy_notif_recipient"
  on public.playlists for select
  to authenticated
  using (
    exists (
      select 1
      from public.artist_notifications n
      where n.related_playlist_id = playlists.id
        and n.kind = 'playlist_copy'
        and n.recipient_id = auth.uid()
    )
  );

drop policy if exists "playlist_tracks_select_copy_notif_recipient"
  on public.playlist_tracks;
create policy "playlist_tracks_select_copy_notif_recipient"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1
      from public.artist_notifications n
      where n.related_playlist_id = playlist_tracks.playlist_id
        and n.kind = 'playlist_copy'
        and n.recipient_id = auth.uid()
    )
  );

drop function if exists public.notify_playlist_copy(uuid);

create or replace function public.notify_playlist_copy(
  p_source_id uuid,
  p_copy_id uuid
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
  v_copy_owner uuid;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_source_id is null then
    raise exception 'playlist_required';
  end if;

  if p_copy_id is null then
    raise exception 'copy_required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_source_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  select p.user_id into v_copy_owner
  from public.playlists p
  where p.id = p_copy_id;

  if not found then
    raise exception 'copy_not_found';
  end if;

  if v_copy_owner is distinct from v_uid then
    raise exception 'copy_not_yours';
  end if;

  if p_copy_id = p_source_id then
    raise exception 'copy_same_as_source';
  end if;

  -- Copying your own mix — no notify
  if v_owner is null or v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  -- Only public mixes are copyable by others; keep consistent
  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_copy'
      and n.playlist_id = p_source_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, related_playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_copy',
    coalesce(nullif(trim(v_name), ''), 'your mix'),
    p_source_id,
    p_copy_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_copy(uuid, uuid) from public;
grant execute on function public.notify_playlist_copy(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
