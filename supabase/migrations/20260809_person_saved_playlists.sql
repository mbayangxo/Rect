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
