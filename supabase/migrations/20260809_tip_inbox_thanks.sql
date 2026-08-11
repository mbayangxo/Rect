-- ============================================================
-- Tip inbox → thank tipper (carry tip_id on tip notifications)
-- Requires tip_thanks (tip_id column) + tip_message_track notify_artist
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists tip_id bigint;

drop function if exists public.notify_artist(uuid, text, integer, text);
drop function if exists public.notify_artist(uuid, text, integer, text, text);
drop function if exists public.notify_artist(uuid, text, integer, text, text, bigint);

create or replace function public.notify_artist(
  p_recipient_id uuid,
  p_kind text,
  p_amount_xof integer default null,
  p_body text default null,
  p_track_id text default null,
  p_tip_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_track text;
  v_tip bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_kind not in ('follow', 'tip') then
    raise exception 'invalid_kind';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_notify_self';
  end if;

  if p_kind = 'tip' and (p_amount_xof is null or p_amount_xof not in (100, 200, 500)) then
    raise exception 'invalid_amount';
  end if;

  v_track := nullif(trim(coalesce(p_track_id, '')), '');
  v_tip := case when p_kind = 'tip' then p_tip_id else null end;

  -- Tip id must belong to this tipper → artist pair when provided
  if v_tip is not null then
    if not exists (
      select 1 from public.artist_tips t
      where t.id = v_tip
        and t.artist_id = p_recipient_id
        and t.from_user_id = v_uid
    ) then
      v_tip := null;
    end if;
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, amount_xof, body, track_id, tip_id
  )
  values (
    p_recipient_id,
    v_uid,
    p_kind,
    case when p_kind = 'tip' then p_amount_xof else null end,
    nullif(trim(coalesce(p_body, '')), ''),
    v_track,
    v_tip
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'tip_id', v_tip);
end;
$$;

revoke all on function public.notify_artist(uuid, text, integer, text, text, bigint) from public;
grant execute on function public.notify_artist(uuid, text, integer, text, text, bigint) to authenticated;

-- Best-effort: link older tip notifications to matching tip rows
update public.artist_notifications n
set tip_id = t.id
from public.artist_tips t
where n.kind = 'tip'
  and n.tip_id is null
  and t.artist_id = n.recipient_id
  and t.from_user_id = n.actor_id
  and t.amount_xof = n.amount_xof
  and n.created_at is not null
  and t.created_at is not null
  and abs(extract(epoch from (t.created_at - n.created_at))) < 120
  and not exists (
    select 1 from public.artist_notifications n2
    where n2.tip_id = t.id
      and n2.kind = 'tip'
      and n2.id <> n.id
  );

notify pgrst, 'reload schema';
