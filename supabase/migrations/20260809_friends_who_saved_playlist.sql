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
