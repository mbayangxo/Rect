-- Track audio QC (Upload QC / go-live gate). RECT Punch mastering comes later.

alter table public.tracks
  add column if not exists qc_status text;

alter table public.tracks
  drop constraint if exists tracks_qc_status_check;

alter table public.tracks
  add constraint tracks_qc_status_check
  check (
    qc_status is null
    or qc_status in ('pending', 'pass', 'warn', 'fail')
  );

alter table public.tracks
  add column if not exists qc_checked_at timestamptz;

alter table public.tracks
  add column if not exists qc_sample_rate integer;

alter table public.tracks
  add column if not exists qc_channels smallint;

alter table public.tracks
  add column if not exists qc_lufs_integrated numeric;

alter table public.tracks
  add column if not exists qc_true_peak_dbtp numeric;

alter table public.tracks
  add column if not exists qc_silence_ratio numeric;

alter table public.tracks
  add column if not exists qc_issues jsonb;

comment on column public.tracks.qc_status is
  'Upload QC: pending|pass|warn|fail — fail blocks go-live';
comment on column public.tracks.qc_lufs_integrated is
  'Integrated loudness LUFS (aim ~-14)';
comment on column public.tracks.qc_true_peak_dbtp is
  'True peak dBTP (must be <= -1)';
