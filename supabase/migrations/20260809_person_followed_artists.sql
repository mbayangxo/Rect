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
