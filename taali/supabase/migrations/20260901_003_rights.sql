-- ============================================================
-- Taali rights: contributors, recording splits, invitations
-- Paste after 20260901_002_catalog.sql
-- ============================================================

-- ── Contributors ──────────────────────────────────────────────

create table if not exists public.contributors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  display_name text not null,
  legal_name text,
  email text,
  pro_affiliation text,
  ipi_number text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contributors_org_idx
  on public.contributors (organization_id, display_name);
create index if not exists contributors_profile_idx
  on public.contributors (profile_id)
  where profile_id is not null;
create unique index if not exists contributors_org_email_uidx
  on public.contributors (organization_id, lower(email))
  where email is not null;

drop trigger if exists contributors_set_updated_at on public.contributors;
create trigger contributors_set_updated_at
  before update on public.contributors
  for each row execute function public.set_updated_at();

-- ── Recording splits (versioned) ──────────────────────────────

create table if not exists public.recording_splits (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'superseded')),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (track_id, version)
);

create unique index if not exists recording_splits_one_active_per_track
  on public.recording_splits (track_id)
  where status = 'active';

create index if not exists recording_splits_track_idx
  on public.recording_splits (track_id, version desc);

drop trigger if exists recording_splits_set_updated_at on public.recording_splits;
create trigger recording_splits_set_updated_at
  before update on public.recording_splits
  for each row execute function public.set_updated_at();

-- ── Recording split parties ───────────────────────────────────

create table if not exists public.recording_split_parties (
  id uuid primary key default gen_random_uuid(),
  split_id uuid not null references public.recording_splits (id) on delete cascade,
  contributor_id uuid references public.contributors (id) on delete set null,
  party_name text not null,
  role text not null default 'writer'
    check (role in ('writer', 'composer', 'lyricist', 'performer', 'producer', 'publisher', 'other')),
  share_percent numeric(7, 4) not null
    check (share_percent > 0 and share_percent <= 100),
  invitation_status text not null default 'not_required'
    check (invitation_status in ('not_required', 'pending', 'accepted', 'declined', 'expired')),
  invitation_email text,
  invited_at timestamptz,
  responded_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recording_split_parties_split_idx
  on public.recording_split_parties (split_id, sort_order);
create index if not exists recording_split_parties_contributor_idx
  on public.recording_split_parties (contributor_id)
  where contributor_id is not null;

drop trigger if exists recording_split_parties_set_updated_at on public.recording_split_parties;
create trigger recording_split_parties_set_updated_at
  before update on public.recording_split_parties
  for each row execute function public.set_updated_at();

-- ── Split validation ─────────────────────────────────────────

create or replace function public.validate_split_total(p_split_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total numeric;
begin
  select coalesce(sum(share_percent), 0)
  into v_total
  from public.recording_split_parties
  where split_id = p_split_id;

  return abs(v_total - 100) < 0.0001;
end;
$$;

create or replace function public.activate_recording_split(p_split_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_track_id uuid;
  v_org_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select track_id, organization_id
  into v_track_id, v_org_id
  from public.recording_splits
  where id = p_split_id;

  if v_track_id is null then
    raise exception 'Split not found';
  end if;

  if not public.user_has_org_role(v_org_id, array['owner', 'admin', 'rights', 'catalog']::text[]) then
    raise exception 'Insufficient permissions';
  end if;

  if not public.validate_split_total(p_split_id) then
    raise exception 'Split must total 100%% before activation';
  end if;

  update public.recording_splits
  set status = 'superseded', updated_at = now()
  where track_id = v_track_id
    and status = 'active'
    and id <> p_split_id;

  update public.recording_splits
  set status = 'active', activated_at = now(), updated_at = now()
  where id = p_split_id;

  return jsonb_build_object('split_id', p_split_id, 'status', 'active');
end;
$$;

revoke all on function public.validate_split_total(uuid) from public;
grant execute on function public.validate_split_total(uuid) to authenticated;

revoke all on function public.activate_recording_split(uuid) from public;
grant execute on function public.activate_recording_split(uuid) to authenticated;

-- ── Row level security ───────────────────────────────────────

alter table public.contributors enable row level security;
alter table public.recording_splits enable row level security;
alter table public.recording_split_parties enable row level security;

drop policy if exists "contributors_select_member" on public.contributors;
create policy "contributors_select_member"
  on public.contributors for select
  to authenticated
  using (public.user_has_org_role(organization_id));

drop policy if exists "contributors_insert_rights" on public.contributors;
create policy "contributors_insert_rights"
  on public.contributors for insert
  to authenticated
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'rights', 'catalog']::text[]
    )
  );

drop policy if exists "contributors_update_rights" on public.contributors;
create policy "contributors_update_rights"
  on public.contributors for update
  to authenticated
  using (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'rights', 'catalog']::text[]
    )
  )
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'rights', 'catalog']::text[]
    )
  );

drop policy if exists "contributors_delete_admin" on public.contributors;
create policy "contributors_delete_admin"
  on public.contributors for delete
  to authenticated
  using (public.user_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists "recording_splits_select_member" on public.recording_splits;
create policy "recording_splits_select_member"
  on public.recording_splits for select
  to authenticated
  using (public.user_has_org_role(organization_id));

drop policy if exists "recording_splits_insert_rights" on public.recording_splits;
create policy "recording_splits_insert_rights"
  on public.recording_splits for insert
  to authenticated
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'rights', 'catalog']::text[]
    )
  );

drop policy if exists "recording_splits_update_rights" on public.recording_splits;
create policy "recording_splits_update_rights"
  on public.recording_splits for update
  to authenticated
  using (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'rights', 'catalog']::text[]
    )
  )
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'rights', 'catalog']::text[]
    )
  );

drop policy if exists "recording_splits_delete_admin" on public.recording_splits;
create policy "recording_splits_delete_admin"
  on public.recording_splits for delete
  to authenticated
  using (public.user_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists "recording_split_parties_select_member" on public.recording_split_parties;
create policy "recording_split_parties_select_member"
  on public.recording_split_parties for select
  to authenticated
  using (
    exists (
      select 1
      from public.recording_splits rs
      where rs.id = split_id
        and public.user_has_org_role(rs.organization_id)
    )
  );

drop policy if exists "recording_split_parties_insert_rights" on public.recording_split_parties;
create policy "recording_split_parties_insert_rights"
  on public.recording_split_parties for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.recording_splits rs
      where rs.id = split_id
        and public.user_has_org_role(
          rs.organization_id,
          array['owner', 'admin', 'rights', 'catalog']::text[]
        )
    )
  );

drop policy if exists "recording_split_parties_update_rights" on public.recording_split_parties;
create policy "recording_split_parties_update_rights"
  on public.recording_split_parties for update
  to authenticated
  using (
    exists (
      select 1
      from public.recording_splits rs
      where rs.id = split_id
        and public.user_has_org_role(
          rs.organization_id,
          array['owner', 'admin', 'rights', 'catalog']::text[]
        )
    )
  )
  with check (
    exists (
      select 1
      from public.recording_splits rs
      where rs.id = split_id
        and public.user_has_org_role(
          rs.organization_id,
          array['owner', 'admin', 'rights', 'catalog']::text[]
        )
    )
  );

drop policy if exists "recording_split_parties_delete_rights" on public.recording_split_parties;
create policy "recording_split_parties_delete_rights"
  on public.recording_split_parties for delete
  to authenticated
  using (
    exists (
      select 1
      from public.recording_splits rs
      where rs.id = split_id
        and public.user_has_org_role(
          rs.organization_id,
          array['owner', 'admin', 'rights']::text[]
        )
    )
  );

notify pgrst, 'reload schema';
