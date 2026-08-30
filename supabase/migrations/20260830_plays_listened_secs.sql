-- Track how much of each credited play was listened to (for completion rate analytics).
-- Safe to re-run.

alter table public.plays
  add column if not exists listened_secs integer check (listened_secs is null or listened_secs >= 0);

create index if not exists plays_track_listened_idx
  on public.plays (track_id, listened_secs)
  where listened_secs is not null;

-- Credit threshold matches lib/dashboard/analytics-time.ts CREDIT_LISTEN_SECS
drop function if exists public.record_credited_play(uuid);
drop function if exists public.record_credited_play(uuid, integer);

create or replace function public.record_credited_play(
  p_track_id uuid,
  p_starter integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new integer;
  v_play_id uuid;
  v_credit_secs integer := 30;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null then
    raise exception 'track_required';
  end if;

  if not exists (select 1 from public.tracks t where t.id = p_track_id) then
    raise exception 'track_not_found';
  end if;

  insert into public.user_play_balances (user_id, credits, updated_at)
  values (v_uid, greatest(coalesce(p_starter, 25), 0), now())
  on conflict (user_id) do nothing;

  update public.user_play_balances
  set credits = credits - 1,
      updated_at = now()
  where user_id = v_uid
    and credits > 0
  returning credits into v_new;

  if not found then
    raise exception 'insufficient_credits';
  end if;

  insert into public.plays (track_id, listener_id, listened_secs)
  values (p_track_id, v_uid, v_credit_secs)
  returning id into v_play_id;

  return jsonb_build_object(
    'ok', true,
    'play_id', v_play_id,
    'credits_remaining', v_new,
    'listened_secs', v_credit_secs
  );
end;
$$;

revoke all on function public.record_credited_play(uuid, integer) from public;
grant execute on function public.record_credited_play(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
