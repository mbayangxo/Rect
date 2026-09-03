-- ============================================================
-- JOKO tips — pending → confirm → wallet (via tip→wallet trigger)
-- Paste AFTER 20260831_artist_os_delivery_suite.sql
-- ============================================================

alter table public.artist_tips
  add column if not exists joko_reference text;

create index if not exists artist_tips_joko_reference_idx
  on public.artist_tips (joko_reference)
  where joko_reference is not null;

-- Create tip in pending; confirm after JOKO payment
create or replace function public.create_pending_artist_tip(
  p_artist_id uuid,
  p_amount_xof integer,
  p_payment_method text,
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
  v_method text;
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

  v_method := lower(trim(coalesce(p_payment_method, 'wave')));
  if v_method not in (
    'wave', 'orange_money', 'mtn_momo', 'mobile_money', 'joko_wallet', 'debit'
  ) then
    raise exception 'invalid_payment_method';
  end if;

  select exists (
    select 1 from public.users u
    where u.id = p_artist_id
      and (u.account_type = 'artist' or u.role = 'artist')
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
      where t.id::text = v_track and t.artist_id = p_artist_id
    ) into v_track_ok;
    if not v_track_ok then
      v_track := null;
    end if;
  end if;

  insert into public.artist_tips (
    from_user_id, artist_id, amount_xof, status, payment_method, message, track_id
  )
  values (
    v_uid, p_artist_id, p_amount_xof, 'pending', v_method, v_message, v_track
  )
  returning id into v_tip_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', v_tip_id,
    'artist_id', p_artist_id,
    'amount_xof', p_amount_xof,
    'payment_method', v_method,
    'status', 'pending',
    'message', v_message,
    'track_id', v_track
  );
end;
$$;

revoke all on function public.create_pending_artist_tip(uuid, integer, text, text, text) from public;
grant execute on function public.create_pending_artist_tip(uuid, integer, text, text, text) to authenticated;

create or replace function public.set_tip_joko_reference(
  p_tip_id bigint,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.artist_tips
  set joko_reference = nullif(trim(p_reference), '')
  where id = p_tip_id
    and from_user_id = auth.uid()
    and status = 'pending';
end;
$$;

revoke all on function public.set_tip_joko_reference(bigint, text) from public;
grant execute on function public.set_tip_joko_reference(bigint, text) to authenticated;

-- System confirm (webhook / demo instant)
create or replace function public.confirm_artist_tip_system(p_tip_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tip public.artist_tips%rowtype;
begin
  select * into v_tip from public.artist_tips where id = p_tip_id for update;
  if not found then
    raise exception 'tip_not_found';
  end if;
  if v_tip.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'already', true, 'tip_id', p_tip_id);
  end if;
  if v_tip.status is distinct from 'pending' then
    raise exception 'tip_not_pending';
  end if;

  update public.artist_tips
  set status = 'confirmed'
  where id = p_tip_id;

  return jsonb_build_object(
    'ok', true,
    'tip_id', p_tip_id,
    'artist_id', v_tip.artist_id,
    'amount_xof', v_tip.amount_xof
  );
end;
$$;

revoke all on function public.confirm_artist_tip_system(bigint) from public;
-- service role only via admin client; no grant to authenticated

notify pgrst, 'reload schema';
