-- Like → artist inbox — paste in Supabase SQL Editor → Run
-- Requires 20260807_artist_notifications.sql (+ release migration for track_id)

alter table public.artist_notifications
  add column if not exists track_id text;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_track_like(p_track_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select artist_id, title
  into v_artist, v_title
  from public.tracks
  where id = p_track_id;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_artist');
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  -- Avoid spamming: one unread like notice per actor+track
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'like'
      and n.track_id = p_track_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_artist,
    v_uid,
    'like',
    coalesce(nullif(trim(v_title), ''), 'your track'),
    p_track_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'track_id', p_track_id);
end;
$$;

revoke all on function public.notify_track_like(text) from public;
grant execute on function public.notify_track_like(text) to authenticated;

notify pgrst, 'reload schema';
