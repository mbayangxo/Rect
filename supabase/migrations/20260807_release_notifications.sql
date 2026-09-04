-- ============================================================
-- Release notifications to followers — paste in Supabase SQL Editor → Run
-- Requires 20260807_artist_notifications.sql first
-- ============================================================

alter table public.artist_notifications
  add column if not exists track_id text;

-- Widen kind check to include release
alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create index if not exists artist_notifications_track_id_idx
  on public.artist_notifications (track_id)
  where track_id is not null;

-- Artist publishes → notify each follower
create or replace function public.notify_track_release(p_track_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_status text;
  v_count integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select artist_id, title, status
  into v_artist, v_title, v_status
  from public.tracks
  where id = p_track_id;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is distinct from v_uid then
    raise exception 'not_your_track';
  end if;

  if lower(coalesce(v_status, 'pending')) <> 'published' then
    raise exception 'track_not_published';
  end if;

  for r in
    select follower_id
    from public.artist_follows
    where artist_id = v_uid
  loop
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, track_id
    )
    values (
      r.follower_id,
      v_uid,
      'release',
      coalesce(nullif(trim(v_title), ''), 'New track'),
      p_track_id
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'notified', v_count,
    'track_id', p_track_id
  );
end;
$$;

revoke all on function public.notify_track_release(text) from public;
grant execute on function public.notify_track_release(text) to authenticated;

notify pgrst, 'reload schema';
