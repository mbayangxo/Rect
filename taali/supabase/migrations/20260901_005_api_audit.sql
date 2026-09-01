-- ============================================================
-- Taali API keys + audit logs
-- Paste after 20260901_004_delivery.sql
-- ============================================================

-- ── API keys ──────────────────────────────────────────────────

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{releases:write,deliveries:write}'::text[],
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  created_by uuid references public.profiles (id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key_prefix)
);

create index if not exists api_keys_org_idx
  on public.api_keys (organization_id, created_at desc)
  where organization_id is not null;
create index if not exists api_keys_status_idx
  on public.api_keys (status)
  where status = 'active';

drop trigger if exists api_keys_set_updated_at on public.api_keys;
create trigger api_keys_set_updated_at
  before update on public.api_keys
  for each row execute function public.set_updated_at();

create or replace function public.hash_api_key(p_raw_key text)
returns text
language sql
immutable
as $$
  select encode(digest(p_raw_key, 'sha256'), 'hex');
$$;

create or replace function public.create_api_key(
  p_name text,
  p_organization_id uuid default null,
  p_scopes text[] default array['releases:write', 'deliveries:write']::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_raw_key text;
  v_prefix text;
  v_key_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'name is required';
  end if;

  if p_organization_id is not null
     and not public.user_has_org_role(p_organization_id, array['owner', 'admin']::text[]) then
    raise exception 'Insufficient permissions for organization';
  end if;

  v_raw_key := 'taali_' || replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');
  v_prefix := left(v_raw_key, 14);

  insert into public.api_keys (
    organization_id,
    name,
    key_prefix,
    key_hash,
    scopes,
    created_by
  )
  values (
    p_organization_id,
    btrim(p_name),
    v_prefix,
    public.hash_api_key(v_raw_key),
    coalesce(p_scopes, array['releases:write', 'deliveries:write']::text[]),
    v_uid
  )
  returning id into v_key_id;

  return jsonb_build_object(
    'id', v_key_id,
    'key_prefix', v_prefix,
    'api_key', v_raw_key
  );
end;
$$;

create or replace function public.verify_api_key(p_raw_key text)
returns table (
  api_key_id uuid,
  organization_id uuid,
  scopes text[],
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ak.id,
    ak.organization_id,
    ak.scopes,
    ak.status
  from public.api_keys ak
  where ak.key_hash = public.hash_api_key(p_raw_key)
    and ak.status = 'active'
    and (ak.expires_at is null or ak.expires_at > now())
  limit 1;
$$;

create or replace function public.touch_api_key_last_used(p_api_key_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.api_keys
  set last_used_at = now(), updated_at = now()
  where id = p_api_key_id;
$$;

revoke all on function public.create_api_key(text, uuid, text[]) from public;
grant execute on function public.create_api_key(text, uuid, text[]) to authenticated;

revoke all on function public.verify_api_key(text) from public;
grant execute on function public.verify_api_key(text) to service_role;

revoke all on function public.touch_api_key_last_used(uuid) from public;
grant execute on function public.touch_api_key_last_used(uuid) to service_role;

-- ── Audit logs ────────────────────────────────────────────────

create table if not exists public.audit_logs (
  id bigserial primary key,
  organization_id uuid references public.organizations (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  api_key_id uuid references public.api_keys (id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  request_id text,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_idx
  on public.audit_logs (organization_id, created_at desc);
create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc)
  where actor_id is not null;
create index if not exists audit_logs_api_key_idx
  on public.audit_logs (api_key_id, created_at desc)
  where api_key_id is not null;
create index if not exists audit_logs_resource_idx
  on public.audit_logs (resource_type, resource_id, created_at desc);

create or replace function public.write_audit_log(
  p_action text,
  p_resource_type text default null,
  p_resource_id text default null,
  p_organization_id uuid default null,
  p_actor_id uuid default null,
  p_api_key_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_request_id text default null,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.audit_logs (
    organization_id,
    actor_id,
    api_key_id,
    action,
    resource_type,
    resource_id,
    request_id,
    ip_address,
    user_agent,
    metadata
  )
  values (
    p_organization_id,
    p_actor_id,
    p_api_key_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_request_id,
    p_ip_address,
    p_user_agent,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.write_audit_log(
  text, text, text, uuid, uuid, uuid, jsonb, text, inet, text
) from public;
grant execute on function public.write_audit_log(
  text, text, text, uuid, uuid, uuid, jsonb, text, inet, text
) to authenticated, service_role;

-- ── Row level security ───────────────────────────────────────

alter table public.api_keys enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "api_keys_select_admin" on public.api_keys;
create policy "api_keys_select_admin"
  on public.api_keys for select
  to authenticated
  using (
    organization_id is null
    or public.user_has_org_role(organization_id, array['owner', 'admin']::text[])
  );

drop policy if exists "api_keys_insert_admin" on public.api_keys;
create policy "api_keys_insert_admin"
  on public.api_keys for insert
  to authenticated
  with check (
    organization_id is null
    or public.user_has_org_role(organization_id, array['owner', 'admin']::text[])
  );

drop policy if exists "api_keys_update_admin" on public.api_keys;
create policy "api_keys_update_admin"
  on public.api_keys for update
  to authenticated
  using (
    organization_id is null
    or public.user_has_org_role(organization_id, array['owner', 'admin']::text[])
  )
  with check (
    organization_id is null
    or public.user_has_org_role(organization_id, array['owner', 'admin']::text[])
  );

drop policy if exists "api_keys_delete_admin" on public.api_keys;
create policy "api_keys_delete_admin"
  on public.api_keys for delete
  to authenticated
  using (
    organization_id is null
    or public.user_has_org_role(organization_id, array['owner', 'admin']::text[])
  );

drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin"
  on public.audit_logs for select
  to authenticated
  using (
    organization_id is null
    or public.user_has_org_role(organization_id, array['owner', 'admin']::text[])
  );

drop policy if exists "audit_logs_insert_member" on public.audit_logs;
create policy "audit_logs_insert_member"
  on public.audit_logs for insert
  to authenticated
  with check (
    organization_id is null
    or public.user_has_org_role(organization_id)
  );

notify pgrst, 'reload schema';
