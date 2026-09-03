-- ============================================================
-- Taali foundation: profiles, organizations, artists, RLS
-- Paste in Supabase SQL Editor (Taali project) → Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ── Shared helpers ────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.slugify(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    lower(regexp_replace(coalesce(p_text, ''), '[^a-zA-Z0-9]+', '-', 'g')),
    '-{2,}', '-', 'g'
  ));
$$;

create sequence if not exists public.artist_number_seq start 1;

create or replace function public.assign_artist_code()
returns trigger
language plpgsql
as $$
begin
  if new.artist_code is null or btrim(new.artist_code) = '' then
    new.artist_code := 'TA-' || lpad(nextval('public.artist_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create or replace function public.user_has_org_role(
  p_org_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and (
        p_roles is null
        or om.roles && p_roles
      )
  );
$$;

create or replace function public.user_can_access_artist(p_artist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.artists a
    where a.id = p_artist_id
      and public.user_has_org_role(a.organization_id)
  );
$$;

-- ── Profiles ─────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'User',
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── Organizations ─────────────────────────────────────────────

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  org_type text not null default 'label'
    check (org_type in ('solo', 'label', 'distributor', 'management')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organizations_created_by_idx
  on public.organizations (created_by);

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ── Organization members (multi-role) ─────────────────────────

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  roles text[] not null default '{member}'::text[],
  status text not null default 'active'
    check (status in ('pending', 'active', 'suspended')),
  invited_email text,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  constraint organization_members_roles_check check (
    roles <@ array[
      'owner', 'admin', 'billing', 'catalog', 'delivery', 'rights', 'viewer', 'member'
    ]::text[]
    and cardinality(roles) > 0
  )
);

create index if not exists organization_members_user_idx
  on public.organization_members (user_id);
create index if not exists organization_members_org_idx
  on public.organization_members (organization_id);

drop trigger if exists organization_members_set_updated_at on public.organization_members;
create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();

-- ── Artists ───────────────────────────────────────────────────

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  artist_code text not null unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  external_id text unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artists_org_idx
  on public.artists (organization_id, created_at desc);
create index if not exists artists_external_id_idx
  on public.artists (external_id)
  where external_id is not null;

drop trigger if exists artists_assign_code on public.artists;
create trigger artists_assign_code
  before insert on public.artists
  for each row execute function public.assign_artist_code();

drop trigger if exists artists_set_updated_at on public.artists;
create trigger artists_set_updated_at
  before update on public.artists
  for each row execute function public.set_updated_at();

-- ── Auth: profile bootstrap ───────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1),
      'User'
    ),
    new.email
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    email = coalesce(excluded.email, public.profiles.email),
    updated_at = now();

  return new;
exception
  when others then
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to postgres, service_role, supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RPC: create artist workspace ──────────────────────────────

create or replace function public.create_artist_workspace(
  p_artist_name text,
  p_organization_name text default null,
  p_external_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_artist_id uuid;
  v_artist_code text;
  v_org_name text;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(btrim(p_artist_name), '') is null then
    raise exception 'artist_name is required';
  end if;

  v_org_name := coalesce(nullif(btrim(p_organization_name), ''), btrim(p_artist_name));
  v_slug := public.slugify(v_org_name) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.organizations (name, slug, org_type, created_by)
  values (v_org_name, v_slug, 'solo', v_uid)
  returning id into v_org_id;

  insert into public.organization_members (
    organization_id,
    user_id,
    roles,
    status,
    accepted_at
  )
  values (
    v_org_id,
    v_uid,
    array['owner', 'admin', 'catalog', 'delivery', 'rights']::text[],
    'active',
    now()
  );

  insert into public.artists (
    organization_id,
    name,
    external_id,
    created_by
  )
  values (
    v_org_id,
    btrim(p_artist_name),
    nullif(btrim(p_external_id), ''),
    v_uid
  )
  returning id, artist_code into v_artist_id, v_artist_code;

  return jsonb_build_object(
    'organization_id', v_org_id,
    'artist_id', v_artist_id,
    'artist_code', v_artist_code
  );
end;
$$;

revoke all on function public.create_artist_workspace(text, text, text) from public;
grant execute on function public.create_artist_workspace(text, text, text) to authenticated;

-- ── Row level security ───────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.artists enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_select_org_peers" on public.profiles;
create policy "profiles_select_org_peers"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members mine
      join public.organization_members peer
        on peer.organization_id = mine.organization_id
      where mine.user_id = auth.uid()
        and mine.status = 'active'
        and peer.user_id = profiles.id
        and peer.status = 'active'
    )
  );

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
  on public.organizations for select
  to authenticated
  using (public.user_has_org_role(id));

drop policy if exists "organizations_insert_authenticated" on public.organizations;
create policy "organizations_insert_authenticated"
  on public.organizations for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "organizations_update_admin" on public.organizations;
create policy "organizations_update_admin"
  on public.organizations for update
  to authenticated
  using (public.user_has_org_role(id, array['owner', 'admin']::text[]))
  with check (public.user_has_org_role(id, array['owner', 'admin']::text[]));

drop policy if exists "organization_members_select_member" on public.organization_members;
create policy "organization_members_select_member"
  on public.organization_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.user_has_org_role(organization_id)
  );

drop policy if exists "organization_members_insert_admin" on public.organization_members;
create policy "organization_members_insert_admin"
  on public.organization_members for insert
  to authenticated
  with check (
    public.user_has_org_role(organization_id, array['owner', 'admin']::text[])
    or (
      user_id = auth.uid()
      and roles = array['owner']::text[]
      and status = 'active'
    )
  );

drop policy if exists "organization_members_update_admin" on public.organization_members;
create policy "organization_members_update_admin"
  on public.organization_members for update
  to authenticated
  using (
    user_id = auth.uid()
    or public.user_has_org_role(organization_id, array['owner', 'admin']::text[])
  )
  with check (
    user_id = auth.uid()
    or public.user_has_org_role(organization_id, array['owner', 'admin']::text[])
  );

drop policy if exists "organization_members_delete_admin" on public.organization_members;
create policy "organization_members_delete_admin"
  on public.organization_members for delete
  to authenticated
  using (public.user_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists "artists_select_member" on public.artists;
create policy "artists_select_member"
  on public.artists for select
  to authenticated
  using (public.user_has_org_role(organization_id));

drop policy if exists "artists_insert_catalog" on public.artists;
create policy "artists_insert_catalog"
  on public.artists for insert
  to authenticated
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'catalog']::text[]
    )
  );

drop policy if exists "artists_update_catalog" on public.artists;
create policy "artists_update_catalog"
  on public.artists for update
  to authenticated
  using (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'catalog']::text[]
    )
  )
  with check (
    public.user_has_org_role(
      organization_id,
      array['owner', 'admin', 'catalog']::text[]
    )
  );

drop policy if exists "artists_delete_admin" on public.artists;
create policy "artists_delete_admin"
  on public.artists for delete
  to authenticated
  using (public.user_has_org_role(organization_id, array['owner', 'admin']::text[]));

revoke all on function public.user_has_org_role(uuid, text[]) from public;
grant execute on function public.user_has_org_role(uuid, text[]) to authenticated;

revoke all on function public.user_can_access_artist(uuid) from public;
grant execute on function public.user_can_access_artist(uuid) to authenticated;

notify pgrst, 'reload schema';
