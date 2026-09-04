-- ============================================================
-- KEBU HEALTH CHECK — paste in Kebu Supabase SQL Editor
-- Read-only. Does not delete anything.
-- ============================================================

-- 1) Core mobile-money / credits objects (should still exist if Kebu built them)
select
  to_regclass('public.play_packs') as play_packs,
  to_regclass('public.play_pack_purchases') as play_pack_purchases,
  to_regclass('public.user_play_balances') as user_play_balances,
  to_regclass('public.artist_tips') as artist_tips,
  to_regclass('public.users') as users,
  to_regclass('public.tracks') as tracks;

-- 2) RECT artist ledger (OK if missing on Kebu — not your mobile wallet)
select
  to_regclass('public.artist_wallets') as artist_wallets,
  to_regclass('public.artist_wallet_ledger') as artist_wallet_ledger,
  to_regclass('public.rect_labels') as rect_labels,
  to_regclass('public.label_wallets') as label_wallets;

-- 3) Play-pack payment columns (mobile money metadata)
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'play_pack_purchases'
  and column_name in ('payment_phone', 'joko_reference', 'status', 'credits_granted')
order by column_name;

-- 4) Key RPCs still present?
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'purchase_play_pack',
    'confirm_play_pack_purchase_system',
    'set_play_pack_joko_reference',
    'credit_artist_wallet',
    'ensure_artist_wallet'
  )
order by 1;

-- 5) Did the mangaled paste table linger?
select to_regclass('public.usersqltokebuinsteadofrect') as mangled_table;
