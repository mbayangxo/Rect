-- RECT — fix Aug 8/9 social + studio probe gaps (one paste)
-- Generated: 2026-09-04T15:50:12.240Z
-- Files: 69
-- Supabase SQL Editor → paste this entire file → Run

-- Guard: stop early with a clear message if core tables are missing.
do $$
begin
  if to_regclass('public.users') is null then
    raise exception 'public.users does not exist. Run _BUNDLE_core.sql first (npm run db:bundle:core), then re-run this bundle.';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_users_avatar.sql
-- ═══════════════════════════════════════════════════════════
-- Artist / user avatar URL — paste in Supabase SQL Editor → Run

alter table public.users
  add column if not exists avatar_url text;

notify pgrst, 'reload schema';

-- END 20260808_users_avatar.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_users_select_public_profiles.sql
-- ═══════════════════════════════════════════════════════════
-- Public listener + artist profiles readable when privacy_public_profile is on.
-- Paste in Supabase SQL Editor → Run
-- (Keeps own-row access; discovery already used artist-only select.)

alter table public.users enable row level security;

drop policy if exists "users_select_artists_public" on public.users;
drop policy if exists "users_select_public_profiles" on public.users;

create policy "users_select_public_profiles"
  on public.users for select
  to anon, authenticated
  using (
    id = auth.uid()
    or coalesce(privacy_public_profile, true) = true
  );

notify pgrst, 'reload schema';

-- END 20260808_users_select_public_profiles.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_playlist_public.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Public playlist sharing — paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.playlists
  add column if not exists is_public boolean not null default false;

create index if not exists playlists_public_idx
  on public.playlists (id)
  where is_public = true;

-- Owners always see their playlists; anyone can read public ones
drop policy if exists "playlists_select_own" on public.playlists;
drop policy if exists "playlists_select_own_or_public" on public.playlists;
drop policy if exists "playlists_select_public_anon" on public.playlists;

create policy "playlists_select_own_or_public"
  on public.playlists for select
  to authenticated
  using (user_id = auth.uid() or is_public = true);

create policy "playlists_select_public_anon"
  on public.playlists for select
  to anon
  using (is_public = true);

-- Playlist tracks readable when the parent playlist is yours or public
drop policy if exists "playlist_tracks_select_own" on public.playlist_tracks;
drop policy if exists "playlist_tracks_select_own_or_public" on public.playlist_tracks;
drop policy if exists "playlist_tracks_select_public_anon" on public.playlist_tracks;

create policy "playlist_tracks_select_own_or_public"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (p.user_id = auth.uid() or p.is_public = true)
    )
  );

create policy "playlist_tracks_select_public_anon"
  on public.playlist_tracks for select
  to anon
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.is_public = true
    )
  );

notify pgrst, 'reload schema';

-- END 20260808_playlist_public.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_playlist_description.sql
-- ═══════════════════════════════════════════════════════════
-- Playlist descriptions — paste in Supabase SQL Editor → Run
-- Optional blurb for private + public playlists

alter table public.playlists
  add column if not exists description text;

alter table public.playlists
  drop constraint if exists playlists_description_len;

alter table public.playlists
  add constraint playlists_description_len
  check (
    description is null
    or char_length(description) <= 280
  );

-- END 20260808_playlist_description.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_playlist_cover.sql
-- ═══════════════════════════════════════════════════════════
-- Playlist cover art — paste in Supabase SQL Editor → Run

alter table public.playlists
  add column if not exists cover_art_url text;

-- END 20260808_playlist_cover.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_playlist_pinned.sql
-- ═══════════════════════════════════════════════════════════
-- Pin playlists to top of Your mixes — paste in Supabase SQL Editor → Run

alter table public.playlists
  add column if not exists pinned_at timestamptz null;

create index if not exists playlists_user_pinned_idx
  on public.playlists (user_id, pinned_at desc nulls last, updated_at desc);

notify pgrst, 'reload schema';

-- END 20260808_playlist_pinned.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_plays_shared_activity.sql
-- ═══════════════════════════════════════════════════════════
-- Shared listening activity — paste in Supabase SQL Editor → Run
-- Lets anyone read plays for listeners who opted into privacy_show_activity.
-- Private journal UX still uses own-select; this powers public “listening now”
-- and artist “recent listeners” when service role is unavailable.

alter table public.plays enable row level security;

drop policy if exists "plays_select_shared_activity" on public.plays;
create policy "plays_select_shared_activity"
  on public.plays for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = listener_id
        and coalesce(u.privacy_show_activity, true) = true
    )
  );

notify pgrst, 'reload schema';

-- END 20260808_plays_shared_activity.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_plays_delete_own.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Listeners can delete their own play history
-- Paste in Supabase SQL Editor → Run
-- ============================================================

drop policy if exists "plays_delete_own" on public.plays;
create policy "plays_delete_own"
  on public.plays for delete
  to authenticated
  using (listener_id = auth.uid());

notify pgrst, 'reload schema';

-- END 20260808_plays_delete_own.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_tracks_delete_own.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artists can delete their own tracks — paste in SQL Editor → Run
-- ============================================================

alter table public.tracks enable row level security;

drop policy if exists "tracks_delete_own" on public.tracks;
create policy "tracks_delete_own"
  on public.tracks for delete
  to authenticated
  using (artist_id = auth.uid());

notify pgrst, 'reload schema';

-- END 20260808_tracks_delete_own.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_like_notifications.sql
-- ═══════════════════════════════════════════════════════════
-- Like → artist inbox — paste in Supabase SQL Editor → Run
-- Requires 20260807_artist_notifications.sql (+ release migration for track_id)

alter table public.artist_notifications
  add column if not exists track_id text;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_track_like(p_track_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select artist_id, title
  into v_artist, v_title
  from public.tracks
  where id = p_track_id;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_artist');
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  -- Avoid spamming: one unread like notice per actor+track
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'like'
      and n.track_id = p_track_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_artist,
    v_uid,
    'like',
    coalesce(nullif(trim(v_title), ''), 'your track'),
    p_track_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'track_id', p_track_id);
end;
$$;

revoke all on function public.notify_track_like(text) from public;
grant execute on function public.notify_track_like(text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260808_like_notifications.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260808_release_notify_dedupe.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Release notify: skip duplicate for same follower+track
-- Paste in Supabase SQL Editor → Run
-- Requires 20260807_release_notifications.sql
-- ============================================================

create or replace function public.notify_track_release(p_track_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_status text;
  v_count integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select artist_id, title, status
  into v_artist, v_title, v_status
  from public.tracks
  where id = p_track_id;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is distinct from v_uid then
    raise exception 'not_your_track';
  end if;

  if lower(coalesce(v_status, 'pending')) <> 'published' then
    raise exception 'track_not_published';
  end if;

  for r in
    select follower_id
    from public.artist_follows
    where artist_id = v_uid
  loop
    -- Don't re-spam the same release alert
    if exists (
      select 1
      from public.artist_notifications n
      where n.recipient_id = r.follower_id
        and n.kind = 'release'
        and n.track_id = p_track_id
    ) then
      continue;
    end if;

    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, track_id
    )
    values (
      r.follower_id,
      v_uid,
      'release',
      coalesce(nullif(trim(v_title), ''), 'New track'),
      p_track_id
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'notified', v_count,
    'track_id', p_track_id
  );
end;
$$;

revoke all on function public.notify_track_release(text) from public;
grant execute on function public.notify_track_release(text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260808_release_notify_dedupe.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_people_follows.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- People follows (peer graph) — paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.people_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, person_id),
  constraint people_follows_no_self check (follower_id <> person_id)
);

create index if not exists people_follows_person_id_idx
  on public.people_follows (person_id);

create index if not exists people_follows_follower_created_idx
  on public.people_follows (follower_id, created_at desc);

alter table public.people_follows enable row level security;

drop policy if exists "people_follows_select_own" on public.people_follows;
create policy "people_follows_select_own"
  on public.people_follows for select
  to authenticated
  using (follower_id = auth.uid());

drop policy if exists "people_follows_select_as_person" on public.people_follows;
create policy "people_follows_select_as_person"
  on public.people_follows for select
  to authenticated
  using (person_id = auth.uid());

-- Public count / existence checks
drop policy if exists "people_follows_select_public" on public.people_follows;
create policy "people_follows_select_public"
  on public.people_follows for select
  to authenticated, anon
  using (true);

drop policy if exists "people_follows_insert_own" on public.people_follows;
create policy "people_follows_insert_own"
  on public.people_follows for insert
  to authenticated
  with check (follower_id = auth.uid());

drop policy if exists "people_follows_delete_own" on public.people_follows;
create policy "people_follows_delete_own"
  on public.people_follows for delete
  to authenticated
  using (follower_id = auth.uid());

create or replace function public.toggle_people_follow(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count bigint;
  v_public boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_person_id is null then
    raise exception 'person_required';
  end if;

  if p_person_id = v_uid then
    raise exception 'cannot_follow_self';
  end if;

  select exists (
    select 1 from public.people_follows
    where follower_id = v_uid and person_id = p_person_id
  ) into v_exists;

  if v_exists then
    delete from public.people_follows
    where follower_id = v_uid and person_id = p_person_id;
  else
    select coalesce(privacy_public_profile, true)
    into v_public
    from public.users
    where id = p_person_id;

    if not found then
      raise exception 'person_not_found';
    end if;

    if v_public is distinct from true then
      raise exception 'profile_private';
    end if;

    insert into public.people_follows (follower_id, person_id)
    values (v_uid, p_person_id)
    on conflict do nothing;
  end if;

  select count(*) into v_count
  from public.people_follows
  where person_id = p_person_id;

  return jsonb_build_object(
    'following', not v_exists,
    'person_id', p_person_id,
    'follower_count', v_count
  );
end;
$$;

revoke all on function public.toggle_people_follow(uuid) from public;
grant execute on function public.toggle_people_follow(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_people_follows.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_user_blocks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- User blocks — paste in Supabase SQL Editor → Run
-- Requires people_follows (optional hard-enforce on follow/share/invite)
-- ============================================================

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own"
  on public.user_blocks for select
  to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

drop policy if exists "user_blocks_insert_own" on public.user_blocks;
create policy "user_blocks_insert_own"
  on public.user_blocks for insert
  to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "user_blocks_delete_own" on public.user_blocks;
create policy "user_blocks_delete_own"
  on public.user_blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

create or replace function public.users_are_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke all on function public.users_are_blocked(uuid, uuid) from public;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;

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

  -- Drop people-follow edges both ways
  delete from public.people_follows
  where (follower_id = v_uid and person_id = p_user_id)
     or (follower_id = p_user_id and person_id = v_uid);

  return jsonb_build_object(
    'blocked', true,
    'user_id', p_user_id
  );
end;
$$;

revoke all on function public.toggle_user_block(uuid) from public;
grant execute on function public.toggle_user_block(uuid) to authenticated;

-- Enforce on people follow
create or replace function public.toggle_people_follow(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count bigint;
  v_public boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_person_id is null then
    raise exception 'person_required';
  end if;

  if p_person_id = v_uid then
    raise exception 'cannot_follow_self';
  end if;

  select exists (
    select 1 from public.people_follows
    where follower_id = v_uid and person_id = p_person_id
  ) into v_exists;

  if v_exists then
    delete from public.people_follows
    where follower_id = v_uid and person_id = p_person_id;
  else
    if public.users_are_blocked(v_uid, p_person_id) then
      raise exception 'blocked';
    end if;

    select coalesce(privacy_public_profile, true)
    into v_public
    from public.users
    where id = p_person_id;

    if not found then
      raise exception 'person_not_found';
    end if;

    if v_public is distinct from true then
      raise exception 'profile_private';
    end if;

    insert into public.people_follows (follower_id, person_id)
    values (v_uid, p_person_id)
    on conflict do nothing;
  end if;

  select count(*) into v_count
  from public.people_follows
  where person_id = p_person_id;

  return jsonb_build_object(
    'following', not v_exists,
    'person_id', p_person_id,
    'follower_count', v_count
  );
end;
$$;

-- Enforce on collab invite (no-op replace if function missing — create or replace)
create or replace function public.invite_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_follows boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_invite_self';
  end if;

  if public.users_are_blocked(v_uid, p_user_id) then
    raise exception 'blocked';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_invite_owner';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_user_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found and v_existing = 'pending' then
    null;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status
    )
    values (p_playlist_id, p_user_id, v_uid, 'pending');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_invite'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'status', 'pending'
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_user_id,
    v_uid,
    'playlist_collab_invite',
    coalesce(nullif(trim(v_name), ''), 'a playlist'),
    p_playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'notification_id', v_notif_id
  );
end;
$$;

-- Soft-patch share RPCs with block check (recreate bodies from send_to_friend)
create or replace function public.notify_track_share(
  p_recipient_id uuid,
  p_track_id text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_title text;
  v_note text;
  v_follows boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_share_self';
  end if;

  if public.users_are_blocked(v_uid, p_recipient_id) then
    raise exception 'blocked';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_recipient_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id)
    and (
      t.status is null
      or t.status = 'published'
      or t.artist_id::text = v_uid::text
    );

  if not found then
    raise exception 'track_not_found';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 140 then
    v_note := left(v_note, 140);
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_recipient_id
      and n.actor_id = v_uid
      and n.kind = 'track_share'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    p_recipient_id,
    v_uid,
    'track_share',
    case
      when v_note is null then coalesce(nullif(trim(v_title), ''), 'a track')
      else left(coalesce(nullif(trim(v_title), ''), 'a track') || ' — ' || v_note, 280)
    end,
    trim(p_track_id)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.notify_playlist_share(
  p_recipient_id uuid,
  p_playlist_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_name text;
  v_public boolean;
  v_note text;
  v_follows boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_share_self';
  end if;

  if public.users_are_blocked(v_uid, p_recipient_id) then
    raise exception 'blocked';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_recipient_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select p.name, p.is_public into v_name, v_public
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 140 then
    v_note := left(v_note, 140);
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_recipient_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_share'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_recipient_id,
    v_uid,
    'playlist_share',
    case
      when v_note is null then coalesce(nullif(trim(v_name), ''), 'a playlist')
      else left(coalesce(nullif(trim(v_name), ''), 'a playlist') || ' — ' || v_note, 280)
    end,
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

notify pgrst, 'reload schema';

-- END 20260809_user_blocks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_block_drops_playlist_follows.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Block also drops playlist follows + gates new mix saves
-- Requires user_blocks + playlist_follows + playlists
-- Paste in Supabase SQL Editor → Run
-- ============================================================

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

  -- Drop people-follow edges both ways
  if to_regclass('public.people_follows') is not null then
    delete from public.people_follows
    where (follower_id = v_uid and person_id = p_user_id)
       or (follower_id = p_user_id and person_id = v_uid);
  end if;

  -- Drop artist-follow edges both ways
  if to_regclass('public.artist_follows') is not null then
    delete from public.artist_follows
    where (follower_id = v_uid and artist_id = p_user_id)
       or (follower_id = p_user_id and artist_id = v_uid);
  end if;

  -- Drop mix saves where either person follows the other's playlists
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

    if to_regclass('public.user_blocks') is not null
       and public.users_are_blocked(v_uid, v_owner) then
      raise exception 'blocked';
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

  if to_regclass('public.user_blocks') is not null
     and public.users_are_blocked(v_uid, v_owner) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
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

create or replace function public.notify_playlist_followers_track_add(
  p_playlist_id uuid,
  p_track_id text
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
  v_name text;
  v_title text;
  v_body text;
  v_notified integer := 0;
  v_skipped integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private', 'notified', 0);
  end if;

  if v_owner <> v_uid then
    if not public.is_accepted_playlist_collaborator(p_playlist_id, v_uid) then
      raise exception 'not_allowed';
    end if;
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  v_body := coalesce(nullif(trim(v_title), ''), 'a track')
    || ' · '
    || coalesce(nullif(trim(v_name), ''), 'playlist');

  for r in
    select f.follower_id
    from public.playlist_follows f
    where f.playlist_id = p_playlist_id
      and f.follower_id <> v_uid
    order by f.created_at desc
    limit 40
  loop
    if to_regclass('public.user_blocks') is not null
       and public.users_are_blocked(v_uid, r.follower_id) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = r.follower_id
        and n.kind = 'playlist_track_add'
        and n.playlist_id = p_playlist_id
        and n.track_id = trim(p_track_id)
        and n.read_at is null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id, track_id
    )
    values (
      r.follower_id,
      v_uid,
      'playlist_track_add',
      left(v_body, 280),
      p_playlist_id,
      trim(p_track_id)
    );
    v_notified := v_notified + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'notified', v_notified,
    'skipped_unread', v_skipped
  );
end;
$$;

revoke all on function public.notify_playlist_followers_track_add(uuid, text) from public;
grant execute on function public.notify_playlist_followers_track_add(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_block_drops_playlist_follows.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_block_drops_artist_follows.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Block also drops artist follows + gates new artist follows
-- Requires user_blocks + artist_follows
-- Paste in Supabase SQL Editor → Run
-- ============================================================

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

  -- Drop people-follow edges both ways
  if to_regclass('public.people_follows') is not null then
    delete from public.people_follows
    where (follower_id = v_uid and person_id = p_user_id)
       or (follower_id = p_user_id and person_id = v_uid);
  end if;

  -- Drop artist-follow edges both ways (Following feed leak)
  if to_regclass('public.artist_follows') is not null then
    delete from public.artist_follows
    where (follower_id = v_uid and artist_id = p_user_id)
       or (follower_id = p_user_id and artist_id = v_uid);
  end if;

  return jsonb_build_object(
    'blocked', true,
    'user_id', p_user_id
  );
end;
$$;

revoke all on function public.toggle_user_block(uuid) from public;
grant execute on function public.toggle_user_block(uuid) to authenticated;

create or replace function public.toggle_artist_follow(p_artist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_artist_id is null then
    raise exception 'artist_required';
  end if;

  if p_artist_id = v_uid then
    raise exception 'cannot_follow_self';
  end if;

  select exists (
    select 1 from public.artist_follows
    where follower_id = v_uid and artist_id = p_artist_id
  ) into v_exists;

  if v_exists then
    delete from public.artist_follows
    where follower_id = v_uid and artist_id = p_artist_id;
  else
    if to_regclass('public.user_blocks') is not null
       and public.users_are_blocked(v_uid, p_artist_id) then
      raise exception 'blocked';
    end if;

    insert into public.artist_follows (follower_id, artist_id)
    values (v_uid, p_artist_id)
    on conflict do nothing;
  end if;

  select count(*) into v_count
  from public.artist_follows
  where artist_id = p_artist_id;

  return jsonb_build_object(
    'following', not v_exists,
    'artist_id', p_artist_id,
    'follower_count', v_count
  );
end;
$$;

revoke all on function public.toggle_artist_follow(uuid) from public;
grant execute on function public.toggle_artist_follow(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_block_drops_artist_follows.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_follows.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260809_playlist_follows.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_collaborators.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Collaborative playlists — paste in Supabase SQL Editor → Run
-- Requires playlists + people_follows + artist_notifications
-- ============================================================

create table if not exists public.playlist_collaborators (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (playlist_id, user_id),
  constraint playlist_collaborators_not_owner check (user_id <> invited_by)
);

create index if not exists playlist_collaborators_user_status_idx
  on public.playlist_collaborators (user_id, status);

create index if not exists playlist_collaborators_playlist_status_idx
  on public.playlist_collaborators (playlist_id, status);

alter table public.playlist_collaborators enable row level security;

drop policy if exists "playlist_collaborators_select" on public.playlist_collaborators;
create policy "playlist_collaborators_select"
  on public.playlist_collaborators for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

-- No direct insert/update/delete — RPCs only

create or replace function public.is_accepted_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.playlist_collaborators c
    where c.playlist_id = p_playlist_id
      and c.user_id = p_user_id
      and c.status = 'accepted'
  );
$$;

revoke all on function public.is_accepted_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.is_accepted_playlist_collaborator(uuid, uuid) to authenticated;

-- Collaborators can read private playlists they're on (pending or accepted)
drop policy if exists "playlists_select_own_or_public" on public.playlists;
create policy "playlists_select_own_or_public"
  on public.playlists for select
  to authenticated
  using (
    user_id = auth.uid()
    or is_public = true
    or exists (
      select 1 from public.playlist_collaborators c
      where c.playlist_id = id
        and c.user_id = auth.uid()
        and c.status in ('pending', 'accepted')
    )
  );

drop policy if exists "playlist_tracks_select_own_or_public" on public.playlist_tracks;
create policy "playlist_tracks_select_own_or_public"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (
          p.user_id = auth.uid()
          or p.is_public = true
          or public.is_accepted_playlist_collaborator(p.id, auth.uid())
          or exists (
            select 1 from public.playlist_collaborators c
            where c.playlist_id = p.id
              and c.user_id = auth.uid()
              and c.status = 'pending'
          )
        )
    )
  );

drop policy if exists "playlist_tracks_insert_own" on public.playlist_tracks;
drop policy if exists "playlist_tracks_insert_editor" on public.playlist_tracks;
create policy "playlist_tracks_insert_editor"
  on public.playlist_tracks for insert
  to authenticated
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (
          p.user_id = auth.uid()
          or public.is_accepted_playlist_collaborator(p.id, auth.uid())
        )
    )
  );

-- Bump playlist updated_at when tracks change (owners + collabs)
create or replace function public.touch_playlist_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.playlists
  set updated_at = now()
  where id = coalesce(new.playlist_id, old.playlist_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists playlist_tracks_touch_playlist on public.playlist_tracks;
create trigger playlist_tracks_touch_playlist
  after insert or delete or update on public.playlist_tracks
  for each row
  execute function public.touch_playlist_updated_at();

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.invite_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_follows boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_invite_self';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_invite_owner';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_user_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found and v_existing = 'pending' then
    -- refresh invite notification if needed
    null;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status
    )
    values (p_playlist_id, p_user_id, v_uid, 'pending');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_invite'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'status', 'pending'
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_user_id,
    v_uid,
    'playlist_collab_invite',
    coalesce(nullif(trim(v_name), ''), 'a playlist'),
    p_playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.invite_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.invite_playlist_collaborator(uuid, uuid) to authenticated;

create or replace function public.respond_playlist_collab(
  p_playlist_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.playlist_collaborators%rowtype;
  v_name text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select * into v_row
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = v_uid;

  if not found then
    raise exception 'invite_not_found';
  end if;

  if v_row.status = 'accepted' and p_accept then
    return jsonb_build_object('ok', true, 'skipped', 'already_accepted', 'status', 'accepted');
  end if;

  if not p_accept then
    delete from public.playlist_collaborators
    where playlist_id = p_playlist_id and user_id = v_uid;

    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_uid
      and playlist_id = p_playlist_id
      and kind = 'playlist_collab_invite'
      and read_at is null;

    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  update public.playlist_collaborators
  set status = 'accepted',
      responded_at = now()
  where playlist_id = p_playlist_id and user_id = v_uid;

  select coalesce(nullif(trim(p.name), ''), 'a playlist') into v_name
  from public.playlists p
  where p.id = p_playlist_id;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and playlist_id = p_playlist_id
    and kind = 'playlist_collab_invite'
    and read_at is null;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_row.invited_by
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_accepted'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      v_row.invited_by,
      v_uid,
      'playlist_collab_accepted',
      v_name,
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.respond_playlist_collab(uuid, boolean) from public;
grant execute on function public.respond_playlist_collab(uuid, boolean) to authenticated;

create or replace function public.remove_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_target uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  v_target := coalesce(p_user_id, v_uid);

  -- Owner removes someone, or collaborator leaves
  if v_uid = v_owner then
    if v_target = v_owner then
      raise exception 'cannot_remove_owner';
    end if;
  elsif v_uid = v_target then
    null; -- leave
  else
    raise exception 'not_allowed';
  end if;

  delete from public.playlist_collaborators
  where playlist_id = p_playlist_id and user_id = v_target
  returning user_id into v_target;

  if not found then
    raise exception 'collaborator_not_found';
  end if;

  return jsonb_build_object('ok', true, 'removed', v_target);
end;
$$;

revoke all on function public.remove_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.remove_playlist_collaborator(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_collaborators.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_collab_asks_durable.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Durable mix collab asks (survive Mark all read)
-- Requires collab_approve_from_request + playlist_collab_request
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.playlist_collab_asks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  asker_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  notification_id bigint,
  primary key (playlist_id, asker_id)
);

create index if not exists playlist_collab_asks_asker_idx
  on public.playlist_collab_asks (asker_id, created_at desc);

create index if not exists playlist_collab_asks_playlist_idx
  on public.playlist_collab_asks (playlist_id, created_at desc);

alter table public.playlist_collab_asks enable row level security;

-- No direct client writes — RPCs only. Select: owner or asker.
drop policy if exists "playlist_collab_asks_select" on public.playlist_collab_asks;
create policy "playlist_collab_asks_select"
  on public.playlist_collab_asks for select
  to authenticated
  using (
    asker_id = auth.uid()
    or exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

grant select on public.playlist_collab_asks to authenticated;

-- Backfill open asks from request notifications (prefer unread; else any if not collab)
insert into public.playlist_collab_asks (playlist_id, asker_id, created_at, notification_id)
select distinct on (n.playlist_id, n.actor_id)
  n.playlist_id,
  n.actor_id,
  n.created_at,
  n.id
from public.artist_notifications n
join public.playlists p on p.id = n.playlist_id
where n.kind = 'playlist_collab_request'
  and n.playlist_id is not null
  and n.actor_id is not null
  and n.recipient_id = p.user_id
  and not exists (
    select 1 from public.playlist_collaborators c
    where c.playlist_id = n.playlist_id
      and c.user_id = n.actor_id
      and c.status = 'accepted'
  )
order by n.playlist_id, n.actor_id, (n.read_at is null) desc, n.created_at desc
on conflict (playlist_id, asker_id) do nothing;

-- Drop asks that were already resolved as accepted collabs
delete from public.playlist_collab_asks a
using public.playlist_collaborators c
where a.playlist_id = c.playlist_id
  and a.asker_id = c.user_id
  and c.status = 'accepted';

create or replace function public.notify_playlist_collab_request(
  p_playlist_id uuid
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
  v_name text;
  v_follows boolean;
  v_status text;
  v_id bigint;
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

  if v_owner is null or v_owner = v_uid then
    raise exception 'cannot_request_own';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = v_owner
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select c.status into v_status
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = v_uid;

  if found and v_status = 'accepted' then
    return jsonb_build_object('ok', true, 'skipped', 'already_collaborator');
  end if;

  if found and v_status = 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'invite_pending');
  end if;

  -- Durable open ask (survives Mark all read)
  if exists (
    select 1 from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id and a.asker_id = v_uid
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_asked');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_collab_request',
    coalesce(nullif(trim(v_name), ''), 'your mix'),
    p_playlist_id
  )
  returning id into v_id;

  insert into public.playlist_collab_asks (
    playlist_id, asker_id, notification_id
  )
  values (p_playlist_id, v_uid, v_id)
  on conflict (playlist_id, asker_id) do nothing;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_collab_request(uuid) from public;
grant execute on function public.notify_playlist_collab_request(uuid) to authenticated;

create or replace function public.has_playlist_collab_ask_pending(
  p_playlist_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_playlist_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id
      and a.asker_id = v_uid
  );
end;
$$;

revoke all on function public.has_playlist_collab_ask_pending(uuid) from public;
grant execute on function public.has_playlist_collab_ask_pending(uuid) to authenticated;

create or replace function public.cancel_playlist_collab_ask(
  p_playlist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_deleted int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  delete from public.playlist_collab_asks
  where playlist_id = p_playlist_id and asker_id = v_uid;

  get diagnostics v_deleted = row_count;

  if v_owner is not null then
    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_owner
      and actor_id = v_uid
      and kind = 'playlist_collab_request'
      and playlist_id = p_playlist_id
      and read_at is null;
  end if;

  if v_deleted = 0 then
    return jsonb_build_object('ok', true, 'skipped', 'not_asked');
  end if;

  return jsonb_build_object('ok', true, 'cancelled', true);
end;
$$;

revoke all on function public.cancel_playlist_collab_ask(uuid) from public;
grant execute on function public.cancel_playlist_collab_ask(uuid) to authenticated;

create or replace function public.list_playlist_collab_asks(
  p_playlist_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'asker_id', a.asker_id,
          'created_at', a.created_at,
          'notification_id', a.notification_id
        )
        order by a.created_at asc
      )
      from public.playlist_collab_asks a
      where a.playlist_id = p_playlist_id
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_playlist_collab_asks(uuid) from public;
grant execute on function public.list_playlist_collab_asks(uuid) to authenticated;

create or replace function public.approve_playlist_collab_request(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_asked boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_approve_self';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
          or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_approve_owner';
  end if;

  select exists (
    select 1 from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id and a.asker_id = p_user_id
  ) into v_asked;

  -- Fallback: legacy notification-only asks before this migration
  if not v_asked then
    select exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = v_uid
        and n.actor_id = p_user_id
        and n.kind = 'playlist_collab_request'
        and n.playlist_id = p_playlist_id
    ) into v_asked;
  end if;

  if not v_asked then
    raise exception 'no_request';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    delete from public.playlist_collab_asks
    where playlist_id = p_playlist_id and asker_id = p_user_id;

    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_uid
      and actor_id = p_user_id
      and kind = 'playlist_collab_request'
      and playlist_id = p_playlist_id
      and read_at is null;

    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found then
    update public.playlist_collaborators
    set status = 'accepted',
        invited_by = coalesce(invited_by, v_uid),
        responded_at = now()
    where playlist_id = p_playlist_id and user_id = p_user_id;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status, responded_at
    )
    values (
      p_playlist_id, p_user_id, v_uid, 'accepted', now()
    );
  end if;

  delete from public.playlist_collab_asks
  where playlist_id = p_playlist_id and asker_id = p_user_id;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = p_user_id
    and actor_id = v_uid
    and kind = 'playlist_collab_invite'
    and playlist_id = p_playlist_id
    and read_at is null;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_accepted'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      p_user_id,
      v_uid,
      'playlist_collab_accepted',
      coalesce(nullif(trim(v_name), ''), 'a playlist'),
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.approve_playlist_collab_request(uuid, uuid) from public;
grant execute on function public.approve_playlist_collab_request(uuid, uuid) to authenticated;

create or replace function public.decline_playlist_collab_request(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_asked boolean;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  select exists (
    select 1 from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id and a.asker_id = p_user_id
  ) into v_asked;

  if not v_asked then
    select exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = v_uid
        and n.actor_id = p_user_id
        and n.kind = 'playlist_collab_request'
        and n.playlist_id = p_playlist_id
        and n.read_at is null
    ) into v_asked;
  end if;

  if not v_asked then
    return jsonb_build_object('ok', true, 'skipped', 'no_open_request');
  end if;

  delete from public.playlist_collab_asks
  where playlist_id = p_playlist_id and asker_id = p_user_id;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  if not (
       to_regclass('public.user_blocks') is not null
       and exists (
         select 1 from public.user_blocks b
         where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
            or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
       )
     )
     and not exists (
       select 1 from public.artist_notifications n
       where n.recipient_id = p_user_id
         and n.actor_id = v_uid
         and n.kind = 'playlist_collab_declined'
         and n.playlist_id = p_playlist_id
         and n.read_at is null
     )
  then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      p_user_id,
      v_uid,
      'playlist_collab_declined',
      coalesce(nullif(trim(v_name), ''), 'a playlist'),
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'declined',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.decline_playlist_collab_request(uuid, uuid) from public;
grant execute on function public.decline_playlist_collab_request(uuid, uuid) to authenticated;

-- Invite-from-ask also honors durable asks
create or replace function public.invite_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_follows boolean;
  v_asked boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_invite_self';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
          or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_invite_owner';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_user_id
  ) into v_follows;

  select exists (
    select 1 from public.playlist_collab_asks a
    where a.playlist_id = p_playlist_id and a.asker_id = p_user_id
  ) into v_asked;

  if not v_asked then
    select exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = v_uid
        and n.actor_id = p_user_id
        and n.kind = 'playlist_collab_request'
        and n.playlist_id = p_playlist_id
    ) into v_asked;
  end if;

  if not v_follows and not v_asked then
    raise exception 'not_following';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found and v_existing = 'pending' then
    null;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status
    )
    values (p_playlist_id, p_user_id, v_uid, 'pending');
  end if;

  delete from public.playlist_collab_asks
  where playlist_id = p_playlist_id and asker_id = p_user_id;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_invite'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'status', 'pending'
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_user_id,
    v_uid,
    'playlist_collab_invite',
    coalesce(nullif(trim(v_name), ''), 'a playlist'),
    p_playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.invite_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.invite_playlist_collaborator(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_collab_asks_durable.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_comments.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Playlist comments — paste in Supabase SQL Editor → Run
-- Requires playlists (+ is_public) + artist_notifications
-- ============================================================

create table if not exists public.playlist_comments (
  id bigint generated always as identity primary key,
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint playlist_comments_body_len check (
    char_length(trim(body)) between 1 and 500
  )
);

create index if not exists playlist_comments_playlist_created_idx
  on public.playlist_comments (playlist_id, created_at desc);

create index if not exists playlist_comments_user_id_idx
  on public.playlist_comments (user_id);

alter table public.playlist_comments enable row level security;

drop policy if exists "playlist_comments_select" on public.playlist_comments;
create policy "playlist_comments_select"
  on public.playlist_comments for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (p.is_public = true or p.user_id = auth.uid())
    )
  );

drop policy if exists "playlist_comments_insert_own" on public.playlist_comments;
create policy "playlist_comments_insert_own"
  on public.playlist_comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (p.is_public = true or p.user_id = auth.uid())
    )
  );

drop policy if exists "playlist_comments_delete" on public.playlist_comments;
create policy "playlist_comments_delete"
  on public.playlist_comments for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_playlist_comment(
  p_playlist_id uuid,
  p_comment_preview text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_id bigint;
  v_body text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner is null or v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self_or_no_owner');
  end if;

  -- Respect blocks when table exists
  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  v_body := nullif(trim(coalesce(p_comment_preview, '')), '');
  if v_body is not null and char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;
  if v_body is null then
    v_body := coalesce(nullif(trim(v_name), ''), 'your playlist');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment'
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
    'playlist_comment',
    v_body,
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_comment(uuid, text) from public;
grant execute on function public.notify_playlist_comment(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_comments.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_comment_replies_likes.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Playlist comment replies + likes — paste in Supabase SQL Editor → Run
-- Requires 20260809_playlist_comments.sql
-- ============================================================

alter table public.playlist_comments
  add column if not exists parent_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'playlist_comments_parent_fk'
  ) then
    alter table public.playlist_comments
      add constraint playlist_comments_parent_fk
      foreign key (parent_id)
      references public.playlist_comments (id)
      on delete cascade;
  end if;
end $$;

create index if not exists playlist_comments_parent_id_idx
  on public.playlist_comments (parent_id)
  where parent_id is not null;

create table if not exists public.playlist_comment_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  comment_id bigint not null references public.playlist_comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create index if not exists playlist_comment_likes_comment_id_idx
  on public.playlist_comment_likes (comment_id);

alter table public.playlist_comment_likes enable row level security;

drop policy if exists "playlist_comment_likes_select" on public.playlist_comment_likes;
create policy "playlist_comment_likes_select"
  on public.playlist_comment_likes for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.playlist_comments c
      where c.id = comment_id
    )
  );

drop policy if exists "playlist_comment_likes_insert_own" on public.playlist_comment_likes;
create policy "playlist_comment_likes_insert_own"
  on public.playlist_comment_likes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "playlist_comment_likes_delete_own" on public.playlist_comment_likes;
create policy "playlist_comment_likes_delete_own"
  on public.playlist_comment_likes for delete
  to authenticated
  using (user_id = auth.uid());

alter table public.artist_notifications
  add column if not exists playlist_comment_id bigint;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_playlist_comment_reply(
  p_parent_comment_id bigint,
  p_reply_preview text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_parent_user uuid;
  v_playlist_id uuid;
  v_id bigint;
  v_body text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_parent_comment_id is null then
    raise exception 'parent_required';
  end if;

  select c.user_id, c.playlist_id
  into v_parent_user, v_playlist_id
  from public.playlist_comments c
  where c.id = p_parent_comment_id;

  if not found then
    raise exception 'parent_not_found';
  end if;

  if v_parent_user = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_parent_user)
          or (b.blocker_id = v_parent_user and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  v_body := coalesce(
    nullif(trim(p_reply_preview), ''),
    'replied to your comment'
  );
  if char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_parent_user
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment_reply'
      and n.playlist_id = v_playlist_id
      and n.playlist_comment_id = p_parent_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_parent_user,
    v_uid,
    'playlist_comment_reply',
    v_body,
    v_playlist_id,
    p_parent_comment_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_comment_reply(bigint, text) from public;
grant execute on function public.notify_playlist_comment_reply(bigint, text) to authenticated;

create or replace function public.toggle_playlist_comment_like(p_comment_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count integer;
  v_author uuid;
  v_playlist uuid;
  v_snippet text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select c.user_id, c.playlist_id, left(trim(c.body), 80)
  into v_author, v_playlist, v_snippet
  from public.playlist_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  select exists (
    select 1 from public.playlist_comment_likes
    where user_id = v_uid and comment_id = p_comment_id
  ) into v_exists;

  if v_exists then
    delete from public.playlist_comment_likes
    where user_id = v_uid and comment_id = p_comment_id;

    select count(*)::integer into v_count
    from public.playlist_comment_likes
    where comment_id = p_comment_id;

    return jsonb_build_object(
      'liked', false,
      'comment_id', p_comment_id,
      'like_count', coalesce(v_count, 0)
    );
  end if;

  insert into public.playlist_comment_likes (user_id, comment_id)
  values (v_uid, p_comment_id)
  on conflict do nothing;

  select count(*)::integer into v_count
  from public.playlist_comment_likes
  where comment_id = p_comment_id;

  if v_author is not null and v_author <> v_uid then
    if not (
      to_regclass('public.user_blocks') is not null
      and exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = v_uid and b.blocked_id = v_author)
           or (b.blocker_id = v_author and b.blocked_id = v_uid)
      )
    ) then
      if not exists (
        select 1 from public.artist_notifications n
        where n.recipient_id = v_author
          and n.actor_id = v_uid
          and n.kind = 'playlist_comment_like'
          and n.playlist_comment_id = p_comment_id
          and n.read_at is null
      ) then
        insert into public.artist_notifications (
          recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
        )
        values (
          v_author,
          v_uid,
          'playlist_comment_like',
          coalesce(nullif(v_snippet, ''), 'your comment'),
          v_playlist,
          p_comment_id
        )
        returning id into v_notif_id;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'liked', true,
    'comment_id', p_comment_id,
    'like_count', coalesce(v_count, 0),
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.toggle_playlist_comment_like(bigint) from public;
grant execute on function public.toggle_playlist_comment_like(bigint) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_comment_replies_likes.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_track_comments.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Track comments + artist inbox notify — paste in Supabase SQL Editor → Run
-- Requires artist_notifications (+ track_id) migrations
-- Safe to re-run. Includes people_follow in kind check so it won't clash
-- with 20260809_people_follow_notify.sql.
-- ============================================================

create table if not exists public.track_comments (
  id bigint generated always as identity primary key,
  track_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint track_comments_body_len check (
    char_length(trim(body)) between 1 and 500
  )
);

create index if not exists track_comments_track_created_idx
  on public.track_comments (track_id, created_at desc);

create index if not exists track_comments_user_id_idx
  on public.track_comments (user_id);

alter table public.track_comments enable row level security;

-- Read: published tracks for anyone; drafts for owner/artist only
drop policy if exists "track_comments_select" on public.track_comments;
create policy "track_comments_select"
  on public.track_comments for select
  to authenticated, anon
  using (
    exists (
      select 1
      from public.tracks t
      where t.id::text = track_comments.track_id
        and (
          lower(coalesce(t.status, 'published')) not in ('pending', 'draft', 'unpublished')
          or t.artist_id::text = auth.uid()::text
        )
    )
  );

drop policy if exists "track_comments_insert_own" on public.track_comments;
create policy "track_comments_insert_own"
  on public.track_comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.tracks t
      where t.id::text = track_id
        and (
          lower(coalesce(t.status, 'published')) not in ('pending', 'draft', 'unpublished')
          or t.artist_id::text = auth.uid()::text
        )
    )
  );

drop policy if exists "track_comments_delete_own" on public.track_comments;
create policy "track_comments_delete_own"
  on public.track_comments for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.tracks t
      where t.id::text = track_id
        and t.artist_id::text = auth.uid()::text
    )
  );

-- Ensure notify columns exist
alter table public.artist_notifications
  add column if not exists track_id text;

-- Widen kinds (must include every kind already in use)
alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_track_comment(
  p_track_id text,
  p_comment_preview text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_id bigint;
  v_body text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select
    nullif(trim(t.artist_id::text), '')::uuid,
    t.title
  into v_artist, v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_artist');
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  v_body := coalesce(
    nullif(trim(p_comment_preview), ''),
    coalesce(nullif(trim(v_title), ''), 'your track')
  );

  -- Soft-cap spam: one unread comment notice per actor+track
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'comment'
      and n.track_id = p_track_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_artist,
    v_uid,
    'comment',
    left(v_body, 200),
    p_track_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'track_id', p_track_id);
end;
$$;

revoke all on function public.notify_track_comment(text, text) from public;
grant execute on function public.notify_track_comment(text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_track_comments.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_comment_replies.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Comment replies + fan notify — paste in Supabase SQL Editor → Run
-- Requires 20260809_track_comments.sql (+ later notification kinds)
-- ============================================================

alter table public.track_comments
  add column if not exists parent_id bigint;

-- Self-FK (one-level replies: parent must be top-level — enforced in app/RPC)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'track_comments_parent_fk'
  ) then
    alter table public.track_comments
      add constraint track_comments_parent_fk
      foreign key (parent_id)
      references public.track_comments (id)
      on delete cascade;
  end if;
end $$;

create index if not exists track_comments_parent_id_idx
  on public.track_comments (parent_id)
  where parent_id is not null;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_comment_reply(
  p_parent_comment_id bigint,
  p_reply_preview text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_parent_user uuid;
  v_track_id text;
  v_id bigint;
  v_body text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_parent_comment_id is null then
    raise exception 'parent_required';
  end if;

  select c.user_id, c.track_id
  into v_parent_user, v_track_id
  from public.track_comments c
  where c.id = p_parent_comment_id;

  if not found then
    raise exception 'parent_not_found';
  end if;

  if v_parent_user = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  v_body := coalesce(
    nullif(trim(p_reply_preview), ''),
    'replied to your comment'
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_parent_user
      and n.actor_id = v_uid
      and n.kind = 'comment_reply'
      and n.track_id = v_track_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_parent_user,
    v_uid,
    'comment_reply',
    left(v_body, 200),
    v_track_id
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', v_track_id,
    'recipient_id', v_parent_user
  );
end;
$$;

revoke all on function public.notify_comment_reply(bigint, text) from public;
grant execute on function public.notify_comment_reply(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_comment_replies.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_comment_likes.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Comment likes — paste in Supabase SQL Editor → Run
-- Requires track_comments + artist_notifications
-- ============================================================

create table if not exists public.comment_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  comment_id bigint not null references public.track_comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create index if not exists comment_likes_comment_id_idx
  on public.comment_likes (comment_id);

create index if not exists comment_likes_user_created_idx
  on public.comment_likes (user_id, created_at desc);

alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes_select_own" on public.comment_likes;
create policy "comment_likes_select_own"
  on public.comment_likes for select
  to authenticated
  using (user_id = auth.uid());

-- Anyone signed in can count likes on readable comments
drop policy if exists "comment_likes_select_counts" on public.comment_likes;
create policy "comment_likes_select_counts"
  on public.comment_likes for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.track_comments c
      where c.id = comment_likes.comment_id
    )
  );

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own"
  on public.comment_likes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own"
  on public.comment_likes for delete
  to authenticated
  using (user_id = auth.uid());

alter table public.artist_notifications
  add column if not exists comment_id bigint;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.toggle_comment_like(p_comment_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count integer;
  v_author uuid;
  v_track text;
  v_snippet text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select c.user_id, c.track_id, left(trim(c.body), 80)
  into v_author, v_track, v_snippet
  from public.track_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  select exists (
    select 1 from public.comment_likes
    where user_id = v_uid and comment_id = p_comment_id
  ) into v_exists;

  if v_exists then
    delete from public.comment_likes
    where user_id = v_uid and comment_id = p_comment_id;

    select count(*)::integer into v_count
    from public.comment_likes
    where comment_id = p_comment_id;

    return jsonb_build_object(
      'liked', false,
      'comment_id', p_comment_id,
      'like_count', coalesce(v_count, 0)
    );
  end if;

  insert into public.comment_likes (user_id, comment_id)
  values (v_uid, p_comment_id)
  on conflict do nothing;

  select count(*)::integer into v_count
  from public.comment_likes
  where comment_id = p_comment_id;

  -- Soft-notify comment author (not self)
  if v_author is not null and v_author <> v_uid then
    if not exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = v_author
        and n.actor_id = v_uid
        and n.kind = 'comment_like'
        and n.comment_id = p_comment_id
        and n.read_at is null
    ) then
      insert into public.artist_notifications (
        recipient_id, actor_id, kind, body, track_id, comment_id
      )
      values (
        v_author,
        v_uid,
        'comment_like',
        coalesce(nullif(v_snippet, ''), 'your comment'),
        v_track,
        p_comment_id
      )
      returning id into v_notif_id;
    end if;
  end if;

  return jsonb_build_object(
    'liked', true,
    'comment_id', p_comment_id,
    'like_count', coalesce(v_count, 0),
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.toggle_comment_like(bigint) from public;
grant execute on function public.toggle_comment_like(bigint) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_comment_likes.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_tracks_duration_secs.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Track duration (seconds) — paste in Supabase SQL Editor → Run
-- Written by upload + playback; shown as mm:ss in the UI
-- ============================================================

alter table public.tracks
  add column if not exists duration_secs integer;

alter table public.tracks
  drop constraint if exists tracks_duration_secs_range;

alter table public.tracks
  add constraint tracks_duration_secs_range
  check (
    duration_secs is null
    or (duration_secs > 0 and duration_secs <= 7200)
  );

notify pgrst, 'reload schema';

-- END 20260809_tracks_duration_secs.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_tracks_language.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Track language — paste in Supabase SQL Editor → Run
-- Powers language chips on upload/edit + taste-aware discovery
-- ============================================================

alter table public.tracks
  add column if not exists language text;

create index if not exists tracks_language_idx
  on public.tracks (language)
  where language is not null;

notify pgrst, 'reload schema';

-- END 20260809_tracks_language.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_collab_track_adds.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Collab track adds: attribution, remove-own, owner notify
-- Requires 20260809_playlist_collaborators.sql
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.playlist_tracks
  add column if not exists added_by uuid references auth.users (id) on delete set null;

create index if not exists playlist_tracks_added_by_idx
  on public.playlist_tracks (playlist_id, added_by)
  where added_by is not null;

-- Default added_by on insert when client omits it
create or replace function public.playlist_tracks_set_added_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.added_by is null then
    new.added_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists playlist_tracks_set_added_by on public.playlist_tracks;
create trigger playlist_tracks_set_added_by
  before insert on public.playlist_tracks
  for each row
  execute function public.playlist_tracks_set_added_by();

-- Backfill nulls to playlist owner (best-effort)
update public.playlist_tracks pt
set added_by = p.user_id
from public.playlists p
where p.id = pt.playlist_id
  and pt.added_by is null;

drop policy if exists "playlist_tracks_delete_own" on public.playlist_tracks;
drop policy if exists "playlist_tracks_delete_editor" on public.playlist_tracks;
create policy "playlist_tracks_delete_editor"
  on public.playlist_tracks for delete
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (
          p.user_id = auth.uid()
          or (
            public.is_accepted_playlist_collaborator(p.id, auth.uid())
            and playlist_tracks.added_by = auth.uid()
          )
        )
    )
  );

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_playlist_collab_add(
  p_playlist_id uuid,
  p_track_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_title text;
  v_notif_id bigint;
  v_body text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'required';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  -- Only accepted collaborators notify the owner
  if v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'owner');
  end if;

  if not public.is_accepted_playlist_collaborator(p_playlist_id, v_uid) then
    raise exception 'not_collaborator';
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  v_body := coalesce(nullif(trim(v_title), ''), 'a track')
    || ' · '
    || coalesce(nullif(trim(v_name), ''), 'playlist');

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_add'
      and n.playlist_id = p_playlist_id
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, track_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_collab_add',
    left(v_body, 280),
    p_playlist_id,
    trim(p_track_id)
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', v_notif_id,
    'recipient_id', v_owner
  );
end;
$$;

revoke all on function public.notify_playlist_collab_add(uuid, text) from public;
grant execute on function public.notify_playlist_collab_add(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_collab_track_adds.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_public_liked_tracks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Public liked songs (opt-in) — paste in Supabase SQL Editor → Run
-- Requires track_likes + user privacy columns
-- ============================================================

alter table public.users
  add column if not exists privacy_show_likes boolean not null default false;

-- When profile is public AND show-likes is on, anyone can read that user's like rows
drop policy if exists "track_likes_select_public_shared" on public.track_likes;
create policy "track_likes_select_public_shared"
  on public.track_likes for select
  to authenticated, anon
  using (
    exists (
      select 1
      from public.users u
      where u.id = track_likes.user_id
        and coalesce(u.privacy_public_profile, true) = true
        and coalesce(u.privacy_show_likes, false) = true
    )
  );

notify pgrst, 'reload schema';

-- END 20260809_public_liked_tracks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_privacy_saves_followed_artists.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Opt-in: Saved mixes + Followed artists on /people
-- Default off (mirror privacy_show_likes)
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.users
  add column if not exists privacy_show_saves boolean not null default false;

alter table public.users
  add column if not exists privacy_show_followed_artists boolean not null default false;

create or replace function public.person_saved_public_playlists(
  p_person_id uuid,
  p_limit integer default 12
)
returns table (
  playlist_id uuid,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_show boolean;
  v_lim integer := greatest(1, least(coalesce(p_limit, 12), 40));
begin
  if p_person_id is null then
    return;
  end if;

  if to_regclass('public.playlist_follows') is null then
    return;
  end if;

  select
    coalesce(u.privacy_public_profile, true),
    coalesce(u.privacy_show_saves, false)
  into v_public, v_show
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true or v_show is not true then
    return;
  end if;

  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return;
  end if;

  return query
  select
    pf.playlist_id,
    pf.created_at as followed_at
  from public.playlist_follows pf
  inner join public.playlists p
    on p.id = pf.playlist_id
   and p.is_public is true
  where pf.follower_id = p_person_id
  order by pf.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.person_saved_public_playlists(uuid, integer) from public;
grant execute on function public.person_saved_public_playlists(uuid, integer) to authenticated, anon;

create or replace function public.person_followed_artists(
  p_person_id uuid,
  p_limit integer default 12
)
returns table (
  artist_id uuid,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_show boolean;
  v_lim integer := greatest(1, least(coalesce(p_limit, 12), 40));
begin
  if p_person_id is null then
    return;
  end if;

  if to_regclass('public.artist_follows') is null then
    return;
  end if;

  select
    coalesce(u.privacy_public_profile, true),
    coalesce(u.privacy_show_followed_artists, false)
  into v_public, v_show
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true or v_show is not true then
    return;
  end if;

  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return;
  end if;

  return query
  select
    f.artist_id,
    f.created_at as followed_at
  from public.artist_follows f
  inner join public.users a
    on a.id = f.artist_id
   and (
     a.account_type = 'artist'
     or a.role = 'artist'
   )
   and coalesce(a.privacy_public_profile, true) = true
  where f.follower_id = p_person_id
  order by f.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.person_followed_artists(uuid, integer) from public;
grant execute on function public.person_followed_artists(uuid, integer) to authenticated, anon;

notify pgrst, 'reload schema';

-- END 20260809_privacy_saves_followed_artists.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_privacy_show_followers.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Opt-in: Followers & Following on /people
-- Default off (mirror privacy_show_likes)
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.users
  add column if not exists privacy_show_followers boolean not null default false;

-- Stop world-readable follow edges; own outgoing/incoming policies remain.
drop policy if exists "people_follows_select_public" on public.people_follows;

create or replace function public.person_people_followers(
  p_person_id uuid,
  p_limit integer default 40
)
returns table (
  follower_id uuid,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_show boolean;
  v_lim integer := greatest(1, least(coalesce(p_limit, 40), 80));
begin
  if p_person_id is null then
    return;
  end if;

  if to_regclass('public.people_follows') is null then
    return;
  end if;

  select
    coalesce(u.privacy_public_profile, true),
    coalesce(u.privacy_show_followers, false)
  into v_public, v_show
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true or v_show is not true then
    return;
  end if;

  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return;
  end if;

  return query
  select
    pf.follower_id,
    pf.created_at as followed_at
  from public.people_follows pf
  where pf.person_id = p_person_id
  order by pf.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.person_people_followers(uuid, integer) from public;
grant execute on function public.person_people_followers(uuid, integer) to authenticated, anon;

create or replace function public.person_people_following(
  p_person_id uuid,
  p_limit integer default 40
)
returns table (
  person_id uuid,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_show boolean;
  v_lim integer := greatest(1, least(coalesce(p_limit, 40), 80));
begin
  if p_person_id is null then
    return;
  end if;

  if to_regclass('public.people_follows') is null then
    return;
  end if;

  select
    coalesce(u.privacy_public_profile, true),
    coalesce(u.privacy_show_followers, false)
  into v_public, v_show
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true or v_show is not true then
    return;
  end if;

  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return;
  end if;

  return query
  select
    pf.person_id,
    pf.created_at as followed_at
  from public.people_follows pf
  where pf.follower_id = p_person_id
  order by pf.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.person_people_following(uuid, integer) from public;
grant execute on function public.person_people_following(uuid, integer) to authenticated, anon;

create or replace function public.person_people_follow_counts(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_show boolean;
  v_followers bigint := 0;
  v_following bigint := 0;
begin
  if p_person_id is null then
    return jsonb_build_object(
      'sharing', false,
      'followers', 0,
      'following', 0
    );
  end if;

  if to_regclass('public.people_follows') is null then
    return jsonb_build_object(
      'sharing', false,
      'followers', 0,
      'following', 0,
      'missing_table', true
    );
  end if;

  select
    coalesce(u.privacy_public_profile, true),
    coalesce(u.privacy_show_followers, false)
  into v_public, v_show
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true or v_show is not true then
    return jsonb_build_object(
      'sharing', false,
      'followers', 0,
      'following', 0
    );
  end if;

  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object(
      'sharing', false,
      'followers', 0,
      'following', 0
    );
  end if;

  select count(*) into v_followers
  from public.people_follows
  where person_id = p_person_id;

  select count(*) into v_following
  from public.people_follows
  where follower_id = p_person_id;

  return jsonb_build_object(
    'sharing', true,
    'followers', v_followers,
    'following', v_following
  );
end;
$$;

revoke all on function public.person_people_follow_counts(uuid) from public;
grant execute on function public.person_people_follow_counts(uuid) to authenticated, anon;

notify pgrst, 'reload schema';

-- END 20260809_privacy_show_followers.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_listen_notifications.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Soft-notify artist when an opted-in listener plays a track
-- Respects privacy_show_activity + user_blocks; unread dedupe
-- Requires artist_notifications + tracks + users
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_track_listen(p_track_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_share boolean;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select
    nullif(trim(t.artist_id::text), '')::uuid,
    t.title
  into v_artist, v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_artist');
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  -- Settings promise: only named when Listening activity is on
  select coalesce(u.privacy_show_activity, true)
  into v_share
  from public.users u
  where u.id = v_uid;

  if not found or v_share is not true then
    return jsonb_build_object('ok', true, 'skipped', 'privacy');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_artist)
          or (b.blocker_id = v_artist and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  -- One unread listen notice per actor+track (avoid play spam)
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'listen'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_artist,
    v_uid,
    'listen',
    coalesce(nullif(trim(v_title), ''), 'your track'),
    trim(p_track_id)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'track_id', trim(p_track_id));
end;
$$;

revoke all on function public.notify_track_listen(text) from public;
grant execute on function public.notify_track_listen(text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_listen_notifications.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_play_activity_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thanks on a friend's shared listen (play activity)
-- Requires plays + people_follows + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.play_thanks (
  play_id text not null,
  thanker_id uuid not null references auth.users (id) on delete cascade,
  listener_id uuid not null references auth.users (id) on delete cascade,
  track_id text,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (play_id, thanker_id),
  constraint play_thanks_message_len check (char_length(message) <= 280),
  constraint play_thanks_not_self check (thanker_id <> listener_id)
);

create index if not exists play_thanks_listener_created_idx
  on public.play_thanks (listener_id, created_at desc);

alter table public.play_thanks enable row level security;

drop policy if exists "play_thanks_select_own" on public.play_thanks;
create policy "play_thanks_select_own"
  on public.play_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or listener_id = auth.uid());

drop policy if exists "play_thanks_insert_own" on public.play_thanks;
create policy "play_thanks_insert_own"
  on public.play_thanks for insert
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

create or replace function public.send_play_thanks(
  p_play_id text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_listener uuid;
  v_track text;
  v_share boolean;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_play_id is null or length(trim(p_play_id)) = 0 then
    raise exception 'play_required';
  end if;

  select
    p.listener_id,
    p.track_id::text
  into v_listener, v_track
  from public.plays p
  where p.id::text = trim(p_play_id);

  if not found then
    raise exception 'play_not_found';
  end if;

  if v_listener is null or v_listener = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  -- Must follow the listener (friends feed)
  if to_regclass('public.people_follows') is null
     or not exists (
       select 1 from public.people_follows f
       where f.follower_id = v_uid and f.person_id = v_listener
     ) then
    raise exception 'not_following';
  end if;

  select coalesce(u.privacy_show_activity, true)
  into v_share
  from public.users u
  where u.id = v_listener;

  if not found or v_share is not true then
    raise exception 'privacy';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_listener)
          or (b.blocker_id = v_listener and b.blocked_id = v_uid)
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
    select 1 from public.play_thanks t
    where t.play_id = trim(p_play_id) and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.play_thanks t
    where t.play_id = trim(p_play_id) and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'play_id', trim(p_play_id)
    );
  end if;

  insert into public.play_thanks (
    play_id, thanker_id, listener_id, track_id, message
  )
  values (
    trim(p_play_id), v_uid, v_listener, v_track, v_message
  );

  -- Soft-cap: one unread activity_thanks per actor+track
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_listener
      and n.actor_id = v_uid
      and n.kind = 'activity_thanks'
      and n.track_id is not distinct from v_track
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'play_id', trim(p_play_id),
      'listener_id', v_listener
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_listener,
    v_uid,
    'activity_thanks',
    v_message,
    v_track
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'play_id', trim(p_play_id),
    'listener_id', v_listener,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_play_thanks(text, text) from public;
grant execute on function public.send_play_thanks(text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_play_activity_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_like_activity_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thanks on a friend's public like
-- Requires track_likes + people_follows + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.like_thanks (
  thanker_id uuid not null references auth.users (id) on delete cascade,
  liker_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (thanker_id, liker_id, track_id),
  constraint like_thanks_message_len check (char_length(message) <= 280),
  constraint like_thanks_not_self check (thanker_id <> liker_id)
);

create index if not exists like_thanks_liker_created_idx
  on public.like_thanks (liker_id, created_at desc);

alter table public.like_thanks enable row level security;

drop policy if exists "like_thanks_select_own" on public.like_thanks;
create policy "like_thanks_select_own"
  on public.like_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or liker_id = auth.uid());

drop policy if exists "like_thanks_insert_own" on public.like_thanks;
create policy "like_thanks_insert_own"
  on public.like_thanks for insert
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

create or replace function public.send_like_thanks(
  p_liker_id uuid,
  p_track_id text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_share boolean;
  v_message text;
  v_track text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_liker_id is null then
    raise exception 'liker_required';
  end if;

  v_track := trim(coalesce(p_track_id, ''));
  if length(v_track) = 0 then
    raise exception 'track_required';
  end if;

  if p_liker_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  if to_regclass('public.people_follows') is null
     or not exists (
       select 1 from public.people_follows f
       where f.follower_id = v_uid and f.person_id = p_liker_id
     ) then
    raise exception 'not_following';
  end if;

  if not exists (
    select 1 from public.track_likes l
    where l.user_id = p_liker_id and l.track_id::text = v_track
  ) then
    raise exception 'like_not_found';
  end if;

  select coalesce(u.privacy_show_likes, false)
  into v_share
  from public.users u
  where u.id = p_liker_id;

  if not found or v_share is not true then
    raise exception 'privacy';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_liker_id)
          or (b.blocker_id = p_liker_id and b.blocked_id = v_uid)
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
    select 1 from public.like_thanks t
    where t.thanker_id = v_uid
      and t.liker_id = p_liker_id
      and t.track_id = v_track
  ) then
    select t.message into v_message
    from public.like_thanks t
    where t.thanker_id = v_uid
      and t.liker_id = p_liker_id
      and t.track_id = v_track;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'liker_id', p_liker_id,
      'track_id', v_track
    );
  end if;

  insert into public.like_thanks (
    thanker_id, liker_id, track_id, message
  )
  values (
    v_uid, p_liker_id, v_track, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_liker_id
      and n.actor_id = v_uid
      and n.kind = 'like_thanks'
      and n.track_id is not distinct from v_track
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'liker_id', p_liker_id,
      'track_id', v_track
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    p_liker_id,
    v_uid,
    'like_thanks',
    v_message,
    v_track
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'liker_id', p_liker_id,
    'track_id', v_track,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_like_thanks(uuid, text, text) from public;
grant execute on function public.send_like_thanks(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_like_activity_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_mix_activity_thanks.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260809_mix_activity_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_comment_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist thanks a fan for a track comment (owner path)
-- Stores comment_id on listen-style comment notifs
-- Requires track_comments + tracks + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists comment_id bigint;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create table if not exists public.comment_thanks (
  comment_id bigint not null references public.track_comments (id) on delete cascade,
  thanker_id uuid not null references auth.users (id) on delete cascade,
  commenter_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, thanker_id),
  constraint comment_thanks_message_len check (char_length(message) <= 280),
  constraint comment_thanks_not_self check (thanker_id <> commenter_id)
);

create index if not exists comment_thanks_commenter_created_idx
  on public.comment_thanks (commenter_id, created_at desc);

alter table public.comment_thanks enable row level security;

drop policy if exists "comment_thanks_select_own" on public.comment_thanks;
create policy "comment_thanks_select_own"
  on public.comment_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or commenter_id = auth.uid());

drop policy if exists "comment_thanks_insert_own" on public.comment_thanks;
create policy "comment_thanks_insert_own"
  on public.comment_thanks for insert
  to authenticated
  with check (thanker_id = auth.uid());

drop function if exists public.notify_track_comment(text, text);
drop function if exists public.notify_track_comment(text, text, bigint);

create or replace function public.notify_track_comment(
  p_track_id text,
  p_comment_preview text default null,
  p_comment_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_id bigint;
  v_body text;
  v_comment bigint := p_comment_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select
    nullif(trim(t.artist_id::text), '')::uuid,
    t.title
  into v_artist, v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_artist');
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  if v_comment is null then
    select c.id
    into v_comment
    from public.track_comments c
    where c.track_id = trim(p_track_id)
      and c.user_id = v_uid
    order by c.created_at desc
    limit 1;
  end if;

  v_body := coalesce(
    nullif(trim(p_comment_preview), ''),
    coalesce(nullif(trim(v_title), ''), 'your track')
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'comment'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'comment_id', v_comment
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, comment_id
  )
  values (
    v_artist,
    v_uid,
    'comment',
    left(v_body, 200),
    trim(p_track_id),
    v_comment
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', trim(p_track_id),
    'comment_id', v_comment
  );
end;
$$;

revoke all on function public.notify_track_comment(text, text, bigint) from public;
grant execute on function public.notify_track_comment(text, text, bigint) to authenticated;

create or replace function public.send_comment_thanks(
  p_comment_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment public.track_comments%rowtype;
  v_artist uuid;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select * into v_comment
  from public.track_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  if v_comment.user_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = v_comment.track_id;

  if v_artist is null or v_artist <> v_uid then
    raise exception 'not_track_owner';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_comment.user_id)
          or (b.blocker_id = v_comment.user_id and b.blocked_id = v_uid)
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
    select 1 from public.comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.comment_thanks (
    comment_id, thanker_id, commenter_id, track_id, message
  )
  values (
    p_comment_id, v_uid, v_comment.user_id, v_comment.track_id, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_comment.user_id
      and n.actor_id = v_uid
      and n.kind = 'comment_thanks'
      and n.comment_id = p_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, comment_id
  )
  values (
    v_comment.user_id,
    v_uid,
    'comment_thanks',
    v_message,
    v_comment.track_id,
    p_comment_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'comment_id', p_comment_id,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_comment_thanks(bigint, text) from public;
grant execute on function public.send_comment_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_comment_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_comment_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Owner thanks a fan for a playlist/mix comment
-- Stores playlist_comment_id on playlist_comment notifs
-- Requires playlist_comments + playlists + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists playlist_comment_id bigint;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create table if not exists public.playlist_comment_thanks (
  comment_id bigint not null references public.playlist_comments (id) on delete cascade,
  thanker_id uuid not null references auth.users (id) on delete cascade,
  commenter_id uuid not null references auth.users (id) on delete cascade,
  playlist_id uuid not null,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, thanker_id),
  constraint playlist_comment_thanks_message_len check (char_length(message) <= 280),
  constraint playlist_comment_thanks_not_self check (thanker_id <> commenter_id)
);

create index if not exists playlist_comment_thanks_commenter_created_idx
  on public.playlist_comment_thanks (commenter_id, created_at desc);

alter table public.playlist_comment_thanks enable row level security;

drop policy if exists "playlist_comment_thanks_select_own" on public.playlist_comment_thanks;
create policy "playlist_comment_thanks_select_own"
  on public.playlist_comment_thanks for select
  to authenticated
  using (thanker_id = auth.uid() or commenter_id = auth.uid());

drop policy if exists "playlist_comment_thanks_insert_own" on public.playlist_comment_thanks;
create policy "playlist_comment_thanks_insert_own"
  on public.playlist_comment_thanks for insert
  to authenticated
  with check (thanker_id = auth.uid());

drop function if exists public.notify_playlist_comment(uuid, text);
drop function if exists public.notify_playlist_comment(uuid, text, bigint);

create or replace function public.notify_playlist_comment(
  p_playlist_id uuid,
  p_comment_preview text default null,
  p_comment_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_id bigint;
  v_body text;
  v_comment bigint := p_comment_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner is null or v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self_or_no_owner');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if v_comment is null then
    select c.id
    into v_comment
    from public.playlist_comments c
    where c.playlist_id = p_playlist_id
      and c.user_id = v_uid
    order by c.created_at desc
    limit 1;
  end if;

  v_body := nullif(trim(coalesce(p_comment_preview, '')), '');
  if v_body is not null and char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;
  if v_body is null then
    v_body := coalesce(nullif(trim(v_name), ''), 'your playlist');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'playlist_comment_id', v_comment
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_comment',
    v_body,
    p_playlist_id,
    v_comment
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'playlist_comment_id', v_comment
  );
end;
$$;

revoke all on function public.notify_playlist_comment(uuid, text, bigint) from public;
grant execute on function public.notify_playlist_comment(uuid, text, bigint) to authenticated;

create or replace function public.send_playlist_comment_thanks(
  p_comment_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment public.playlist_comments%rowtype;
  v_owner uuid;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select * into v_comment
  from public.playlist_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  if v_comment.user_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = v_comment.playlist_id;

  if v_owner is null or v_owner <> v_uid then
    raise exception 'not_playlist_owner';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_comment.user_id)
          or (b.blocker_id = v_comment.user_id and b.blocked_id = v_uid)
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
    select 1 from public.playlist_comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.playlist_comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.playlist_comment_thanks (
    comment_id, thanker_id, commenter_id, playlist_id, message
  )
  values (
    p_comment_id, v_uid, v_comment.user_id, v_comment.playlist_id, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_comment.user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment_thanks'
      and n.playlist_comment_id = p_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_comment.user_id,
    v_uid,
    'playlist_comment_thanks',
    v_message,
    v_comment.playlist_id,
    p_comment_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'comment_id', p_comment_id,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_playlist_comment_thanks(bigint, text) from public;
grant execute on function public.send_playlist_comment_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_comment_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_tip_message_track.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260809_tip_message_track.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_tip_thanks.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260809_tip_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_tip_thanks_track.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260809_tip_thanks_track.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_tip_inbox_thanks.sql
-- ═══════════════════════════════════════════════════════════
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

-- END 20260809_tip_inbox_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_share_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Share thanks — thank someone who sent you a track/mix
-- Requires send_to_friend + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.send_share_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind not in ('track_share', 'playlist_share') then
    raise exception 'not_a_share';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_sharer';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  -- Respect blocks
  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
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

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = 'share_thanks'
      and n.read_at is null
      and (
        (v_n.kind = 'track_share' and n.track_id is not distinct from v_n.track_id)
        or (v_n.kind = 'playlist_share' and n.playlist_id is not distinct from v_n.playlist_id)
      )
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, playlist_id
  )
  values (
    v_n.actor_id,
    v_uid,
    'share_thanks',
    v_message,
    v_n.track_id,
    v_n.playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id
  );
end;
$$;

revoke all on function public.send_share_thanks(bigint, text) from public;
grant execute on function public.send_share_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_share_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_follow_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thank someone who saved your mix (playlist_follow)
-- Requires playlist_follows + artist_notifications (+ share thanks cols)
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.send_playlist_follow_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind is distinct from 'playlist_follow' then
    raise exception 'not_a_playlist_follow';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_saver';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  -- Respect blocks
  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
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

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_follow_thanks'
      and n.read_at is null
      and n.playlist_id is not distinct from v_n.playlist_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_n.actor_id,
    v_uid,
    'playlist_follow_thanks',
    v_message,
    v_n.playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id
  );
end;
$$;

revoke all on function public.send_playlist_follow_thanks(bigint, text) from public;
grant execute on function public.send_playlist_follow_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_follow_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_people_follow_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thank someone who followed you (people_follow)
-- Requires people_follows + artist_notifications (+ thanks cols)
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.send_people_follow_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind is distinct from 'people_follow' then
    raise exception 'not_a_people_follow';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_follower';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
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

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = 'people_follow_thanks'
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body
  )
  values (
    v_n.actor_id,
    v_uid,
    'people_follow_thanks',
    v_message
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id
  );
end;
$$;

revoke all on function public.send_people_follow_thanks(bigint, text) from public;
grant execute on function public.send_people_follow_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_people_follow_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_artist_follow_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thank a fan who followed you as an artist (kind: follow)
-- Requires artist_follows notify + artist_notifications (+ thanks cols)
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.send_follow_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind is distinct from 'follow' then
    raise exception 'not_a_follow';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_follower';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
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

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = 'follow_thanks'
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body
  )
  values (
    v_n.actor_id,
    v_uid,
    'follow_thanks',
    v_message
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id
  );
end;
$$;

revoke all on function public.send_follow_thanks(bigint, text) from public;
grant execute on function public.send_follow_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_artist_follow_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_comment_like_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thank someone who liked your comment (track or mix)
-- Requires comment_likes / playlist_comment_likes + notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.send_comment_like_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
  v_thanks_kind text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind not in ('comment_like', 'playlist_comment_like') then
    raise exception 'not_a_comment_like';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_liker';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
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

  v_thanks_kind := case
    when v_n.kind = 'playlist_comment_like' then 'playlist_comment_like_thanks'
    else 'comment_like_thanks'
  end;

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = v_thanks_kind
      and n.read_at is null
      and (
        (v_n.kind = 'comment_like'
          and n.comment_id is not distinct from v_n.comment_id
          and n.track_id is not distinct from v_n.track_id)
        or (v_n.kind = 'playlist_comment_like'
          and n.playlist_comment_id is not distinct from v_n.playlist_comment_id
          and n.playlist_id is not distinct from v_n.playlist_id)
      )
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, playlist_id,
    comment_id, playlist_comment_id
  )
  values (
    v_n.actor_id,
    v_uid,
    v_thanks_kind,
    v_message,
    v_n.track_id,
    v_n.playlist_id,
    v_n.comment_id,
    v_n.playlist_comment_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id,
    'kind', v_thanks_kind
  );
end;
$$;

revoke all on function public.send_comment_like_thanks(bigint, text) from public;
grant execute on function public.send_comment_like_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_comment_like_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_comment_reply_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Reply thanks — store reply comment ids + allow parent to thank
-- Requires comment_thanks + playlist_comment_thanks migrations
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists comment_id bigint;

alter table public.artist_notifications
  add column if not exists playlist_comment_id bigint;

-- Track comment reply notify: store the reply's comment_id
drop function if exists public.notify_comment_reply(bigint, text);
drop function if exists public.notify_comment_reply(bigint, text, bigint);

create or replace function public.notify_comment_reply(
  p_parent_comment_id bigint,
  p_reply_preview text default null,
  p_reply_comment_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_parent_user uuid;
  v_track_id text;
  v_id bigint;
  v_body text;
  v_reply bigint := p_reply_comment_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_parent_comment_id is null then
    raise exception 'parent_required';
  end if;

  select c.user_id, c.track_id
  into v_parent_user, v_track_id
  from public.track_comments c
  where c.id = p_parent_comment_id;

  if not found then
    raise exception 'parent_not_found';
  end if;

  if v_parent_user = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_parent_user)
          or (b.blocker_id = v_parent_user and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if v_reply is null then
    select c.id
    into v_reply
    from public.track_comments c
    where c.parent_id = p_parent_comment_id
      and c.user_id = v_uid
    order by c.created_at desc
    limit 1;
  end if;

  v_body := coalesce(
    nullif(trim(p_reply_preview), ''),
    'replied to your comment'
  );
  if char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;

  -- Soft-cap: refresh unread row so thanks targets the latest reply
  update public.artist_notifications n
  set body = v_body,
      comment_id = coalesce(v_reply, n.comment_id)
  where n.recipient_id = v_parent_user
    and n.actor_id = v_uid
    and n.kind = 'comment_reply'
    and n.track_id = v_track_id
    and n.read_at is null;

  if found then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'comment_id', v_reply
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, comment_id
  )
  values (
    v_parent_user,
    v_uid,
    'comment_reply',
    v_body,
    v_track_id,
    v_reply
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', v_track_id,
    'comment_id', v_reply,
    'recipient_id', v_parent_user
  );
end;
$$;

revoke all on function public.notify_comment_reply(bigint, text, bigint) from public;
grant execute on function public.notify_comment_reply(bigint, text, bigint) to authenticated;

-- Playlist comment reply notify: store the reply's playlist_comment_id
drop function if exists public.notify_playlist_comment_reply(bigint, text);
drop function if exists public.notify_playlist_comment_reply(bigint, text, bigint);

create or replace function public.notify_playlist_comment_reply(
  p_parent_comment_id bigint,
  p_reply_preview text default null,
  p_reply_comment_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_parent_user uuid;
  v_playlist_id uuid;
  v_id bigint;
  v_body text;
  v_reply bigint := p_reply_comment_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_parent_comment_id is null then
    raise exception 'parent_required';
  end if;

  select c.user_id, c.playlist_id
  into v_parent_user, v_playlist_id
  from public.playlist_comments c
  where c.id = p_parent_comment_id;

  if not found then
    raise exception 'parent_not_found';
  end if;

  if v_parent_user = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_parent_user)
          or (b.blocker_id = v_parent_user and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if v_reply is null then
    select c.id
    into v_reply
    from public.playlist_comments c
    where c.parent_id = p_parent_comment_id
      and c.user_id = v_uid
    order by c.created_at desc
    limit 1;
  end if;

  v_body := coalesce(
    nullif(trim(p_reply_preview), ''),
    'replied to your comment'
  );
  if char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;

  update public.artist_notifications n
  set body = v_body,
      playlist_comment_id = coalesce(v_reply, n.playlist_comment_id)
  where n.recipient_id = v_parent_user
    and n.actor_id = v_uid
    and n.kind = 'playlist_comment_reply'
    and n.playlist_id = v_playlist_id
    and n.read_at is null;

  if found then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'playlist_comment_id', v_reply
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_parent_user,
    v_uid,
    'playlist_comment_reply',
    v_body,
    v_playlist_id,
    v_reply
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'playlist_comment_id', v_reply
  );
end;
$$;

revoke all on function public.notify_playlist_comment_reply(bigint, text, bigint) from public;
grant execute on function public.notify_playlist_comment_reply(bigint, text, bigint) to authenticated;

-- Parent comment author (or track owner) may thank a reply
create or replace function public.send_comment_thanks(
  p_comment_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment public.track_comments%rowtype;
  v_artist uuid;
  v_parent_user uuid;
  v_message text;
  v_notif_id bigint;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select * into v_comment
  from public.track_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  if v_comment.user_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = v_comment.track_id;

  if v_artist is not null and v_artist = v_uid then
    v_allowed := true;
  elsif v_comment.parent_id is not null then
    select c.user_id into v_parent_user
    from public.track_comments c
    where c.id = v_comment.parent_id;
    if v_parent_user is not null and v_parent_user = v_uid then
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    raise exception 'not_allowed';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_comment.user_id)
          or (b.blocker_id = v_comment.user_id and b.blocked_id = v_uid)
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
    select 1 from public.comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.comment_thanks (
    comment_id, thanker_id, commenter_id, track_id, message
  )
  values (
    p_comment_id, v_uid, v_comment.user_id, v_comment.track_id, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_comment.user_id
      and n.actor_id = v_uid
      and n.kind = 'comment_thanks'
      and n.comment_id = p_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, comment_id
  )
  values (
    v_comment.user_id,
    v_uid,
    'comment_thanks',
    v_message,
    v_comment.track_id,
    p_comment_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'comment_id', p_comment_id,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_comment_thanks(bigint, text) from public;
grant execute on function public.send_comment_thanks(bigint, text) to authenticated;

-- Parent comment author (or playlist owner) may thank a mix reply
create or replace function public.send_playlist_comment_thanks(
  p_comment_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment public.playlist_comments%rowtype;
  v_owner uuid;
  v_parent_user uuid;
  v_message text;
  v_notif_id bigint;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_comment_id is null then
    raise exception 'comment_required';
  end if;

  select * into v_comment
  from public.playlist_comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'comment_not_found';
  end if;

  if v_comment.user_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = v_comment.playlist_id;

  if v_owner is not null and v_owner = v_uid then
    v_allowed := true;
  elsif v_comment.parent_id is not null then
    select c.user_id into v_parent_user
    from public.playlist_comments c
    where c.id = v_comment.parent_id;
    if v_parent_user is not null and v_parent_user = v_uid then
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    raise exception 'not_allowed';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_comment.user_id)
          or (b.blocker_id = v_comment.user_id and b.blocked_id = v_uid)
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
    select 1 from public.playlist_comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid
  ) then
    select t.message into v_message
    from public.playlist_comment_thanks t
    where t.comment_id = p_comment_id and t.thanker_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.playlist_comment_thanks (
    comment_id, thanker_id, commenter_id, playlist_id, message
  )
  values (
    p_comment_id, v_uid, v_comment.user_id, v_comment.playlist_id, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_comment.user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_comment_thanks'
      and n.playlist_comment_id = p_comment_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'comment_id', p_comment_id
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, playlist_comment_id
  )
  values (
    v_comment.user_id,
    v_uid,
    'playlist_comment_thanks',
    v_message,
    v_comment.playlist_id,
    p_comment_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'comment_id', p_comment_id,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_playlist_comment_thanks(bigint, text) from public;
grant execute on function public.send_playlist_comment_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_comment_reply_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_people_follow_notify.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- People-follow → inbox — paste in Supabase SQL Editor → Run
-- Requires artist_notifications + people_follows
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_people_follow(p_person_id uuid)
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

  if p_person_id is null then
    raise exception 'person_required';
  end if;

  if p_person_id = v_uid then
    raise exception 'cannot_notify_self';
  end if;

  -- One unread peer-follow notice per actor
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_person_id
      and n.actor_id = v_uid
      and n.kind = 'people_follow'
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body
  )
  values (
    p_person_id,
    v_uid,
    'people_follow',
    'started following you'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_people_follow(uuid) from public;
grant execute on function public.notify_people_follow(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_people_follow_notify.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_send_to_friend.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- In-app send to friend — paste in Supabase SQL Editor → Run
-- Requires artist_notifications + people_follows
-- Optional: playlist_id on notifications (playlist follows migration)
-- ============================================================

alter table public.artist_notifications
  add column if not exists playlist_id uuid;

alter table public.artist_notifications
  add column if not exists track_id text;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_track_share(
  p_recipient_id uuid,
  p_track_id text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_title text;
  v_note text;
  v_follows boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_share_self';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_recipient_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id)
    and (
      t.status is null
      or t.status = 'published'
      or t.artist_id::text = v_uid::text
    );

  if not found then
    raise exception 'track_not_found';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 140 then
    v_note := left(v_note, 140);
  end if;

  -- One unread share per actor+track+recipient
  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_recipient_id
      and n.actor_id = v_uid
      and n.kind = 'track_share'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    p_recipient_id,
    v_uid,
    'track_share',
    coalesce(v_note, coalesce(nullif(trim(v_title), ''), 'a track')),
    trim(p_track_id)
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', trim(p_track_id),
    'recipient_id', p_recipient_id
  );
end;
$$;

revoke all on function public.notify_track_share(uuid, text, text) from public;
grant execute on function public.notify_track_share(uuid, text, text) to authenticated;

create or replace function public.notify_playlist_share(
  p_recipient_id uuid,
  p_playlist_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_name text;
  v_public boolean;
  v_note text;
  v_follows boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_required';
  end if;

  if p_recipient_id = v_uid then
    raise exception 'cannot_share_self';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_recipient_id
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select p.name, p.is_public
  into v_name, v_public
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 140 then
    v_note := left(v_note, 140);
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_recipient_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_share'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_recipient_id,
    v_uid,
    'playlist_share',
    coalesce(v_note, coalesce(nullif(trim(v_name), ''), 'a playlist')),
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'playlist_id', p_playlist_id,
    'recipient_id', p_recipient_id
  );
end;
$$;

revoke all on function public.notify_playlist_share(uuid, uuid, text) from public;
grant execute on function public.notify_playlist_share(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_send_to_friend.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_friend_mix_published.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Friend mix published → notify people who follow you
-- Requires people_follows + playlists.is_public + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_friend_mix_published(
  p_playlist_id uuid
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
  v_name text;
  v_body text;
  v_notified integer := 0;
  v_skipped integer := 0;
  r record;
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

  if v_owner is distinct from v_uid then
    raise exception 'not_owner';
  end if;

  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private', 'notified', 0);
  end if;

  if to_regclass('public.people_follows') is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_follows', 'notified', 0);
  end if;

  v_body := coalesce(nullif(trim(v_name), ''), 'a new mix');

  for r in
    select f.follower_id
    from public.people_follows f
    where f.person_id = v_uid
      and f.follower_id <> v_uid
    order by f.created_at desc
    limit 40
  loop
    if to_regclass('public.user_blocks') is not null
       and exists (
         select 1 from public.user_blocks b
         where (b.blocker_id = v_uid and b.blocked_id = r.follower_id)
            or (b.blocker_id = r.follower_id and b.blocked_id = v_uid)
       ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = r.follower_id
        and n.actor_id = v_uid
        and n.kind = 'friend_mix'
        and n.playlist_id = p_playlist_id
        and n.read_at is null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      r.follower_id,
      v_uid,
      'friend_mix',
      v_body,
      p_playlist_id
    );
    v_notified := v_notified + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'notified', v_notified,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.notify_friend_mix_published(uuid) from public;
grant execute on function public.notify_friend_mix_published(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_friend_mix_published.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_copy_notify.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Playlist copy → notify original owner
-- Requires playlists + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_playlist_copy(
  p_playlist_id uuid
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
  v_name text;
  v_id bigint;
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

  -- Copying your own mix — no notify
  if v_owner is null or v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  -- Only public mixes are copyable by others; keep consistent
  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_copy'
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
    'playlist_copy',
    coalesce(nullif(trim(v_name), ''), 'your mix'),
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_copy(uuid) from public;
grant execute on function public.notify_playlist_copy(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_copy_notify.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_copy_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Thank someone who copied your mix (playlist_copy)
-- Requires playlist_copy notify + artist_notifications (+ thanks cols)
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists thanks_message text;

alter table public.artist_notifications
  add column if not exists thanks_at timestamptz;

alter table public.artist_notifications
  drop constraint if exists artist_notifications_thanks_message_len;

alter table public.artist_notifications
  add constraint artist_notifications_thanks_message_len
  check (thanks_message is null or char_length(thanks_message) <= 280);

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.send_playlist_copy_thanks(
  p_notification_id bigint,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.artist_notifications%rowtype;
  v_message text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_n
  from public.artist_notifications n
  where n.id = p_notification_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  if v_n.recipient_id <> v_uid then
    raise exception 'not_recipient';
  end if;

  if v_n.kind is distinct from 'playlist_copy' then
    raise exception 'not_a_playlist_copy';
  end if;

  if v_n.actor_id is null or v_n.actor_id = v_uid then
    raise exception 'no_copier';
  end if;

  if v_n.thanks_at is not null then
    raise exception 'already_thanked';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_n.actor_id)
          or (b.blocker_id = v_n.actor_id and b.blocked_id = v_uid)
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

  update public.artist_notifications
  set thanks_message = v_message,
      thanks_at = now()
  where id = p_notification_id;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_n.actor_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_copy_thanks'
      and n.read_at is null
      and n.playlist_id is not distinct from v_n.playlist_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'notification_id', p_notification_id,
      'skipped', 'already_unread',
      'thanks_message', v_message
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    v_n.actor_id,
    v_uid,
    'playlist_copy_thanks',
    v_message,
    v_n.playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'notification_id', p_notification_id,
    'thanks_notification_id', v_notif_id,
    'thanks_message', v_message,
    'recipient_id', v_n.actor_id
  );
end;
$$;

revoke all on function public.send_playlist_copy_thanks(bigint, text) from public;
grant execute on function public.send_playlist_copy_thanks(bigint, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_copy_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_copy_related.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Playlist copy — store + open the copier's private mix
-- Requires playlist_copy notify + playlists RLS
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists related_playlist_id uuid
  references public.playlists (id) on delete set null;

create index if not exists artist_notifications_related_playlist_idx
  on public.artist_notifications (related_playlist_id)
  where related_playlist_id is not null;

-- Recipient of playlist_copy can read the private copy (and its tracks)
drop policy if exists "playlists_select_copy_notif_recipient" on public.playlists;
create policy "playlists_select_copy_notif_recipient"
  on public.playlists for select
  to authenticated
  using (
    exists (
      select 1
      from public.artist_notifications n
      where n.related_playlist_id = playlists.id
        and n.kind = 'playlist_copy'
        and n.recipient_id = auth.uid()
    )
  );

drop policy if exists "playlist_tracks_select_copy_notif_recipient"
  on public.playlist_tracks;
create policy "playlist_tracks_select_copy_notif_recipient"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1
      from public.artist_notifications n
      where n.related_playlist_id = playlist_tracks.playlist_id
        and n.kind = 'playlist_copy'
        and n.recipient_id = auth.uid()
    )
  );

drop function if exists public.notify_playlist_copy(uuid);

create or replace function public.notify_playlist_copy(
  p_source_id uuid,
  p_copy_id uuid
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
  v_name text;
  v_copy_owner uuid;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_source_id is null then
    raise exception 'playlist_required';
  end if;

  if p_copy_id is null then
    raise exception 'copy_required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_source_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  select p.user_id into v_copy_owner
  from public.playlists p
  where p.id = p_copy_id;

  if not found then
    raise exception 'copy_not_found';
  end if;

  if v_copy_owner is distinct from v_uid then
    raise exception 'copy_not_yours';
  end if;

  if p_copy_id = p_source_id then
    raise exception 'copy_same_as_source';
  end if;

  -- Copying your own mix — no notify
  if v_owner is null or v_owner = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  -- Only public mixes are copyable by others; keep consistent
  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_copy'
      and n.playlist_id = p_source_id
      and n.read_at is null
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_unread');
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id, related_playlist_id
  )
  values (
    v_owner,
    v_uid,
    'playlist_copy',
    coalesce(nullif(trim(v_name), ''), 'your mix'),
    p_source_id,
    p_copy_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_copy(uuid, uuid) from public;
grant execute on function public.notify_playlist_copy(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_copy_related.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_savers_roster.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Playlist savers roster + tighter RLS — paste in Supabase SQL Editor → Run
-- Requires 20260809_playlist_follows.sql
-- ============================================================

-- Stop open scrape of all saver rows; owners + own follows still readable
drop policy if exists "playlist_follows_select_public" on public.playlist_follows;

-- Public save counts without exposing the full roster
create or replace function public.playlist_save_count(p_playlist_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_public boolean;
  v_owner uuid;
begin
  if p_playlist_id is null then
    return 0;
  end if;

  select p.is_public, p.user_id
  into v_public, v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    return 0;
  end if;

  -- Private mixes: only owner sees a count
  if v_public is distinct from true and v_owner is distinct from auth.uid() then
    return 0;
  end if;

  select count(*)::integer into v_count
  from public.playlist_follows
  where playlist_id = p_playlist_id;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.playlist_save_count(uuid) from public;
grant execute on function public.playlist_save_count(uuid) to authenticated, anon;

notify pgrst, 'reload schema';

-- END 20260809_playlist_savers_roster.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_friends_who_saved_playlist.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Friends who saved a playlist (no full roster leak)
-- Requires playlist_follows + people_follows + playlists
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.friends_who_saved_playlist(
  p_playlist_id uuid,
  p_limit integer default 12
)
returns table (
  user_id uuid,
  saved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_public boolean;
  v_can_see boolean := false;
  v_lim integer := greatest(1, least(coalesce(p_limit, 12), 40));
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    return;
  end if;

  if to_regclass('public.playlist_follows') is null
     or to_regclass('public.people_follows') is null then
    return;
  end if;

  select p.user_id, p.is_public
  into v_owner, v_public
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    return;
  end if;

  if v_public is true or v_owner = v_uid then
    v_can_see := true;
  elsif to_regclass('public.playlist_collaborators') is not null
     and exists (
       select 1
       from public.playlist_collaborators c
       where c.playlist_id = p_playlist_id
         and c.user_id = v_uid
         and c.status = 'accepted'
     ) then
    v_can_see := true;
  end if;

  if not v_can_see then
    return;
  end if;

  return query
  select
    pf.follower_id as user_id,
    pf.created_at as saved_at
  from public.playlist_follows pf
  inner join public.people_follows f
    on f.person_id = pf.follower_id
   and f.follower_id = v_uid
  where pf.playlist_id = p_playlist_id
    and pf.follower_id is distinct from v_uid
    and (
      to_regclass('public.user_blocks') is null
      or not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = v_uid and b.blocked_id = pf.follower_id)
           or (b.blocker_id = pf.follower_id and b.blocked_id = v_uid)
      )
    )
  order by pf.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.friends_who_saved_playlist(uuid, integer) from public;
grant execute on function public.friends_who_saved_playlist(uuid, integer) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_friends_who_saved_playlist.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_person_saved_playlists.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Public profile: playlists a person saved (no full follows scrape)
-- Requires playlist_follows + playlists + users
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.person_saved_public_playlists(
  p_person_id uuid,
  p_limit integer default 12
)
returns table (
  playlist_id uuid,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_lim integer := greatest(1, least(coalesce(p_limit, 12), 40));
begin
  if p_person_id is null then
    return;
  end if;

  if to_regclass('public.playlist_follows') is null then
    return;
  end if;

  select coalesce(u.privacy_public_profile, true)
  into v_public
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true then
    return;
  end if;

  -- Self can always see own public saves on their profile
  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return;
  end if;

  return query
  select
    pf.playlist_id,
    pf.created_at as followed_at
  from public.playlist_follows pf
  inner join public.playlists p
    on p.id = pf.playlist_id
   and p.is_public is true
  where pf.follower_id = p_person_id
  order by pf.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.person_saved_public_playlists(uuid, integer) from public;
grant execute on function public.person_saved_public_playlists(uuid, integer) to authenticated, anon;

notify pgrst, 'reload schema';

-- END 20260809_person_saved_playlists.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_person_followed_artists.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Public profile: artists a person follows
-- Requires artist_follows + users
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.person_followed_artists(
  p_person_id uuid,
  p_limit integer default 12
)
returns table (
  artist_id uuid,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_lim integer := greatest(1, least(coalesce(p_limit, 12), 40));
begin
  if p_person_id is null then
    return;
  end if;

  if to_regclass('public.artist_follows') is null then
    return;
  end if;

  select coalesce(u.privacy_public_profile, true)
  into v_public
  from public.users u
  where u.id = p_person_id;

  if not found or v_public is not true then
    return;
  end if;

  if v_uid is distinct from p_person_id
     and to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_person_id)
          or (b.blocker_id = p_person_id and b.blocked_id = v_uid)
     ) then
    return;
  end if;

  return query
  select
    f.artist_id,
    f.created_at as followed_at
  from public.artist_follows f
  inner join public.users a
    on a.id = f.artist_id
   and (
     a.account_type = 'artist'
     or a.role = 'artist'
   )
   and coalesce(a.privacy_public_profile, true) = true
  where f.follower_id = p_person_id
  order by f.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.person_followed_artists(uuid, integer) from public;
grant execute on function public.person_followed_artists(uuid, integer) to authenticated, anon;

notify pgrst, 'reload schema';

-- END 20260809_person_followed_artists.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_saver_track_notify.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Notify playlist savers when a track is added
-- Requires playlist_follows + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_playlist_followers_track_add(
  p_playlist_id uuid,
  p_track_id text
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
  v_name text;
  v_title text;
  v_body text;
  v_notified integer := 0;
  v_skipped integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'required';
  end if;

  select p.user_id, p.is_public, p.name
  into v_owner, v_public, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  -- Only fan out for public mixes (that's who can save)
  if v_public is distinct from true then
    return jsonb_build_object('ok', true, 'skipped', 'private', 'notified', 0);
  end if;

  -- Caller must be owner or accepted collaborator
  if v_owner <> v_uid then
    if not public.is_accepted_playlist_collaborator(p_playlist_id, v_uid) then
      raise exception 'not_allowed';
    end if;
  end if;

  select t.title into v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  v_body := coalesce(nullif(trim(v_title), ''), 'a track')
    || ' · '
    || coalesce(nullif(trim(v_name), ''), 'playlist');

  for r in
    select f.follower_id
    from public.playlist_follows f
    where f.playlist_id = p_playlist_id
      and f.follower_id <> v_uid
    order by f.created_at desc
    limit 40
  loop
    if exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = r.follower_id
        and n.kind = 'playlist_track_add'
        and n.playlist_id = p_playlist_id
        and n.track_id = trim(p_track_id)
        and n.read_at is null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id, track_id
    )
    values (
      r.follower_id,
      v_uid,
      'playlist_track_add',
      left(v_body, 280),
      p_playlist_id,
      trim(p_track_id)
    );
    v_notified := v_notified + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'notified', v_notified,
    'skipped_unread', v_skipped
  );
end;
$$;

revoke all on function public.notify_playlist_followers_track_add(uuid, text) from public;
grant execute on function public.notify_playlist_followers_track_add(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_saver_track_notify.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_collab_request.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Ask to collab → notify mix owner (owner still invites)
-- Requires playlist_collaborators + people_follows + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.notify_playlist_collab_request(
  p_playlist_id uuid
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
  v_name text;
  v_follows boolean;
  v_status text;
  v_id bigint;
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

  if v_owner is null or v_owner = v_uid then
    raise exception 'cannot_request_own';
  end if;

  if v_public is distinct from true then
    raise exception 'playlist_private';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_owner)
          or (b.blocker_id = v_owner and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  -- Must follow the owner (same graph invite uses)
  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = v_owner
  ) into v_follows;

  if not v_follows then
    raise exception 'not_following';
  end if;

  select c.status into v_status
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = v_uid;

  if found and v_status = 'accepted' then
    return jsonb_build_object('ok', true, 'skipped', 'already_collaborator');
  end if;

  if found and v_status = 'pending' then
    return jsonb_build_object('ok', true, 'skipped', 'invite_pending');
  end if;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_request'
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
    'playlist_collab_request',
    coalesce(nullif(trim(v_name), ''), 'your mix'),
    p_playlist_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.notify_playlist_collab_request(uuid) from public;
grant execute on function public.notify_playlist_collab_request(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_collab_request.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_collab_approve_from_request.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Collab ask → one-click Approve / Decline (no second invite hop)
-- Requires playlist_collab_request + playlist_collaborators + exit notify kinds
-- Paste in Supabase SQL Editor → Run
-- ============================================================

-- Asker can see whether their unread ask is still pending (RLS hides owner inbox)
create or replace function public.has_playlist_collab_ask_pending(
  p_playlist_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null or p_playlist_id is null then
    return false;
  end if;

  select p.user_id into v_owner
  from public.playlists p
  where p.id = p_playlist_id;

  if not found or v_owner is null or v_owner = v_uid then
    return false;
  end if;

  return exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_owner
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_request'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  );
end;
$$;

revoke all on function public.has_playlist_collab_ask_pending(uuid) from public;
grant execute on function public.has_playlist_collab_ask_pending(uuid) to authenticated;

-- Owner approves an ask → asker becomes accepted collaborator immediately
create or replace function public.approve_playlist_collab_request(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_asked boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_approve_self';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
          or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_approve_owner';
  end if;

  select exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_uid
      and n.actor_id = p_user_id
      and n.kind = 'playlist_collab_request'
      and n.playlist_id = p_playlist_id
  ) into v_asked;

  if not v_asked then
    raise exception 'no_request';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_uid
      and actor_id = p_user_id
      and kind = 'playlist_collab_request'
      and playlist_id = p_playlist_id
      and read_at is null;

    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found then
    update public.playlist_collaborators
    set status = 'accepted',
        invited_by = coalesce(invited_by, v_uid),
        responded_at = now()
    where playlist_id = p_playlist_id and user_id = p_user_id;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status, responded_at
    )
    values (
      p_playlist_id, p_user_id, v_uid, 'accepted', now()
    );
  end if;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  -- Clear any leftover invite to the asker
  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = p_user_id
    and actor_id = v_uid
    and kind = 'playlist_collab_invite'
    and playlist_id = p_playlist_id
    and read_at is null;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_accepted'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      p_user_id,
      v_uid,
      'playlist_collab_accepted',
      coalesce(nullif(trim(v_name), ''), 'a playlist'),
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.approve_playlist_collab_request(uuid, uuid) from public;
grant execute on function public.approve_playlist_collab_request(uuid, uuid) to authenticated;

-- Owner declines an ask → notify asker, no membership
create or replace function public.decline_playlist_collab_request(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_asked boolean;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  select exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_uid
      and n.actor_id = p_user_id
      and n.kind = 'playlist_collab_request'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) into v_asked;

  if not v_asked then
    return jsonb_build_object('ok', true, 'skipped', 'no_unread_request');
  end if;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  if not (
       to_regclass('public.user_blocks') is not null
       and exists (
         select 1 from public.user_blocks b
         where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
            or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
       )
     )
     and not exists (
       select 1 from public.artist_notifications n
       where n.recipient_id = p_user_id
         and n.actor_id = v_uid
         and n.kind = 'playlist_collab_declined'
         and n.playlist_id = p_playlist_id
         and n.read_at is null
     )
  then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      p_user_id,
      v_uid,
      'playlist_collab_declined',
      coalesce(nullif(trim(v_name), ''), 'a playlist'),
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'declined',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.decline_playlist_collab_request(uuid, uuid) from public;
grant execute on function public.decline_playlist_collab_request(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_collab_approve_from_request.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_collab_invite_from_request.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Invite from collab request (skip follow gate when they asked)
-- Requires playlist_collab_request + invite_playlist_collaborator
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.invite_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_follows boolean;
  v_asked boolean;
  v_existing text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null or p_user_id is null then
    raise exception 'required';
  end if;

  if p_user_id = v_uid then
    raise exception 'cannot_invite_self';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
          or (b.blocker_id = p_user_id and b.blocked_id = v_uid)
     ) then
    raise exception 'blocked';
  end if;

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  if v_owner <> v_uid then
    raise exception 'not_owner';
  end if;

  if p_user_id = v_owner then
    raise exception 'cannot_invite_owner';
  end if;

  select exists (
    select 1 from public.people_follows f
    where f.follower_id = v_uid and f.person_id = p_user_id
  ) into v_follows;

  select exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_uid
      and n.actor_id = p_user_id
      and n.kind = 'playlist_collab_request'
      and n.playlist_id = p_playlist_id
  ) into v_asked;

  if not v_follows and not v_asked then
    raise exception 'not_following';
  end if;

  select c.status into v_existing
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = p_user_id;

  if found and v_existing = 'accepted' then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_collaborator',
      'status', 'accepted'
    );
  end if;

  if found and v_existing = 'pending' then
    null;
  else
    insert into public.playlist_collaborators (
      playlist_id, user_id, invited_by, status
    )
    values (p_playlist_id, p_user_id, v_uid, 'pending');
  end if;

  -- Mark matching collab requests as read
  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and actor_id = p_user_id
    and kind = 'playlist_collab_request'
    and playlist_id = p_playlist_id
    and read_at is null;

  if exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = p_user_id
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_invite'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'status', 'pending'
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, playlist_id
  )
  values (
    p_user_id,
    v_uid,
    'playlist_collab_invite',
    coalesce(nullif(trim(v_name), ''), 'a playlist'),
    p_playlist_id
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.invite_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.invite_playlist_collaborator(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_collab_invite_from_request.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_playlist_collab_exit_notify.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Collab decline / leave / remove → inbox
-- Requires 20260809_playlist_collaborators.sql
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  drop constraint if exists artist_notifications_kind_check;

alter table public.artist_notifications
  add constraint artist_notifications_kind_check
  check (
    char_length(kind) >= 2
    and char_length(kind) <= 64
  );

create or replace function public.respond_playlist_collab(
  p_playlist_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.playlist_collaborators%rowtype;
  v_name text;
  v_notif_id bigint;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select * into v_row
  from public.playlist_collaborators c
  where c.playlist_id = p_playlist_id and c.user_id = v_uid;

  if not found then
    raise exception 'invite_not_found';
  end if;

  if v_row.status = 'accepted' and p_accept then
    return jsonb_build_object('ok', true, 'skipped', 'already_accepted', 'status', 'accepted');
  end if;

  select coalesce(nullif(trim(p.name), ''), 'a playlist') into v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not p_accept then
    delete from public.playlist_collaborators
    where playlist_id = p_playlist_id and user_id = v_uid;

    update public.artist_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = v_uid
      and playlist_id = p_playlist_id
      and kind = 'playlist_collab_invite'
      and read_at is null;

    v_recipient := v_row.invited_by;
    if v_recipient is not null
       and v_recipient <> v_uid
       and not (
         to_regclass('public.user_blocks') is not null
         and exists (
           select 1 from public.user_blocks b
           where (b.blocker_id = v_uid and b.blocked_id = v_recipient)
              or (b.blocker_id = v_recipient and b.blocked_id = v_uid)
         )
       )
       and not exists (
         select 1 from public.artist_notifications n
         where n.recipient_id = v_recipient
           and n.actor_id = v_uid
           and n.kind = 'playlist_collab_declined'
           and n.playlist_id = p_playlist_id
           and n.read_at is null
       )
    then
      insert into public.artist_notifications (
        recipient_id, actor_id, kind, body, playlist_id
      )
      values (
        v_recipient,
        v_uid,
        'playlist_collab_declined',
        v_name,
        p_playlist_id
      )
      returning id into v_notif_id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'declined',
      'notification_id', v_notif_id
    );
  end if;

  update public.playlist_collaborators
  set status = 'accepted',
      responded_at = now()
  where playlist_id = p_playlist_id and user_id = v_uid;

  update public.artist_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = v_uid
    and playlist_id = p_playlist_id
    and kind = 'playlist_collab_invite'
    and read_at is null;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_row.invited_by
      and n.actor_id = v_uid
      and n.kind = 'playlist_collab_accepted'
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      v_row.invited_by,
      v_uid,
      'playlist_collab_accepted',
      v_name,
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.respond_playlist_collab(uuid, boolean) from public;
grant execute on function public.respond_playlist_collab(uuid, boolean) to authenticated;

create or replace function public.remove_playlist_collaborator(
  p_playlist_id uuid,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_target uuid;
  v_name text;
  v_notif_id bigint;
  v_recipient uuid;
  v_kind text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_playlist_id is null then
    raise exception 'playlist_required';
  end if;

  select p.user_id, coalesce(nullif(trim(p.name), ''), 'a playlist')
  into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  v_target := coalesce(p_user_id, v_uid);

  if v_uid = v_owner then
    if v_target = v_owner then
      raise exception 'cannot_remove_owner';
    end if;
  elsif v_uid = v_target then
    null; -- leave
  else
    raise exception 'not_allowed';
  end if;

  if not exists (
    select 1 from public.playlist_collaborators c
    where c.playlist_id = p_playlist_id and c.user_id = v_target
  ) then
    raise exception 'collaborator_not_found';
  end if;

  delete from public.playlist_collaborators
  where playlist_id = p_playlist_id and user_id = v_target;

  if v_uid = v_owner and v_target <> v_uid then
    v_recipient := v_target;
    v_kind := 'playlist_collab_removed';
  elsif v_uid = v_target and v_owner is not null and v_owner <> v_uid then
    v_recipient := v_owner;
    v_kind := 'playlist_collab_left';
  else
    return jsonb_build_object('ok', true, 'removed', v_target);
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_recipient)
          or (b.blocker_id = v_recipient and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'removed', v_target, 'skipped', 'blocked');
  end if;

  if not exists (
    select 1 from public.artist_notifications n
    where n.recipient_id = v_recipient
      and n.actor_id = v_uid
      and n.kind = v_kind
      and n.playlist_id = p_playlist_id
      and n.read_at is null
  ) then
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, playlist_id
    )
    values (
      v_recipient,
      v_uid,
      v_kind,
      v_name,
      p_playlist_id
    )
    returning id into v_notif_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'removed', v_target,
    'kind', v_kind,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.remove_playlist_collaborator(uuid, uuid) from public;
grant execute on function public.remove_playlist_collaborator(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_playlist_collab_exit_notify.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_track_likes_artist_select.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist can list who liked their tracks — paste in Supabase SQL Editor → Run
-- Requires 20260807_track_likes.sql
-- ============================================================

-- Owners read likes on their own tracks (inbox already notifies; this closes the roster loop)
drop policy if exists "track_likes_select_as_artist" on public.track_likes;
create policy "track_likes_select_as_artist"
  on public.track_likes for select
  to authenticated
  using (
    exists (
      select 1
      from public.tracks t
      where t.id::text = track_likes.track_id
        and t.artist_id::text = auth.uid()::text
    )
  );

notify pgrst, 'reload schema';

-- END 20260809_track_likes_artist_select.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_artist_listen_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist can thank a fan for listening (owner path)
-- - listen notifs store play_id
-- - send_play_thanks allows track owner OR people-follow
-- Requires plays + tracks + play_thanks + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

alter table public.artist_notifications
  add column if not exists play_id text;

drop function if exists public.notify_track_listen(text);
drop function if exists public.notify_track_listen(text, text);

create or replace function public.notify_track_listen(
  p_track_id text,
  p_play_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_title text;
  v_share boolean;
  v_play text;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select
    nullif(trim(t.artist_id::text), '')::uuid,
    t.title
  into v_artist, v_title
  from public.tracks t
  where t.id::text = trim(p_track_id);

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_artist');
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'self');
  end if;

  select coalesce(u.privacy_show_activity, true)
  into v_share
  from public.users u
  where u.id = v_uid;

  if not found or v_share is not true then
    return jsonb_build_object('ok', true, 'skipped', 'privacy');
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_artist)
          or (b.blocker_id = v_artist and b.blocked_id = v_uid)
     ) then
    return jsonb_build_object('ok', true, 'skipped', 'blocked');
  end if;

  v_play := nullif(trim(coalesce(p_play_id, '')), '');
  if v_play is null then
    select p.id::text
    into v_play
    from public.plays p
    where p.track_id::text = trim(p_track_id)
      and p.listener_id = v_uid
    order by p.created_at desc nulls last
    limit 1;
  end if;

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_artist
      and n.actor_id = v_uid
      and n.kind = 'listen'
      and n.track_id = trim(p_track_id)
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'play_id', v_play
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id, play_id
  )
  values (
    v_artist,
    v_uid,
    'listen',
    coalesce(nullif(trim(v_title), ''), 'your track'),
    trim(p_track_id),
    v_play
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'track_id', trim(p_track_id),
    'play_id', v_play
  );
end;
$$;

revoke all on function public.notify_track_listen(text, text) from public;
grant execute on function public.notify_track_listen(text, text) to authenticated;

create or replace function public.send_play_thanks(
  p_play_id text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_listener uuid;
  v_track text;
  v_artist uuid;
  v_is_owner boolean := false;
  v_share boolean;
  v_message text;
  v_notif_id bigint;
  v_existing text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_play_id is null or length(trim(p_play_id)) = 0 then
    raise exception 'play_required';
  end if;

  select
    p.listener_id,
    p.track_id::text
  into v_listener, v_track
  from public.plays p
  where p.id::text = trim(p_play_id);

  if not found then
    raise exception 'play_not_found';
  end if;

  if v_listener is null or v_listener = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = coalesce(v_track, '');

  v_is_owner := v_artist is not null and v_artist = v_uid;

  if not v_is_owner then
    if to_regclass('public.people_follows') is null
       or not exists (
         select 1 from public.people_follows f
         where f.follower_id = v_uid and f.person_id = v_listener
       ) then
      raise exception 'not_following';
    end if;
  end if;

  select coalesce(u.privacy_show_activity, true)
  into v_share
  from public.users u
  where u.id = v_listener;

  if not found or v_share is not true then
    raise exception 'privacy';
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_listener)
          or (b.blocker_id = v_listener and b.blocked_id = v_uid)
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

  -- One thanks per thanker + listener + track (any play)
  select t.message
  into v_existing
  from public.play_thanks t
  where t.thanker_id = v_uid
    and t.listener_id = v_listener
    and t.track_id is not distinct from v_track
  order by t.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_existing,
      'play_id', trim(p_play_id)
    );
  end if;

  insert into public.play_thanks (
    play_id, thanker_id, listener_id, track_id, message
  )
  values (
    trim(p_play_id), v_uid, v_listener, v_track, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = v_listener
      and n.actor_id = v_uid
      and n.kind = 'activity_thanks'
      and n.track_id is not distinct from v_track
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'play_id', trim(p_play_id),
      'listener_id', v_listener
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    v_listener,
    v_uid,
    'activity_thanks',
    v_message,
    v_track
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'play_id', trim(p_play_id),
    'listener_id', v_listener,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_play_thanks(text, text) from public;
grant execute on function public.send_play_thanks(text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_artist_listen_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260809_artist_like_thanks.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist can thank a fan for liking (owner path)
-- send_like_thanks: track owner OR people-follow
-- Requires tracks + track_likes + like_thanks + artist_notifications
-- Paste in Supabase SQL Editor → Run
-- ============================================================

create or replace function public.send_like_thanks(
  p_liker_id uuid,
  p_track_id text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_is_owner boolean := false;
  v_share boolean;
  v_message text;
  v_track text;
  v_notif_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_liker_id is null then
    raise exception 'liker_required';
  end if;

  v_track := trim(coalesce(p_track_id, ''));
  if length(v_track) = 0 then
    raise exception 'track_required';
  end if;

  if p_liker_id = v_uid then
    raise exception 'cannot_thank_self';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = v_track;

  if not found then
    raise exception 'track_not_found';
  end if;

  v_is_owner := v_artist is not null and v_artist = v_uid;

  if not v_is_owner then
    if to_regclass('public.people_follows') is null
       or not exists (
         select 1 from public.people_follows f
         where f.follower_id = v_uid and f.person_id = p_liker_id
       ) then
      raise exception 'not_following';
    end if;
  end if;

  if not exists (
    select 1 from public.track_likes l
    where l.user_id = p_liker_id and l.track_id::text = v_track
  ) then
    raise exception 'like_not_found';
  end if;

  -- Friends feed: liker must opt into public likes.
  -- Owner path: artist already saw the like in studio / inbox.
  if not v_is_owner then
    select coalesce(u.privacy_show_likes, false)
    into v_share
    from public.users u
    where u.id = p_liker_id;

    if not found or v_share is not true then
      raise exception 'privacy';
    end if;
  end if;

  if to_regclass('public.user_blocks') is not null
     and exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_liker_id)
          or (b.blocker_id = p_liker_id and b.blocked_id = v_uid)
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
    select 1 from public.like_thanks t
    where t.thanker_id = v_uid
      and t.liker_id = p_liker_id
      and t.track_id = v_track
  ) then
    select t.message into v_message
    from public.like_thanks t
    where t.thanker_id = v_uid
      and t.liker_id = p_liker_id
      and t.track_id = v_track;
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_thanked',
      'thanks_message', v_message,
      'liker_id', p_liker_id,
      'track_id', v_track
    );
  end if;

  insert into public.like_thanks (
    thanker_id, liker_id, track_id, message
  )
  values (
    v_uid, p_liker_id, v_track, v_message
  );

  if exists (
    select 1
    from public.artist_notifications n
    where n.recipient_id = p_liker_id
      and n.actor_id = v_uid
      and n.kind = 'like_thanks'
      and n.track_id is not distinct from v_track
      and n.read_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_unread',
      'thanks_message', v_message,
      'liker_id', p_liker_id,
      'track_id', v_track
    );
  end if;

  insert into public.artist_notifications (
    recipient_id, actor_id, kind, body, track_id
  )
  values (
    p_liker_id,
    v_uid,
    'like_thanks',
    v_message,
    v_track
  )
  returning id into v_notif_id;

  return jsonb_build_object(
    'ok', true,
    'thanks_message', v_message,
    'liker_id', p_liker_id,
    'track_id', v_track,
    'notification_id', v_notif_id
  );
end;
$$;

revoke all on function public.send_like_thanks(uuid, text, text) from public;
grant execute on function public.send_like_thanks(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260809_artist_like_thanks.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260810_phase1_track_live_status.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Phase 1: track status + writer splits
-- Paste in Supabase SQL Editor → Run
--
-- tracks.id is UUID — writer splits must use uuid track_id.
-- Live catalog status = 'live' (pending = draft).
-- ============================================================

-- Allow pending (draft) + live (public). Keep published as alias for safety.
alter table public.tracks drop constraint if exists tracks_status_check;
alter table public.tracks
  add constraint tracks_status_check
  check (
    status is null
    or lower(status) in ('pending', 'live', 'published', 'draft', 'unpublished')
  );

-- Normalize any legacy published rows to live
update public.tracks
set status = 'live'
where lower(coalesce(status, '')) = 'published';

-- Default new rows to pending (draft) until artist publishes
alter table public.tracks
  alter column status set default 'pending';

-- Recreate writer splits with uuid FK matching tracks.id
drop function if exists public.set_track_writer_splits(text, jsonb);
drop function if exists public.set_track_writer_splits(uuid, jsonb);
drop table if exists public.track_writer_splits cascade;

create table public.track_writer_splits (
  id bigserial primary key,
  track_id uuid not null references public.tracks (id) on delete cascade,
  writer_name text not null,
  share_percent numeric(5, 2) not null
    check (share_percent > 0 and share_percent <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index track_writer_splits_track_id_idx
  on public.track_writer_splits (track_id);

alter table public.track_writer_splits enable row level security;

drop policy if exists "track_writer_splits_select_public" on public.track_writer_splits;
create policy "track_writer_splits_select_public"
  on public.track_writer_splits for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and (
          t.artist_id = auth.uid()
          or lower(coalesce(t.status, 'live'))
            not in ('pending', 'draft', 'unpublished')
        )
    )
  );

drop policy if exists "track_writer_splits_insert_own" on public.track_writer_splits;
create policy "track_writer_splits_insert_own"
  on public.track_writer_splits for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

drop policy if exists "track_writer_splits_update_own" on public.track_writer_splits;
create policy "track_writer_splits_update_own"
  on public.track_writer_splits for update
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

drop policy if exists "track_writer_splits_delete_own" on public.track_writer_splits;
create policy "track_writer_splits_delete_own"
  on public.track_writer_splits for delete
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

create or replace function public.set_track_writer_splits(
  p_track_id uuid,
  p_writers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_name text;
  v_pct numeric;
  v_ord integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null then
    raise exception 'track_required';
  end if;

  if p_writers is null or jsonb_typeof(p_writers) <> 'array' then
    raise exception 'writers_required';
  end if;

  if jsonb_array_length(p_writers) < 1 then
    raise exception 'writers_required';
  end if;

  select t.artist_id into v_artist
  from public.tracks t
  where t.id = p_track_id;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is distinct from v_uid then
    raise exception 'not_owner';
  end if;

  for v_item in select * from jsonb_array_elements(p_writers)
  loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    begin
      v_pct := (v_item->>'percent')::numeric;
    exception when others then
      raise exception 'invalid_percent';
    end;
    if v_name is null then
      raise exception 'writer_name_required';
    end if;
    if v_pct is null or v_pct <= 0 or v_pct > 100 then
      raise exception 'invalid_percent';
    end if;
    v_total := v_total + v_pct;
  end loop;

  if abs(v_total - 100) > 0.01 then
    raise exception 'splits_must_total_100';
  end if;

  delete from public.track_writer_splits where track_id = p_track_id;

  for v_item in select * from jsonb_array_elements(p_writers)
  loop
    v_name := trim(v_item->>'name');
    v_pct := (v_item->>'percent')::numeric;
    insert into public.track_writer_splits (
      track_id, writer_name, share_percent, sort_order
    ) values (
      p_track_id, left(v_name, 120), round(v_pct, 2), v_ord
    );
    v_ord := v_ord + 1;
  end loop;

  return jsonb_build_object('ok', true, 'total', 100);
end;
$$;

revoke all on function public.set_track_writer_splits(uuid, jsonb) from public;
grant execute on function public.set_track_writer_splits(uuid, jsonb) to authenticated;

-- Release notify: accept live OR published
-- Keep p_track_id text so existing callers still match; cast to uuid for tracks.id.
create or replace function public.notify_track_release(p_track_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_track uuid;
  v_artist uuid;
  v_title text;
  v_status text;
  v_count integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  begin
    v_track := trim(p_track_id)::uuid;
  exception when others then
    raise exception 'track_required';
  end;

  select artist_id, title, status
  into v_artist, v_title, v_status
  from public.tracks
  where id = v_track;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is distinct from v_uid then
    raise exception 'not_your_track';
  end if;

  if lower(coalesce(v_status, 'pending')) not in ('live', 'published') then
    raise exception 'track_not_published';
  end if;

  if to_regclass('public.artist_follows') is null
     or to_regclass('public.artist_notifications') is null then
    return jsonb_build_object('ok', true, 'notified', 0);
  end if;

  for r in
    select follower_id
    from public.artist_follows
    where artist_id = v_uid
  loop
    insert into public.artist_notifications (
      recipient_id, actor_id, kind, body, track_id
    )
    values (
      r.follower_id,
      v_uid,
      'release',
      coalesce(nullif(trim(v_title), ''), 'New track'),
      v_track::text
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'notified', v_count);
exception
  when others then
    -- Soft-fail if notification schema differs
    return jsonb_build_object('ok', true, 'notified', 0, 'warning', SQLERRM);
end;
$$;

revoke all on function public.notify_track_release(text) from public;
grant execute on function public.notify_track_release(text) to authenticated;

notify pgrst, 'reload schema';

-- END 20260810_phase1_track_live_status.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260810_track_writer_splits.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Track writer splits — paste in Supabase SQL Editor → Run
-- Prefer 20260810_phase1_track_live_status.sql (includes status fix)
-- tracks.id is UUID
-- ============================================================

drop function if exists public.set_track_writer_splits(text, jsonb);
drop function if exists public.set_track_writer_splits(uuid, jsonb);
drop table if exists public.track_writer_splits cascade;

create table public.track_writer_splits (
  id bigserial primary key,
  track_id uuid not null references public.tracks (id) on delete cascade,
  writer_name text not null,
  share_percent numeric(5, 2) not null
    check (share_percent > 0 and share_percent <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index track_writer_splits_track_id_idx
  on public.track_writer_splits (track_id);

alter table public.track_writer_splits enable row level security;

drop policy if exists "track_writer_splits_select_public" on public.track_writer_splits;
create policy "track_writer_splits_select_public"
  on public.track_writer_splits for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and (
          t.artist_id = auth.uid()
          or lower(coalesce(t.status, 'live'))
            not in ('pending', 'draft', 'unpublished')
        )
    )
  );

drop policy if exists "track_writer_splits_insert_own" on public.track_writer_splits;
create policy "track_writer_splits_insert_own"
  on public.track_writer_splits for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

drop policy if exists "track_writer_splits_update_own" on public.track_writer_splits;
create policy "track_writer_splits_update_own"
  on public.track_writer_splits for update
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

drop policy if exists "track_writer_splits_delete_own" on public.track_writer_splits;
create policy "track_writer_splits_delete_own"
  on public.track_writer_splits for delete
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

create or replace function public.set_track_writer_splits(
  p_track_id uuid,
  p_writers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_name text;
  v_pct numeric;
  v_ord integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null then
    raise exception 'track_required';
  end if;

  if p_writers is null or jsonb_typeof(p_writers) <> 'array' then
    raise exception 'writers_required';
  end if;

  if jsonb_array_length(p_writers) < 1 then
    raise exception 'writers_required';
  end if;

  select t.artist_id into v_artist
  from public.tracks t
  where t.id = p_track_id;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is distinct from v_uid then
    raise exception 'not_owner';
  end if;

  for v_item in select * from jsonb_array_elements(p_writers)
  loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    begin
      v_pct := (v_item->>'percent')::numeric;
    exception when others then
      raise exception 'invalid_percent';
    end;
    if v_name is null then
      raise exception 'writer_name_required';
    end if;
    if v_pct is null or v_pct <= 0 or v_pct > 100 then
      raise exception 'invalid_percent';
    end if;
    v_total := v_total + v_pct;
  end loop;

  if abs(v_total - 100) > 0.01 then
    raise exception 'splits_must_total_100';
  end if;

  delete from public.track_writer_splits where track_id = p_track_id;

  for v_item in select * from jsonb_array_elements(p_writers)
  loop
    v_name := trim(v_item->>'name');
    v_pct := (v_item->>'percent')::numeric;
    insert into public.track_writer_splits (
      track_id, writer_name, share_percent, sort_order
    ) values (
      p_track_id, left(v_name, 120), round(v_pct, 2), v_ord
    );
    v_ord := v_ord + 1;
  end loop;

  return jsonb_build_object('ok', true, 'total', 100);
end;
$$;

revoke all on function public.set_track_writer_splits(uuid, jsonb) from public;
grant execute on function public.set_track_writer_splits(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- END 20260810_track_writer_splits.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260811_record_credited_play.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Atomic credited play — paste in Supabase SQL Editor → Run
--
-- consume_play_credit + plays insert used to be two steps:
-- credit could burn even if the play row failed.
-- record_credited_play does both in one transaction.
-- ============================================================

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

  -- Same starter semantics as ensure_play_balance (first listen).
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

  insert into public.plays (track_id, listener_id)
  values (p_track_id, v_uid)
  returning id into v_play_id;

  return jsonb_build_object(
    'ok', true,
    'play_id', v_play_id,
    'credits_remaining', v_new
  );
end;
$$;

revoke all on function public.record_credited_play(uuid, integer) from public;
grant execute on function public.record_credited_play(uuid, integer) to authenticated;

notify pgrst, 'reload schema';

-- END 20260811_record_credited_play.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_artist_play_earnings_bootstrap.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Artist play earnings — idempotent bootstrap (type-safe)
-- Paste in Supabase → SQL Editor → Run
--
-- Fixes: uuid = text when playlist_tracks.track_id / tracks.artist_id
-- are text while tracks.id / auth.uid() are uuid.
-- Safe to re-run.
-- ============================================================

alter table public.plays
  add column if not exists listened_secs integer check (listened_secs is null or listened_secs >= 0);

create index if not exists plays_track_listened_idx
  on public.plays (track_id, listened_secs)
  where listened_secs is not null;

create table if not exists public.artist_play_earnings (
  id bigserial primary key,
  artist_id uuid not null references public.users (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  play_id uuid not null,
  listener_id uuid references public.users (id) on delete set null,
  amount_xof integer not null check (amount_xof > 0),
  created_at timestamptz not null default now(),
  constraint artist_play_earnings_play_unique unique (play_id)
);

create index if not exists artist_play_earnings_artist_created_idx
  on public.artist_play_earnings (artist_id, created_at desc);

create index if not exists artist_play_earnings_track_idx
  on public.artist_play_earnings (track_id);

create index if not exists artist_play_earnings_play_idx
  on public.artist_play_earnings (play_id);

alter table public.artist_play_earnings enable row level security;

drop policy if exists "artist_play_earnings_select_own" on public.artist_play_earnings;
create policy "artist_play_earnings_select_own"
  on public.artist_play_earnings for select
  to authenticated
  using (artist_id = auth.uid());

drop function if exists public.record_play_earning(uuid, bigint, integer);
drop function if exists public.record_play_earning(uuid, uuid, integer);

create or replace function public.record_play_earning(
  p_track_id uuid,
  p_play_id uuid,
  p_amount_xof integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_amount integer := greatest(coalesce(p_amount_xof, 10), 1);
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_track_id is null or p_play_id is null then
    raise exception 'track_and_play_required';
  end if;

  select nullif(trim(t.artist_id::text), '')::uuid
  into v_artist
  from public.tracks t
  where t.id::text = p_track_id::text;

  if v_artist is null then
    raise exception 'track_not_found';
  end if;

  if v_artist = v_uid then
    return jsonb_build_object('ok', true, 'skipped', 'own_track');
  end if;

  insert into public.artist_play_earnings (
    artist_id, track_id, play_id, listener_id, amount_xof
  )
  values (v_artist, p_track_id, p_play_id, v_uid, v_amount)
  on conflict (play_id) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', true, 'skipped', 'duplicate');
  end if;

  return jsonb_build_object(
    'ok', true,
    'earning_id', v_id,
    'artist_id', v_artist,
    'amount_xof', v_amount
  );
end;
$$;

revoke all on function public.record_play_earning(uuid, uuid, integer) from public;
grant execute on function public.record_play_earning(uuid, uuid, integer) to authenticated;

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
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null then
    raise exception 'track_required';
  end if;

  if not exists (
    select 1 from public.tracks t where t.id::text = p_track_id::text
  ) then
    raise exception 'track_not_found';
  end if;

  insert into public.user_play_balances (user_id, credits, updated_at)
  values (v_uid, greatest(coalesce(p_starter, 25), 0), now())
  on conflict (user_id) do nothing;

  update public.user_play_balances
  set credits = credits - 1,
      updated_at = now()
  where user_id::text = v_uid::text
    and credits > 0
  returning credits into v_new;

  if not found then
    raise exception 'insufficient_credits';
  end if;

  insert into public.plays (track_id, listener_id, listened_secs)
  values (p_track_id, v_uid, 30)
  returning id into v_play_id;

  return jsonb_build_object(
    'ok', true,
    'play_id', v_play_id,
    'credits_remaining', v_new,
    'listened_secs', 30
  );
end;
$$;

revoke all on function public.record_credited_play(uuid, integer) from public;
grant execute on function public.record_credited_play(uuid, integer) to authenticated;

-- Artists can count playlist saves on their tracks (analytics)
-- Cast both sides: playlist_tracks.track_id is often text; tracks.id is uuid.
drop policy if exists "playlist_tracks_select_artist_tracks" on public.playlist_tracks;
create policy "playlist_tracks_select_artist_tracks"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id::text = playlist_tracks.track_id::text
        and t.artist_id::text = auth.uid()::text
    )
  );

notify pgrst, 'reload schema';

-- END 20260830_artist_play_earnings_bootstrap.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_tracks_taali_fields.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- Optional nullable columns on tracks (storage only — no external TAALI DB/API)
-- ============================================================

alter table public.tracks
  add column if not exists taali_registry_id text,
  add column if not exists isrc_code text,
  add column if not exists writer_splits jsonb,
  add column if not exists master_owner text,
  add column if not exists territory_of_origin char(2);

alter table public.tracks
  drop constraint if exists tracks_territory_of_origin_check;

alter table public.tracks
  add constraint tracks_territory_of_origin_check
  check (
    territory_of_origin is null
    or territory_of_origin ~ '^[A-Za-z]{2}$'
  );

notify pgrst, 'reload schema';

-- END 20260830_tracks_taali_fields.sql

-- ═══════════════════════════════════════════════════════════
-- BEGIN 20260830_users_artist_banner.sql
-- ═══════════════════════════════════════════════════════════
-- Artist portal banner image (optional)
alter table public.users
  add column if not exists artist_banner_url text;

notify pgrst, 'reload schema';

-- END 20260830_users_artist_banner.sql

