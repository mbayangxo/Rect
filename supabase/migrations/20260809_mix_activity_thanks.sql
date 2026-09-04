-- ============================================================
-- Thanks on a friend's public mix
-- Requires playlists + people_follows + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.mix_thanks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  thanker_id uuid not null references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (playlist_id, thanker_id),
  constraint mix_thanks_message_len check (char_length(message) <= 280),
  constraint mix_thanks_not_self check (thanker_id <> owner_id)
);

create index if not exists mix_thanks_owner_created_idx
  on public.mix_thanks (owner_id, created_at desc);

alter table public.mix_thanks enable row level security;

drop policy if exists "mix_thanks_select_own" on public.mix_thanks;
create policy "mix_thanks_select_own"
  on public.mix_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or owner_id = auth.uid());

drop policy if exists "mix_thanks_insert_own" on public.mix_thanks;
create policy "mix_thanks_insert_own"
  on public.mix_thanks for insert
  to authenticated
  with check (thanker_id = auth.uid());

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.send_mix_thanks(
  p_playlist_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.is_public
  into v_owner, v_public
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner is null or v_owner = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  if to_regclass('public.people_follows') is null
     or not exists (
       select 1 from public.people_follows f
       where f.follower_id = v_uid and f.person_id = v_owner
     ) then
    raise exception 'not_following';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');
  if v_message is null then
    raise exception 'message_required';
  end if;
  if char_length(v_message) > 280 then
    v_message := left(v_message, 280);
  end if;

  if exists (
    select 1 from public.mix_thanks t
    where t.playlist_id = p_playlist_id and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.mix_thanks t
    where t.playlist_id = p_playlist_id and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'playlist_id', p_playlist_id
    );
  end if;

  insert into public.mix_thanks (
    playlist_id, thanker_id, owner_id, message
  )
  values (
    p_playlist_id, v_uid, v_owner, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'mix_thanks'
      and n.playlist_id is not distinct from p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'playlist_id', p_playlist_id,
      'owner_id', v_owner
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_owner,
    v_uid,
    'mix_thanks',
    v_message,
    p_playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'playlist_id', p_playlist_id,
    'owner_id', v_owner,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_mix_thanks(uuid, text) from public;
grant execute on function public.send_mix_thanks(uuid, text) to authenticated;

notify pgrst, 'reload schema';
