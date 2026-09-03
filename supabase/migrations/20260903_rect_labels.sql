-- RECT Labels: mutual accept between label and artist.

alter table public.users
  drop constraint if exists users_account_type_check;

alter table public.users
  add constraint users_account_type_check
  check (account_type is null or account_type in ('fan', 'artist', 'label'));

create table if not exists public.rect_labels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  slug text unique,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rect_labels_owner_unique
  on public.rect_labels (owner_id);

create table if not exists public.rect_label_memberships (
  id uuid primary key default gen_random_uuid(),
  label_id uuid not null references public.rect_labels (id) on delete cascade,
  artist_id uuid not null references public.users (id) on delete cascade,
  -- pending = one side invited; accepted = both confirmed; declined/ended
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'ended')),
  invited_by uuid not null references public.users (id),
  -- who still needs to accept (null when accepted)
  awaiting_user_id uuid references public.users (id),
  artist_accepted_at timestamptz,
  label_accepted_at timestamptz,
  revenue_split_label_pct numeric(5,2) default 20
    check (revenue_split_label_pct >= 0 and revenue_split_label_pct <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (label_id, artist_id)
);

create index if not exists rect_label_memberships_artist_idx
  on public.rect_label_memberships (artist_id, status);

create index if not exists rect_label_memberships_label_status_idx
  on public.rect_label_memberships (label_id, status);

alter table public.rect_labels enable row level security;
alter table public.rect_label_memberships enable row level security;

drop policy if exists "rect_labels_select" on public.rect_labels;
create policy "rect_labels_select"
  on public.rect_labels for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.rect_label_memberships m
      where m.label_id = id
        and m.artist_id = auth.uid()
        and m.status in ('pending', 'accepted')
    )
  );

drop policy if exists "rect_labels_insert" on public.rect_labels;
create policy "rect_labels_insert"
  on public.rect_labels for insert
  with check (owner_id = auth.uid());

drop policy if exists "rect_labels_update" on public.rect_labels;
create policy "rect_labels_update"
  on public.rect_labels for update
  using (owner_id = auth.uid());

drop policy if exists "rect_label_memberships_select" on public.rect_label_memberships;
create policy "rect_label_memberships_select"
  on public.rect_label_memberships for select
  using (
    artist_id = auth.uid()
    or exists (
      select 1 from public.rect_labels l
      where l.id = label_id and l.owner_id = auth.uid()
    )
  );

drop policy if exists "rect_label_memberships_insert" on public.rect_label_memberships;
create policy "rect_label_memberships_insert"
  on public.rect_label_memberships for insert
  with check (
    invited_by = auth.uid()
    and (
      artist_id = auth.uid()
      or exists (
        select 1 from public.rect_labels l
        where l.id = label_id and l.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "rect_label_memberships_update" on public.rect_label_memberships;
create policy "rect_label_memberships_update"
  on public.rect_label_memberships for update
  using (
    artist_id = auth.uid()
    or exists (
      select 1 from public.rect_labels l
      where l.id = label_id and l.owner_id = auth.uid()
    )
  );

create or replace function public.create_rect_label(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then
    v_slug := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;
  insert into public.rect_labels (owner_id, name, slug)
  values (auth.uid(), trim(p_name), v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_rect_label(text) to authenticated;
