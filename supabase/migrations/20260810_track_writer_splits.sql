-- ============================================================
-- Track writer splits — paste in Supabase SQL Editor → Run
-- Requires tracks
-- ============================================================

create table if not exists public.track_writer_splits (
  id bigserial primary key,
  track_id text not null references public.tracks (id) on delete cascade,
  writer_name text not null,
  share_percent numeric(5, 2) not null
    check (share_percent > 0 and share_percent <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists track_writer_splits_track_id_idx
  on public.track_writer_splits (track_id);

alter table public.track_writer_splits enable row level security;

drop policy if exists "track_writer_splits_select_public" on public.track_writer_splits;
create policy "track_writer_splits_select_public"
  on public.track_writer_splits for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and (
          t.artist_id = auth.uid()
          or lower(coalesce(t.status, 'published'))
            not in ('pending', 'draft', 'unpublished')
        )
    )
  );

drop policy if exists "track_writer_splits_insert_own" on public.track_writer_splits;
create policy "track_writer_splits_insert_own"
  on public.track_writer_splits for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

drop policy if exists "track_writer_splits_update_own" on public.track_writer_splits;
create policy "track_writer_splits_update_own"
  on public.track_writer_splits for update
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

drop policy if exists "track_writer_splits_delete_own" on public.track_writer_splits;
create policy "track_writer_splits_delete_own"
  on public.track_writer_splits for delete
  to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_id
        and t.artist_id = auth.uid()
    )
  );

-- Replace splits for a track; sum must equal 100.
create or replace function public.set_track_writer_splits(
  p_track_id text,
  p_writers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_name text;
  v_pct numeric;
  v_ord integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_track_id is null or length(trim(p_track_id)) = 0 then
    raise exception 'track_required';
  end if;

  if p_writers is null or jsonb_typeof(p_writers) <> 'array' then
    raise exception 'writers_required';
  end if;

  if jsonb_array_length(p_writers) < 1 then
    raise exception 'writers_required';
  end if;

  select t.artist_id into v_artist
  from public.tracks t
  where t.id = p_track_id;

  if not found then
    raise exception 'track_not_found';
  end if;

  if v_artist is distinct from v_uid then
    raise exception 'not_owner';
  end if;

  for v_item in select * from jsonb_array_elements(p_writers)
  loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    begin
      v_pct := (v_item->>'percent')::numeric;
    exception when others then
      raise exception 'invalid_percent';
    end;
    if v_name is null then
      raise exception 'writer_name_required';
    end if;
    if v_pct is null or v_pct <= 0 or v_pct > 100 then
      raise exception 'invalid_percent';
    end if;
    v_total := v_total + v_pct;
  end loop;

  if abs(v_total - 100) > 0.01 then
    raise exception 'splits_must_total_100';
  end if;

  delete from public.track_writer_splits where track_id = p_track_id;

  for v_item in select * from jsonb_array_elements(p_writers)
  loop
    v_name := trim(v_item->>'name');
    v_pct := (v_item->>'percent')::numeric;
    insert into public.track_writer_splits (
      track_id, writer_name, share_percent, sort_order
    ) values (
      p_track_id, left(v_name, 120), round(v_pct, 2), v_ord
    );
    v_ord := v_ord + 1;
  end loop;

  return jsonb_build_object('ok', true, 'total', 100);
end;
$$;

revoke all on function public.set_track_writer_splits(text, jsonb) from public;
grant execute on function public.set_track_writer_splits(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
