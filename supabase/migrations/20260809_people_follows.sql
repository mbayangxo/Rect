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
