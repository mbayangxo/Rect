-- ============================================================
-- PASTE THIS ENTIRE SCRIPT in Supabase → SQL Editor → Run
-- Handles legacy columns: play_count, price_xof, active, etc.
-- ============================================================

create table if not exists public.play_packs (
  id bigserial primary key,
  created_at timestamptz not null default now()
);

-- Add columns (no-op if present)
alter table public.play_packs add column if not exists play_count integer;
alter table public.play_packs add column if not exists name text;
alter table public.play_packs add column if not exists description text;
alter table public.play_packs add column if not exists price_label text;
alter table public.play_packs add column if not exists price_xof integer;
alter table public.play_packs add column if not exists active boolean default true;
alter table public.play_packs add column if not exists country text;
alter table public.play_packs add column if not exists code text;
alter table public.play_packs add column if not exists play_credits integer;
alter table public.play_packs add column if not exists sort_order integer default 0;
alter table public.play_packs add column if not exists updated_at timestamptz default now();

-- Soften legacy NOT NULL columns before insert
alter table public.play_packs alter column play_count drop not null;
alter table public.play_packs alter column play_count set default 0;

alter table public.play_packs alter column price_xof drop not null;
alter table public.play_packs alter column price_xof set default 0;

-- Backfill
update public.play_packs set play_count = coalesce(play_count, play_credits, 0);
update public.play_packs set play_credits = coalesce(play_credits, play_count, 0);
update public.play_packs set price_xof = coalesce(
  price_xof,
  case
    when price_label ~ '[0-9]' then nullif(regexp_replace(price_label, '[^0-9]', '', 'g'), '')::integer
    else 0
  end,
  0
);
update public.play_packs set country = coalesce(country, 'SN');
update public.play_packs set name = coalesce(nullif(name, ''), code, 'Pack');
update public.play_packs set code = coalesce(
  nullif(code, ''),
  lower(regexp_replace(coalesce(name, 'pack'), '\s+', '_', 'g'))
);
update public.play_packs set sort_order = coalesce(sort_order, 0);
update public.play_packs set active = coalesce(active, true);

-- Unique (country, code)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'play_packs_country_code_key'
  ) then
    delete from public.play_packs a
    using public.play_packs b
    where a.country is not distinct from b.country
      and a.code is not distinct from b.code
      and a.ctid < b.ctid;

    alter table public.play_packs
      add constraint play_packs_country_code_key unique (country, code);
  end if;
end $$;

-- Upsert — set play_count AND price_xof (legacy NOT NULL columns)
insert into public.play_packs (
  country,
  code,
  name,
  description,
  price_label,
  price_xof,
  play_credits,
  play_count,
  sort_order,
  active,
  updated_at
)
values
  ('SN', 'micro', 'Micro', 'Quick listens for the day', '500 CFA', 500, 50, 50, 1, true, now()),
  ('SN', 'standard', 'Standard', 'Your weekly sound diet', '1 500 CFA', 1500, 200, 200, 2, true, now()),
  ('SN', 'mega', 'Mega', 'Deep catalog access', '4 000 CFA', 4000, 600, 600, 3, true, now())
on conflict (country, code) do update set
  name = excluded.name,
  description = excluded.description,
  price_label = excluded.price_label,
  price_xof = excluded.price_xof,
  play_credits = excluded.play_credits,
  play_count = excluded.play_count,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

alter table public.play_packs enable row level security;

drop policy if exists "play_packs_select_public" on public.play_packs;
create policy "play_packs_select_public"
  on public.play_packs for select
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';

select id, country, code, name, price_xof, price_label, play_count, play_credits, sort_order
from public.play_packs
where country = 'SN'
order by sort_order;
