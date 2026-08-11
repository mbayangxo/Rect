-- ============================================================
-- Tip note + track attribution — paste in Supabase SQL Editor → Run
-- Requires 20260807_artist_tips.sql
-- ============================================================

alter table public.artist_tips
  add column if not exists message text;

alter table public.artist_tips
  add column if not exists track_id text;

alter table public.artist_tips
  drop constraint if exists artist_tips_message_len;

alter table public.artist_tips
  add constraint artist_tips_message_len
  check (message is null or char_length(message) <= 280);

create index if not exists artist_tips_track_id_idx
  on public.artist_tips (track_id)
  where track_id is not null;

-- Replace 2-arg RPC with optional note + track
drop function if exists public.send_artist_tip(uuid, integer);
drop function if exists public.send_artist_tip(uuid, integer, text, text);

create or replace function public.send_artist_tip(
  p_artist_id uuid,
  p_amount_xof integer,
  p_message text default null,
  p_track_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tip_id bigint;
  v_artist_ok boolean;
  v_message text;
  v_track text;
  v_track_ok boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_artist_id is null then
    raise exception 'artist_required';
  end if;

  if p_artist_id = v_uid then
    raise exception 'cannot_tip_self';
  end if;

  if p_amount_xof not in (100, 200, 500) then
    raise exception 'invalid_amount';
  end if;

  select exists (
    select 1 from public.users u
    where u.id = p_artist_id
      and (
        u.account_type = 'artist'
        or u.role = 'artist'
      )
  ) into v_artist_ok;

  if not v_artist_ok then
    raise exception 'artist_not_found';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is not null and char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  v_track := nullif(trim(coalesce(p_track_id, '')), '');
  if v_track is not null then
    select exists (
      select 1 from public.tracks t
      where t.id::text = v_track
        and t.artist_id::text = p_artist_id::text
    ) into v_track_ok;
    if not v_track_ok then
      v_track := null;
    end if;
  end if;

  insert into public.artist_tips (
    from_user_id, artist_id, amount_xof, status, payment_method, message, track_id
  )
  values (
    v_uid, p_artist_id, p_amount_xof, 'confirmed', 'stub', v_message, v_track
  )
  returning id into v_tip_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', v_tip_id,
    'artist_id', p_artist_id,
    'amount_xof', p_amount_xof,
    'payment_method', 'stub',
    'message', v_message,
    'track_id', v_track
  );
end;
$$;

revoke all on function public.send_artist_tip(uuid, integer, text, text) from public;
grant execute on function public.send_artist_tip(uuid, integer, text, text) to authenticated;

-- Tip notifications: optional note + track link
drop function if exists public.notify_artist(uuid, text, integer, text);
drop function if exists public.notify_artist(uuid, text, integer, text, text);

create or replace function public.notify_artist(
  p_recipient_id uuid,
  p_kind text,
  p_amount_xof integer default null,
  p_body text default null,
  p_track_id text default null
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

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, amount_xof, body, track_id
  )
  values (
    p_recipient_id,
    v_uid,
    p_kind,
    case when p_kind = 'tip' then p_amount_xof else null end,
    nullif(trim(coalesce(p_body, '')), ''),
    v_track
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_artist(uuid, text, integer, text, text) from public;
grant execute on function public.notify_artist(uuid, text, integer, text, text) to authenticated;

notify pgrst, 'reload schema';
