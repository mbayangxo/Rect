-- ============================================================
-- Playlist comment → owner + accepted collaborators
-- Requires 20260809_playlist_comments.sql + playlist_collaborators
-- Paste in Supabase SQL Editor → Run
-- ============================================================

-- Collabs can read / post comments on private shared mixes
drop policy if exists "playlist_comments_select" on public.playlist_comments;
create policy "playlist_comments_select"
  on public.playlist_comments for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (
          p.is_public = true
          or p.user_id = auth.uid()
          or public.is_accepted_playlist_collaborator(p.id, auth.uid())
        )
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
        and (
          p.is_public = true
          or p.user_id = auth.uid()
          or public.is_accepted_playlist_collaborator(p.id, auth.uid())
        )
    )
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

  select p.user_id, p.name into v_owner, v_name
  from public.playlists p
  where p.id = p_playlist_id;

  if not found then
    raise exception 'playlist_not_found';
  end if;

  v_body := nullif(trim(coalesce(p_comment_preview, '')), '');
  if v_body is not null and char_length(v_body) > 200 then
    v_body := left(v_body, 200);
  end if;
  if v_body is null then
    v_body := coalesce(nullif(trim(v_name), ''), 'your mix');
  end if;

  for r in
    select recipient_id from (
      select v_owner as recipient_id
      where v_owner is not null and v_owner <> v_uid
      union
      select c.user_id
      from public.playlist_collaborators c
      where c.playlist_id = p_playlist_id
        and c.status = 'accepted'
        and c.user_id <> v_uid
    ) recipients
    order by recipient_id
    limit 40
  loop
    if to_regclass('public.user_blocks') is not null
       and exists (
         select 1 from public.user_blocks b
         where (b.blocker_id = v_uid and b.blocked_id = r.recipient_id)
            or (b.blocker_id = r.recipient_id and b.blocked_id = v_uid)
       ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if exists (
      select 1 from public.artist_notifications n
      where n.recipient_id = r.recipient_id
        and n.actor_id = v_uid
        and n.kind = 'playlist_comment'
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
      r.recipient_id,
      v_uid,
      'playlist_comment',
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

revoke all on function public.notify_playlist_comment(uuid, text) from public;
grant execute on function public.notify_playlist_comment(uuid, text) to authenticated;

notify pgrst, 'reload schema';
