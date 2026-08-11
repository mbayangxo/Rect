-- ============================================================
-- Artist inbox notifications — paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.artist_notifications (
  id bigserial primary key,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('follow', 'tip')),
  amount_xof integer check (amount_xof is null or amount_xof > 0),
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists artist_notifications_recipient_created_idx
  on public.artist_notifications (recipient_id, created_at desc);

create index if not exists artist_notifications_recipient_unread_idx
  on public.artist_notifications (recipient_id)
  where read_at is null;

alter table public.artist_notifications enable row level security;

drop policy if exists "artist_notifications_select_own" on public.artist_notifications;
create policy "artist_notifications_select_own"
  on public.artist_notifications for select
  to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "artist_notifications_update_own" on public.artist_notifications;
create policy "artist_notifications_update_own"
  on public.artist_notifications for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Fans notify artists via RPC (no direct insert needed)
create or replace function public.notify_artist(
  p_recipient_id uuid,
  p_kind text,
  p_amount_xof integer default null,
  p_body text default null
)
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

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, amount_xof, body
  )
  values (
    p_recipient_id,
    v_uid,
    p_kind,
    case when p_kind = 'tip' then p_amount_xof else null end,
    nullif(trim(coalesce(p_body, '')), '')
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_artist(uuid, text, integer, text) from public;
grant execute on function public.notify_artist(uuid, text, integer, text) to authenticated;

create or replace function public.mark_artist_notifications_read(p_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    update public.artist_notifications
    set read_at = now()
    where recipient_id = v_uid and read_at is null;
  else
    update public.artist_notifications
    set read_at = now()
    where recipient_id = v_uid
      and read_at is null
      and id = any (p_ids);
  end if;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'marked', v_count);
end;
$$;

revoke all on function public.mark_artist_notifications_read(bigint[]) from public;
grant execute on function public.mark_artist_notifications_read(bigint[]) to authenticated;

grant select, update on public.artist_notifications to authenticated;
grant usage, select on sequence public.artist_notifications_id_seq to authenticated;

notify pgrst, 'reload schema';
