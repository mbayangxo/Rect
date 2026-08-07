-- ============================================================
-- Track likes — paste in Supabase SQL Editor → Run
-- ============================================================

create table if not exists public.track_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

create index if not exists track_likes_track_id_idx
  on public.track_likes (track_id);

create index if not exists track_likes_user_created_idx
  on public.track_likes (user_id, created_at desc);

alter table public.track_likes enable row level security;

drop policy if exists "track_likes_select_own" on public.track_likes;
create policy "track_likes_select_own"
  on public.track_likes for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "track_likes_insert_own" on public.track_likes;
create policy "track_likes_insert_own"
  on public.track_likes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "track_likes_delete_own" on public.track_likes;
create policy "track_likes_delete_own"
  on public.track_likes for delete
  to authenticated
  using (user_id = auth.uid());

-- Toggle like; returns { liked: boolean }
create or replace function public.toggle_track_like(p_track_id text)
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

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  select exists (
    select 1 from public.track_likes
    where user_id = v_uid and track_id = p_track_id
  ) into v_exists;

  if v_exists then
    delete from public.track_likes
    where user_id = v_uid and track_id = p_track_id;
    return jsonb_build_object('liked', false, 'track_id', p_track_id);
  end if;

  insert into public.track_likes (user_id, track_id)
  values (v_uid, p_track_id)
  on conflict do nothing;

  return jsonb_build_object('liked', true, 'track_id', p_track_id);
end;
$$;

revoke all on function public.toggle_track_like(text) from public;
grant execute on function public.toggle_track_like(text) to authenticated;

notify pgrst, 'reload schema';
