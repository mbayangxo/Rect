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
