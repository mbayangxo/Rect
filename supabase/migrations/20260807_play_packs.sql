-- Play packs for RECT SOUND (Connection 5)
-- Harden for existing tables that may lack expected columns
-- or use a legacy NOT NULL play_count column.

create table if not exists public.play_packs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.play_packs add column if not exists country text;
alter table public.play_packs add column if not exists code text;
alter table public.play_packs add column if not exists name text;
alter table public.play_packs add column if not exists description text;
alter table public.play_packs add column if not exists price_label text;
alter table public.play_packs add column if not exists play_credits integer;
alter table public.play_packs add column if not exists sort_order integer not null default 0;
alter table public.play_packs add column if not exists updated_at timestamptz not null default now();
alter table public.play_packs add column if not exists play_count integer;

-- Backfill required fields on any legacy rows
update public.play_packs set country = 'SN' where country is null;
update public.play_packs set code = lower(coalesce(nullif(name, ''), id::text)) where code is null;
update public.play_packs set name = coalesce(nullif(name, ''), code, 'Pack') where name is null;
update public.play_packs
  set play_count = coalesce(play_count, play_credits, 0)
  where play_count is null;
update public.play_packs
  set play_credits = coalesce(play_credits, play_count, 0)
  where play_credits is null;

-- Soften legacy NOT NULL play_count so inserts that only set play_credits succeed
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'play_packs'
      and column_name = 'play_count'
      and is_nullable = 'NO'
  ) then
    alter table public.play_packs alter column play_count drop not null;
    alter table public.play_packs alter column play_count set default 0;
  end if;
exception when others then
  null;
end $$;

alter table public.play_packs alter column country set default 'SN';
alter table public.play_packs alter column country set not null;
alter table public.play_packs alter column code set not null;
alter table public.play_packs alter column name set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'play_packs_country_code_key'
  ) then
    alter table public.play_packs
      add constraint play_packs_country_code_key unique (country, code);
  end if;
end $$;

alter table public.play_packs enable row level security;

drop policy if exists "play_packs_select_public" on public.play_packs;
create policy "play_packs_select_public"
  on public.play_packs for select
  to anon, authenticated
  using (true);

-- Insert with both play_credits and play_count for legacy schemas
insert into public.play_packs (
  country, code, name, description, price_label, play_credits, play_count, sort_order
)
values
  ('SN', 'micro', 'Micro', 'Quick listens for the day', '500 CFA', 50, 50, 1),
  ('SN', 'standard', 'Standard', 'Your weekly sound diet', '1 500 CFA', 200, 200, 2),
  ('SN', 'mega', 'Mega', 'Deep catalog access', '4 000 CFA', 600, 600, 3)
on conflict (country, code) do update set
  name = excluded.name,
  description = excluded.description,
  price_label = excluded.price_label,
  play_credits = excluded.play_credits,
  play_count = excluded.play_count,
  sort_order = excluded.sort_order,
  updated_at = now();
