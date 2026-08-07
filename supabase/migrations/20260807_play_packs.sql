-- ============================================================
-- PASTE THIS ENTIRE SCRIPT in Supabase → SQL Editor → Run
-- Safe / idempotent for legacy play_packs schemas
-- ============================================================

-- 1) Ensure table exists
create table if not exists public.play_packs (
  id bigserial primary key,
  created_at timestamptz not null default now()
);

-- 2) Add every column we need (no-op if already there)
alter table public.play_packs add column if not exists play_count integer;
alter table public.play_packs add column if not exists name text;
alter table public.play_packs add column if not exists description text;
alter table public.play_packs add column if not exists price_label text;
alter table public.play_packs add column if not exists active boolean default true;
alter table public.play_packs add column if not exists country text;
alter table public.play_packs add column if not exists code text;
alter table public.play_packs add column if not exists play_credits integer;
alter table public.play_packs add column if not exists sort_order integer default 0;
alter table public.play_packs add column if not exists updated_at timestamptz default now();

-- 3) Fix legacy NOT NULL play_count BEFORE any insert
alter table public.play_packs alter column play_count drop not null;
alter table public.play_packs alter column play_count set default 0;

-- 4) Backfill nulls so later NOT NULL alters succeed
update public.play_packs set play_count = coalesce(play_count, play_credits, 0);
update public.play_packs set play_credits = coalesce(play_credits, play_count, 0);
update public.play_packs set country = coalesce(country, 'SN');
update public.play_packs set name = coalesce(nullif(name, ''), code, 'Pack');
update public.play_packs set code = coalesce(
  nullif(code, ''),
  lower(regexp_replace(coalesce(name, 'pack'), '\s+', '_', 'g'))
);
update public.play_packs set sort_order = coalesce(sort_order, 0);
update public.play_packs set active = coalesce(active, true);

-- 5) Unique key on (country, code) — drop/recreate if needed
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'play_packs_country_code_key'
  ) then
    -- remove duplicate (country, code) rows keeping lowest id
    delete from public.play_packs a
    using public.play_packs b
    where a.country = b.country
      and a.code = b.code
      and a.ctid < b.ctid;

    alter table public.play_packs
      add constraint play_packs_country_code_key unique (country, code);
  end if;
end $$;

-- 6) Upsert the three SN packs — ALWAYS set play_count
insert into public.play_packs as p (
  country,
  code,
  name,
  description,
  price_label,
  play_credits,
  play_count,
  sort_order,
  active,
  updated_at
)
values
  ('SN', 'micro', 'Micro', 'Quick listens for the day', '500 CFA', 50, 50, 1, true, now()),
  ('SN', 'standard', 'Standard', 'Your weekly sound diet', '1 500 CFA', 200, 200, 2, true, now()),
  ('SN', 'mega', 'Mega', 'Deep catalog access', '4 000 CFA', 600, 600, 3, true, now())
on conflict (country, code) do update set
  name = excluded.name,
  description = excluded.description,
  price_label = excluded.price_label,
  play_credits = excluded.play_credits,
  play_count = excluded.play_count,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

-- 7) Public read
alter table public.play_packs enable row level security;

drop policy if exists "play_packs_select_public" on public.play_packs;
create policy "play_packs_select_public"
  on public.play_packs for select
  to anon, authenticated
  using (true);

-- 8) Refresh PostgREST schema cache so the app sees new columns
notify pgrst, 'reload schema';

-- 9) Confirm
select id, country, code, name, play_count, play_credits, price_label, sort_order
from public.play_packs
where country = 'SN'
order by sort_order;
