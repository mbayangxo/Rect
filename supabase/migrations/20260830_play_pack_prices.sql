-- Correct SN play pack prices to product spec: 100 / 200 / 500 XOF.
-- Safe to re-run.

update public.play_packs
set
  name = 'Micro',
  description = 'Quick listens for the day',
  price_label = '100 XOF',
  price_xof = 100,
  play_credits = 50,
  play_count = 50,
  sort_order = 1,
  active = true,
  updated_at = now()
where country = 'SN' and code = 'micro';

update public.play_packs
set
  name = 'Standard',
  description = 'Your weekly sound diet',
  price_label = '200 XOF',
  price_xof = 200,
  play_credits = 120,
  play_count = 120,
  sort_order = 2,
  active = true,
  updated_at = now()
where country = 'SN' and code = 'standard';

update public.play_packs
set
  name = 'Mega',
  description = 'Deep catalog access',
  price_label = '500 XOF',
  price_xof = 500,
  play_credits = 350,
  play_count = 350,
  sort_order = 3,
  active = true,
  updated_at = now()
where country = 'SN' and code = 'mega';

-- Ensure rows exist even if seed never ran
insert into public.play_packs (
  country, code, name, description, price_label, price_xof,
  play_credits, play_count, sort_order, active, updated_at
)
values
  ('SN', 'micro', 'Micro', 'Quick listens for the day', '100 XOF', 100, 50, 50, 1, true, now()),
  ('SN', 'standard', 'Standard', 'Your weekly sound diet', '200 XOF', 200, 120, 120, 2, true, now()),
  ('SN', 'mega', 'Mega', 'Deep catalog access', '500 XOF', 500, 350, 350, 3, true, now())
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

notify pgrst, 'reload schema';
