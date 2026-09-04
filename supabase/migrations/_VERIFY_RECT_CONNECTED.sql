-- ============================================================
-- RECT schema connectivity check (read-only)
-- Paste in RECT Supabase SQL Editor → Run
-- Expect status = 'ok' on every row.
-- ============================================================

with checks (area, object, present) as (
  values
    -- Core Artist OS
    ('monetization', 'artist_wallets',            to_regclass('public.artist_wallets') is not null),
    ('monetization', 'artist_wallet_ledger',      to_regclass('public.artist_wallet_ledger') is not null),
    ('monetization', 'artist_joko_payouts',       to_regclass('public.artist_joko_payouts') is not null),
    ('monetization', 'artist_merch_items',        to_regclass('public.artist_merch_items') is not null),
    ('monetization', 'fan_club_tiers',            to_regclass('public.fan_club_tiers') is not null),
    ('monetization', 'live_rooms',                to_regclass('public.live_rooms') is not null),
    ('monetization', 'rect_lives',                to_regclass('public.rect_lives') is not null),
    ('monetization', 'distribution_releases',     to_regclass('public.distribution_releases') is not null),
    ('monetization', 'dm_conversations',          to_regclass('public.dm_conversations') is not null),

    -- Labels + wallets (Sep 3–4)
    ('labels', 'rect_labels',                    to_regclass('public.rect_labels') is not null),
    ('labels', 'rect_label_memberships',         to_regclass('public.rect_label_memberships') is not null),
    ('labels', 'label_wallets',                  to_regclass('public.label_wallets') is not null),
    ('labels', 'label_wallet_ledger',            to_regclass('public.label_wallet_ledger') is not null),
    ('labels', 'create_rect_label()',            to_regprocedure('public.create_rect_label(text)') is not null),
    ('labels', 'label_wallet_balance_breakdown()', to_regprocedure('public.label_wallet_balance_breakdown(uuid)') is not null),
    ('labels', 'artist_wallet_balance_breakdown()', to_regprocedure('public.artist_wallet_balance_breakdown(uuid)') is not null),
    ('labels', 'credit_artist_wallet()',         to_regprocedure('public.credit_artist_wallet(uuid,integer,text,text,text)') is not null),

    -- Hearing Aids / Punch / behavior
    ('hearing', 'tracks.content_kind', (
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='tracks' and column_name='content_kind')
    )),
    ('hearing', 'tracks.punch_status', (
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='tracks' and column_name='punch_status')
    )),
    ('behavior', 'plays.listened_secs', (
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='plays' and column_name='listened_secs')
    )),
    ('behavior', 'listener_behavior_affinity()', to_regprocedure('public.listener_behavior_affinity(integer)') is not null),
    ('behavior', 'update_play_listened_secs()',  to_regprocedure('public.update_play_listened_secs(uuid,integer)') is not null),

    -- QC / store / parties
    ('studio', 'listening_parties',              to_regclass('public.listening_parties') is not null),
    ('studio', 'tracks.qc_status', (
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='tracks' and column_name='qc_status')
    )),
    ('studio', 'tracks.launch_at', (
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='tracks' and column_name='launch_at')
    ))
)
select
  area,
  object,
  case when present then 'ok' else 'MISSING' end as status
from checks
order by
  case when present then 1 else 0 end,
  area,
  object;
