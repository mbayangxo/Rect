-- ============================================================
-- Tip thank-you → fan inbox — paste in Supabase SQL Editor → Run
-- Requires artist_tips + artist_notifications
-- ============================================================

alter table public.artist_tips
  add column if not exists thanks_message text;

alter table public.artist_tips
  add column if not exists thanks_at timestamptz;

alter table public.artist_tips
  drop constraint if exists artist_tips_thanks_message_len;

alter table public.artist_tips
  add constraint artist_tips_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

-- Optional link from notification → tip row
alter table public.artist_notifications
  add column if not exists tip_id bigint;

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
    recipient_id, actor_id, kind, amount_xof, body, tip_id
  )
  values (
    v_tip.from_user_id,
    v_uid,
    'tip_thanks',
    v_tip.amount_xof,
    v_message,
    p_tip_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', p_tip_id,
    'notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_tip.from_user_id
  );
end;
$$;

revoke all on function public.send_tip_thanks(bigint, text) from public;
grant execute on function public.send_tip_thanks(bigint, text) to authenticated;

-- Artists can update thanks fields on their tips only via RPC;
-- no direct update policy needed.

notify pgrst, 'reload schema';
