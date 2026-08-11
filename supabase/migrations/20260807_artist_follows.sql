-- ============================================================
-- Artist follows — paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.artist_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  artist_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, artist_id),
  constraint artist_follows_no_self check (follower_id <> artist_id)
);

create index if not exists artist_follows_artist_id_idx
  on public.artist_follows (artist_id);

create index if not exists artist_follows_follower_created_idx
  on public.artist_follows (follower_id, created_at desc);

alter table public.artist_follows enable row level security;

-- Followers can read their own follows
drop policy if exists "artist_follows_select_own" on public.artist_follows;
create policy "artist_follows_select_own"
  on public.artist_follows for select
  to authenticated
  using (follower_id = auth.uid());

-- Artists can see who follows them (count / roster)
drop policy if exists "artist_follows_select_as_artist" on public.artist_follows;
create policy "artist_follows_select_as_artist"
  on public.artist_follows for select
  to authenticated
  using (artist_id = auth.uid());

-- Anyone authenticated can read follower counts for public portals
-- (count queries filter by artist_id; no PII beyond existence)
drop policy if exists "artist_follows_select_public_count" on public.artist_follows;
create policy "artist_follows_select_public_count"
  on public.artist_follows for select
  to authenticated, anon
  using (true);

drop policy if exists "artist_follows_insert_own" on public.artist_follows;
create policy "artist_follows_insert_own"
  on public.artist_follows for insert
  to authenticated
  with check (follower_id = auth.uid());

drop policy if exists "artist_follows_delete_own" on public.artist_follows;
create policy "artist_follows_delete_own"
  on public.artist_follows for delete
  to authenticated
  using (follower_id = auth.uid());

-- Toggle follow; returns { following: boolean, follower_count: number }
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
