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
