-- Listening parties: host a shared listen with chat (photos/gifs later).

create table if not exists public.listening_parties (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  track_id uuid references public.tracks (id) on delete set null,
  status text not null default 'live'
    check (status in ('scheduled', 'live', 'ended')),
  invite_code text not null unique,
  cover_url text,
  starts_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listening_parties_host_idx
  on public.listening_parties (host_id, created_at desc);

create index if not exists listening_parties_live_idx
  on public.listening_parties (status, created_at desc)
  where status = 'live';

create table if not exists public.listening_party_members (
  party_id uuid not null references public.listening_parties (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);

create index if not exists listening_party_members_user_idx
  on public.listening_party_members (user_id);

create table if not exists public.listening_party_messages (
  id bigserial primary key,
  party_id uuid not null references public.listening_parties (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  body text not null,
  kind text not null default 'text'
    check (kind in ('text', 'gif', 'photo')),
  media_url text,
  created_at timestamptz not null default now()
);

create index if not exists listening_party_messages_party_idx
  on public.listening_party_messages (party_id, created_at desc);

alter table public.listening_parties enable row level security;
alter table public.listening_party_members enable row level security;
alter table public.listening_party_messages enable row level security;

drop policy if exists "listening_parties_select" on public.listening_parties;
create policy "listening_parties_select"
  on public.listening_parties for select
  using (
    status = 'live'
    or host_id = auth.uid()
    or exists (
      select 1 from public.listening_party_members m
      where m.party_id = id and m.user_id = auth.uid()
    )
  );

drop policy if exists "listening_parties_insert" on public.listening_parties;
create policy "listening_parties_insert"
  on public.listening_parties for insert
  with check (host_id = auth.uid());

drop policy if exists "listening_parties_update" on public.listening_parties;
create policy "listening_parties_update"
  on public.listening_parties for update
  using (host_id = auth.uid());

drop policy if exists "listening_party_members_select" on public.listening_party_members;
create policy "listening_party_members_select"
  on public.listening_party_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.listening_parties p
      where p.id = party_id and p.host_id = auth.uid()
    )
  );

drop policy if exists "listening_party_members_insert" on public.listening_party_members;
create policy "listening_party_members_insert"
  on public.listening_party_members for insert
  with check (user_id = auth.uid());

drop policy if exists "listening_party_messages_select" on public.listening_party_messages;
create policy "listening_party_messages_select"
  on public.listening_party_messages for select
  using (
    exists (
      select 1 from public.listening_parties p
      where p.id = party_id
        and (
          p.host_id = auth.uid()
          or p.status = 'live'
          or exists (
            select 1 from public.listening_party_members m
            where m.party_id = p.id and m.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "listening_party_messages_insert" on public.listening_party_messages;
create policy "listening_party_messages_insert"
  on public.listening_party_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.listening_parties p
      where p.id = party_id
        and p.status = 'live'
        and (
          p.host_id = auth.uid()
          or exists (
            select 1 from public.listening_party_members m
            where m.party_id = p.id and m.user_id = auth.uid()
          )
        )
    )
  );

create or replace function public.create_listening_party(
  p_title text,
  p_track_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  v_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.listening_parties (host_id, title, track_id, status, invite_code, starts_at)
  values (auth.uid(), trim(p_title), p_track_id, 'live', v_code, now())
  returning id into v_id;
  insert into public.listening_party_members (party_id, user_id)
  values (v_id, auth.uid())
  on conflict do nothing;
  return v_id;
end;
$$;

grant execute on function public.create_listening_party(text, uuid) to authenticated;
