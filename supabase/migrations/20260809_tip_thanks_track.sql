-- ============================================================
-- Tip thanks copies tip track_id onto the fan inbox row
-- Paste in Supabase SQL Editor → Run
-- Requires 20260809_tip_thanks.sql + tip track_id (20260809_tip_message_track.sql)
-- ============================================================

create or replace function public.send_tip_thanks(
  p_tip_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tip public.artist_tips%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_tip_id is null then
    raise exception 'tip_required';
  end if;

  select * into v_tip
  from public.artist_tips t
  where t.id = p_tip_id;

  if not found then
    raise exception 'tip_not_found';
  end if;

  if v_tip.artist_id <> v_uid then
    raise exception 'not_tip_owner';
  end if;

  if v_tip.status is distinct from 'confirmed' then
    raise exception 'tip_not_confirmed';
  end if;

  if v_tip.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  update public.artist_tips
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_tip_id;

  -- One unread thank notice per tip
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_tip.from_user_id
      and n.actor_id = v_uid
      and n.kind = 'tip_thanks'
      and n.tip_id = p_tip_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'tip_id', p_tip_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, amount_xof, body, tip_id, track_id
  )
  values (
    v_tip.from_user_id,
    v_uid,
    'tip_thanks',
    v_tip.amount_xof,
    v_message,
    p_tip_id,
    v_tip.track_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', p_tip_id,
    'notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_tip.from_user_id,
    'track_id', v_tip.track_id
  );
end;
$$;

revoke all on function public.send_tip_thanks(bigint, text) from public;
grant execute on function public.send_tip_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';
