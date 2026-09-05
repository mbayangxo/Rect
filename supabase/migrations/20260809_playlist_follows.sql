-- ============================================================
-- Playlist follow / bookmark — paste in Supabase SQL Editor → Run
-- Requires playlists + is_public (20260807_playlists, 20260808_playlist_public)
-- Optional notify needs artist_notifications
-- ============================================================

create table if not exists public.playlist_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, playlist_id)
);

create index if not exists playlist_follows_playlist_id_idx
  on public.playlist_follows (playlist_id);

create index if not exists playlist_follows_follower_created_idx
  on public.playlist_follows (follower_id, created_at desc);

alter table public.playlist_follows enable row level security;

drop policy if exists "playlist_follows_select_own" on public.playlist_follows;
create policy "playlist_follows_select_own"
  on public.playlist_follows for select
  to authenticated
  using (follower_id = auth.uid());

-- Owners can see who saved their public mixes
drop policy if exists "playlist_follows_select_as_owner" on public.playlist_follows;
create policy "playlist_follows_select_as_owner"
  on public.playlist_follows for select
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "playlist_follows_select_public" on public.playlist_follows;
create policy "playlist_follows_select_public"
  on public.playlist_follows for select
  to authenticated, anon
  using (true);

drop policy if exists "playlist_follows_insert_own" on public.playlist_follows;
create policy "playlist_follows_insert_own"
  on public.playlist_follows for insert
  to authenticated
  with check (follower_id = auth.uid());

drop policy if exists "playlist_follows_delete_own" on public.playlist_follows;
create policy "playlist_follows_delete_own"
  on public.playlist_follows for delete
  to authenticated
  using (follower_id = auth.uid());

create or replace function public.toggle_playlist_follow(p_playlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count bigint;
  v_owner uuid;
  v_public boolean;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select exists (
    select 1 from public.playlist_follows
    where follower_id = v_uid and playlist_id = p_playlist_id
  ) into v_exists;

  if v_exists then
    delete from public.playlist_follows
    where follower_id = v_uid and playlist_id = p_playlist_id;
  else
    select p.user_id, p.is_public, p.name
    into v_owner, v_public, v_name
    from public.playlists p
    where p.id = p_playlist_id;

    if not found then
      raise exception 'playlist_not_found';
    end if;

    if v_owner = v_uid then
      raise exception 'cannot_follow_own';
    end if;

    if v_public is distinct from true then
      raise exception 'playlist_private';
    end if;

    insert into public.playlist_follows (follower_id, playlist_id)
    values (v_uid, p_playlist_id)
    on conflict do nothing;
  end if;

  select count(*) into v_count
  from public.playlist_follows
  where playlist_id = p_playlist_id;

  return jsonb_build_object(
    'following', not v_exists,
    'playlist_id', p_playlist_id,
    'follower_count', v_count
  );
end;
$$;

revoke all on function public.toggle_playlist_follow(uuid) from public;
grant execute on function public.toggle_playlist_follow(uuid) to authenticated;

-- Notify owner when someone saves their mix
alter table public.artist_notifications
  add column if not exists playlist_id uuid;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_playlist_follow(p_playlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_owner uuid;
  v_public boolean;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner = v_uid then
    raise exception 'cannot_notify_self';
  end if;

  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private');
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_follow'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_follow',
    coalesce(nullif(trim(v_name), ''), 'your playlist'),
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_follow(uuid) from public;
grant execute on function public.notify_playlist_follow(uuid) to authenticated;

notify pgrst, 'reload schema';
