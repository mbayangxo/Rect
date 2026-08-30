-- ============================================================
-- Optional nullable columns on tracks (storage only — no external TAALI DB/API)
-- ============================================================

alter table public.tracks
  add column if not exists taali_registry_id text,
  add column if not exists isrc_code text,
  add column if not exists writer_splits jsonb,
  add column if not exists master_owner text,
  add column if not exists territory_of_origin char(2);

alter table public.tracks
  drop constraint if exists tracks_territory_of_origin_check;

alter table public.tracks
  add constraint tracks_territory_of_origin_check
  check (
    territory_of_origin is null
    or territory_of_origin ~ '^[A-Za-z]{2}$'
  );

notify pgrst, 'reload schema';
