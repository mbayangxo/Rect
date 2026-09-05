-- ============================================================
-- SAFE UNDO for Kebu (or any non-RECT project)
-- Removes ONLY clearly RECT-specific objects from a mistaken paste.
--
-- DOES NOT touch:
--   artist_wallets, artist_wallet_ledger, artist_joko_payouts
--   credit_artist_wallet / ensure_artist_wallet / breakdown RPCs
--   merch, fan club, tips, play packs, tour, live_rooms, DMs
--   tracks/plays columns that Kebu may already use
--
-- DO NOT run _UNDO_RECT_FROM_WRONG_PROJECT.sql on Kebu if you
-- have built wallets / monetization there — that file DROPS them.
-- ============================================================

-- Mangaled paste artifact (from note glued into SQL)
drop table if exists public.usersqltokebuinsteadofrect cascade;

-- RECT Labels + label wallets only
drop function if exists public.label_wallet_balance_breakdown(uuid);
drop function if exists public.ensure_label_wallet(uuid);
drop function if exists public.create_rect_label(text);

drop table if exists public.label_wallet_ledger cascade;
drop table if exists public.label_wallets cascade;
drop table if exists public.rect_label_memberships cascade;
drop table if exists public.rect_labels cascade;

-- RECT Hearing Aids / Punch columns (skip if Kebu needs these names)
alter table public.tracks drop column if exists content_kind;
alter table public.tracks drop column if exists punch_status;
alter table public.tracks drop column if exists punch_audio_url;
alter table public.tracks drop column if exists punch_requested_at;
alter table public.tracks drop column if exists punch_ready_at;
alter table public.tracks drop column if exists punch_notes;

-- RECT behavior RPCs (policies left alone if Kebu uses plays updates)
drop function if exists public.listener_behavior_affinity(integer);
drop function if exists public.update_play_listened_secs(uuid, integer);

-- RECT Live (pro) only — does NOT drop live_rooms
drop table if exists public.rect_lives cascade;
drop function if exists public.start_rect_live(text, text, text, uuid, text, text);
drop function if exists public.end_rect_live(uuid);

-- Optional: remove 'label' from account_type if Kebu never wanted it.
-- Commented out by default — uncomment only if you are sure.
-- alter table public.users drop constraint if exists users_account_type_check;
-- alter table public.users
--   add constraint users_account_type_check
--   check (account_type is null or account_type in ('fan', 'artist'));

notify pgrst, 'reload schema';

-- If credit_artist_wallet was overwritten by RECT's label-split version,
-- re-paste Kebu's own wallet SQL from the Kebu chat — do NOT drop the tables.
