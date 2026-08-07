-- Play packs for RECT SOUND (Connection 5)
-- Country-scoped purchase tiers: Micro / Standard / Mega

create table if not exists public.play_packs (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  code text not null,
  name text not null,
  description text,
  price_label text,
  play_credits integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint play_packs_country_code_key unique (country, code)
);

alter table public.play_packs enable row level security;

drop policy if exists "play_packs_select_public" on public.play_packs;
create policy "play_packs_select_public"
  on public.play_packs for select
  to anon, authenticated
  using (true);

-- Seed Senegal packs (idempotent)
insert into public.play_packs (country, code, name, description, price_label, play_credits, sort_order)
values
  ('SN', 'micro', 'Micro', 'Quick listens for the day', '500 CFA', 50, 1),
  ('SN', 'standard', 'Standard', 'Your weekly sound diet', '1 500 CFA', 200, 2),
  ('SN', 'mega', 'Mega', 'Deep catalog access', '4 000 CFA', 600, 3)
on conflict (country, code) do update set
  name = excluded.name,
  description = excluded.description,
  price_label = excluded.price_label,
  play_credits = excluded.play_credits,
  sort_order = excluded.sort_order,
  updated_at = now();
