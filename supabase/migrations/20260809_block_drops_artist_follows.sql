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
