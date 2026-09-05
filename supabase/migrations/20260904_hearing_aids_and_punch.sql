-- Content kind: music (default) vs podcast (Hearing Aids).
alter table public.tracks
  add column if not exists content_kind text;

alter table public.tracks
  drop constraint if exists tracks_content_kind_check;

alter table public.tracks
  add constraint tracks_content_kind_check
  check (
    content_kind is null
    or content_kind in ('music', 'podcast')
  );

update public.tracks
set content_kind = 'music'
where content_kind is null;

alter table public.tracks
  alter column content_kind set default 'music';

create index if not exists tracks_content_kind_live_idx
  on public.tracks (content_kind, status, created_at desc);

comment on column public.tracks.content_kind is
  'music = catalog/Wave; podcast = Hearing Aids on-demand talk';

-- RECT Punch mastering request (optional after Upload QC).
alter table public.tracks
  add column if not exists punch_status text;

alter table public.tracks
  drop constraint if exists tracks_punch_status_check;

alter table public.tracks
  add constraint tracks_punch_status_check
  check (
    punch_status is null
    or punch_status in ('requested', 'processing', 'ready', 'failed', 'skipped')
  );

alter table public.tracks
  add column if not exists punch_audio_url text;

alter table public.tracks
  add column if not exists punch_requested_at timestamptz;

alter table public.tracks
  add column if not exists punch_ready_at timestamptz;

alter table public.tracks
  add column if not exists punch_notes text;

comment on column public.tracks.punch_status is
  'RECT Punch mastering: requested→processing→ready; Delivery prefers punch_audio_url when ready';
