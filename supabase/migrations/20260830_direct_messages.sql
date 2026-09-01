-- ============================================================
-- Direct messages (1:1) — paste in Supabase SQL Editor → Run
-- Requires: user_blocks.users_are_blocked, auth.users
-- Safe to re-run.
-- ============================================================

create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  -- Canonical pair for uniqueness (lower uuid first)
  participant_low uuid not null references auth.users (id) on delete cascade,
  participant_high uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dm_conversations_ordered check (participant_low < participant_high),
  constraint dm_conversations_pair_unique unique (participant_low, participant_high)
);

create index if not exists dm_conversations_updated_idx
  on public.dm_conversations (updated_at desc);

create table if not exists public.dm_participants (
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists dm_participants_user_idx
  on public.dm_participants (user_id);

create table if not exists public.dm_messages (
  id bigserial primary key,
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null
    check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_conv_created_idx
  on public.dm_messages (conversation_id, created_at desc);

alter table public.dm_conversations enable row level security;
alter table public.dm_participants enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists "dm_conversations_select_participant" on public.dm_conversations;
create policy "dm_conversations_select_participant"
  on public.dm_conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants p
      where p.conversation_id = id and p.user_id = auth.uid()
    )
  );

drop policy if exists "dm_participants_select_own_thread" on public.dm_participants;
create policy "dm_participants_select_own_thread"
  on public.dm_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants me
      where me.conversation_id = conversation_id
        and me.user_id = auth.uid()
    )
  );

drop policy if exists "dm_participants_update_own" on public.dm_participants;
create policy "dm_participants_update_own"
  on public.dm_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "dm_messages_select_participant" on public.dm_messages;
create policy "dm_messages_select_participant"
  on public.dm_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants p
      where p.conversation_id = conversation_id
        and p.user_id = auth.uid()
    )
  );

-- No client inserts on conversations/messages — RPCs only.

create or replace function public.open_or_get_dm(p_other_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_other_id is null then
    raise exception 'user_required';
  end if;
  if p_other_id = v_uid then
    raise exception 'cannot_dm_self';
  end if;

  if to_regclass('public.user_blocks') is not null
     and public.users_are_blocked(v_uid, p_other_id) then
    raise exception 'blocked';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_other_id) then
    raise exception 'user_not_found';
  end if;

  if p_other_id < v_uid then
    v_low := p_other_id;
    v_high := v_uid;
  else
    v_low := v_uid;
    v_high := p_other_id;
  end if;

  select c.id into v_id
  from public.dm_conversations c
  where c.participant_low = v_low and c.participant_high = v_high;

  if v_id is null then
    begin
      insert into public.dm_conversations (participant_low, participant_high)
      values (v_low, v_high)
      returning id into v_id;
    exception
      when unique_violation then
        select c.id into v_id
        from public.dm_conversations c
        where c.participant_low = v_low and c.participant_high = v_high;
    end;

    insert into public.dm_participants (conversation_id, user_id, last_read_at)
    values
      (v_id, v_uid, now()),
      (v_id, p_other_id, null)
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', v_id,
    'other_id', p_other_id
  );
end;
$$;

revoke all on function public.open_or_get_dm(uuid) from public;
grant execute on function public.open_or_get_dm(uuid) to authenticated;

create or replace function public.send_dm(
  p_conversation_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
  v_body text := left(trim(coalesce(p_body, '')), 2000);
  v_id bigint;
  v_created timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;
  if length(v_body) = 0 then
    raise exception 'body_required';
  end if;

  if not exists (
    select 1 from public.dm_participants p
    where p.conversation_id = p_conversation_id and p.user_id = v_uid
  ) then
    raise exception 'not_participant';
  end if;

  select p.user_id into v_other
  from public.dm_participants p
  where p.conversation_id = p_conversation_id
    and p.user_id <> v_uid
  limit 1;

  if v_other is null then
    raise exception 'conversation_invalid';
  end if;

  if to_regclass('public.user_blocks') is not null
     and public.users_are_blocked(v_uid, v_other) then
    raise exception 'blocked';
  end if;

  insert into public.dm_messages (conversation_id, sender_id, body)
  values (p_conversation_id, v_uid, v_body)
  returning id, created_at into v_id, v_created;

  update public.dm_conversations
  set updated_at = v_created
  where id = p_conversation_id;

  update public.dm_participants
  set last_read_at = v_created
  where conversation_id = p_conversation_id and user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'message_id', v_id,
    'conversation_id', p_conversation_id,
    'sender_id', v_uid,
    'body', v_body,
    'created_at', v_created
  );
end;
$$;

revoke all on function public.send_dm(uuid, text) from public;
grant execute on function public.send_dm(uuid, text) to authenticated;

create or replace function public.mark_dm_read(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  update public.dm_participants
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and user_id = v_uid;

  if not found then
    raise exception 'not_participant';
  end if;

  return jsonb_build_object('ok', true, 'conversation_id', p_conversation_id);
end;
$$;

revoke all on function public.mark_dm_read(uuid) from public;
grant execute on function public.mark_dm_read(uuid) to authenticated;

-- Extend block: keep history but DMs cannot continue (send/open check blocked).
-- Also drop people/artist/playlist follows (same as prior block migrations).
create or replace function public.toggle_user_block(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_user_id is null then
    raise exception 'user_required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_block_self';
  end if;

  select exists (
    select 1 from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id
  ) into v_exists;

  if v_exists then
    delete from public.user_blocks
    where blocker_id = v_uid and blocked_id = p_user_id;
    return jsonb_build_object(
      'blocked', false,
      'user_id', p_user_id
    );
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id)
  on conflict do nothing;

  if to_regclass('public.people_follows') is not null then
    delete from public.people_follows
    where (follower_id = v_uid and person_id = p_user_id)
       or (follower_id = p_user_id and person_id = v_uid);
  end if;

  if to_regclass('public.artist_follows') is not null then
    delete from public.artist_follows
    where (follower_id = v_uid and artist_id = p_user_id)
       or (follower_id = p_user_id and artist_id = v_uid);
  end if;

  if to_regclass('public.playlist_follows') is not null
     and to_regclass('public.playlists') is not null then
    delete from public.playlist_follows pf
    using public.playlists p
    where pf.playlist_id = p.id
      and (
        (pf.follower_id = v_uid and p.user_id = p_user_id)
        or (pf.follower_id = p_user_id and p.user_id = v_uid)
      );
  end if;

  return jsonb_build_object(
    'blocked', true,
    'user_id', p_user_id
  );
end;
$$;

revoke all on function public.toggle_user_block(uuid) from public;
grant execute on function public.toggle_user_block(uuid) to authenticated;

notify pgrst, 'reload schema';
