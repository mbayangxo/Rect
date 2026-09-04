-- ============================================================
-- People-follow → inbox — paste in Supabase SQL Editor → Run
-- Requires artist_notifications + people_follows
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_people_follow(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_person_id is null then
    raise exception 'person_required';
  end if;

  if p_person_id = v_uid then
    raise exception 'cannot_notify_self';
  end if;

  -- One unread peer-follow notice per actor
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_person_id
      and n.actor_id = v_uid
      and n.kind = 'people_follow'
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body
  )
  values (
    p_person_id,
    v_uid,
    'people_follow',
    'started following you'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_people_follow(uuid) from public;
grant execute on function public.notify_people_follow(uuid) to authenticated;

notify pgrst, 'reload schema';
