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
    kind in (
      'follow',
      'tip',
      'release',
      'like',
      'comment',
      'people_follow'
    )
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
