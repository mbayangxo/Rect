-- ============================================================
-- Notify playlist savers when a track is added
-- Requires playlist_follows + artist_notifications
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

  -- Only fan out for public mixes (that's who can save)
  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private', 'notified', 0);
  end if;

  -- Caller must be owner or accepted collaborator
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
