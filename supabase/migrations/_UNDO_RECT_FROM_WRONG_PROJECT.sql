-- ============================================================
-- UNDO: RECT SQL accidentally pasted into the WRONG Supabase project
-- (e.g. Kebu). Paste this ONLY in that wrong project’s SQL Editor.
--
-- Covers the big RECT paste: labels, wallets, hearing aids/punch,
-- monetization stack, live rooms, DMs, distribution, etc.
--
-- Does NOT drop core tables (users, tracks, plays) wholesale —
-- only RECT-added columns / objects where safe.
--
-- WARNING: If the wrong project already had real data in any of
-- these tables, this deletes that data. Prefer Point-in-Time
-- Recovery / backup restore if this DB matters.
-- Safe-ish to re-run (IF EXISTS / DROP IF EXISTS).
-- ============================================================

-- ── Mangaled paste artifacts ─────────────────────────────────
drop table if exists public.usersqltokebuinsteadofrect cascade;

-- ── Label / wallet (RECT-only) ───────────────────────────────
drop function if exists public.label_wallet_balance_breakdown(uuid);
drop function if exists public.ensure_label_wallet(uuid);
drop function if exists public.create_rect_label(text);

drop table if exists public.label_wallet_ledger cascade;
drop table if exists public.label_wallets cascade;
drop table if exists public.rect_label_memberships cascade;
drop table if exists public.rect_labels cascade;

-- ── Hearing Aids / Punch / behavior ──────────────────────────
drop function if exists public.listener_behavior_affinity(integer);
drop function if exists public.update_play_listened_secs(uuid, integer);
drop policy if exists "plays_update_own_listened_secs" on public.plays;

alter table public.tracks drop column if exists content_kind;
alter table public.tracks drop column if exists punch_status;
alter table public.tracks drop column if exists punch_audio_url;
alter table public.tracks drop column if exists punch_requested_at;
alter table public.tracks drop column if exists punch_ready_at;
alter table public.tracks drop column if exists punch_notes;

-- ── Artist OS monetization tables ────────────────────────────
drop table if exists public.artist_play_earnings cascade;
drop table if exists public.track_download_purchases cascade;
drop table if exists public.artist_joko_payouts cascade;
drop table if exists public.artist_wallet_ledger cascade;
drop table if exists public.artist_wallets cascade;
drop table if exists public.fan_club_members cascade;
drop table if exists public.fan_club_tiers cascade;
drop table if exists public.portal_release_media cascade;
drop table if exists public.portal_releases cascade;
drop table if exists public.fan_chart_entries cascade;
drop table if exists public.fan_charts cascade;
drop table if exists public.merch_purchases cascade;
drop table if exists public.artist_merch_items cascade;
drop table if exists public.tour_ticket_purchases cascade;
drop table if exists public.artist_tour_events cascade;
drop table if exists public.artist_city_requests cascade;

-- ── Live / RECT Live ─────────────────────────────────────────
drop table if exists public.live_room_photos cascade;
drop table if exists public.live_room_messages cascade;
drop table if exists public.live_room_viewers cascade;
drop table if exists public.live_rooms cascade;
drop table if exists public.rect_lives cascade;

-- ── DMs ──────────────────────────────────────────────────────
drop table if exists public.dm_messages cascade;
drop table if exists public.dm_participants cascade;
drop table if exists public.dm_conversations cascade;

-- ── Distribution / Delivery ──────────────────────────────────
drop table if exists public.distribution_delivery_events cascade;
drop table if exists public.distribution_release_tracks cascade;
drop table if exists public.distribution_releases cascade;

-- ── Tracks / plays columns RECT added ────────────────────────
alter table public.tracks drop column if exists download_price_xof;
alter table public.tracks drop column if exists taali_registry_id;
alter table public.tracks drop column if exists isrc_code;
alter table public.tracks drop column if exists writer_splits;
alter table public.tracks drop column if exists master_owner;
alter table public.tracks drop column if exists territory_of_origin;
alter table public.tracks drop column if exists lyrics;
alter table public.tracks drop column if exists launch_at;
alter table public.tracks drop column if exists upc_code;

alter table public.plays drop column if exists listened_secs;

-- play pack / tips extras (ignore if tables missing)
do $$
begin
  if to_regclass('public.play_pack_purchases') is not null then
    alter table public.play_pack_purchases drop column if exists payment_phone;
    alter table public.play_pack_purchases drop column if exists joko_reference;
  end if;
  if to_regclass('public.artist_tips') is not null then
    alter table public.artist_tips drop column if exists joko_reference;
  end if;
  if to_regclass('public.artist_notifications') is not null then
    alter table public.artist_notifications drop column if exists live_room_id;
  end if;
end $$;

-- ── Functions (best-effort; ignore missing) ──────────────────
drop function if exists public.record_play_earning(uuid, uuid, integer);
drop function if exists public.record_play_earning(uuid, bigint, integer);
drop function if exists public.record_credited_play(uuid);
drop function if exists public.record_credited_play(uuid, integer);
drop function if exists public.ensure_artist_wallet(uuid);
drop function if exists public.credit_artist_wallet(uuid, integer, text, text, text);
drop function if exists public.artist_wallet_balance_breakdown(uuid);
drop function if exists public.purchase_track_download(uuid, text, text);
drop function if exists public.confirm_track_download_system(bigint);
drop function if exists public.set_track_download_joko_reference(bigint, text);
drop function if exists public.cancel_track_download_purchase(bigint);
drop function if exists public.subscribe_fan_club_tier(bigint, text, text);
drop function if exists public.confirm_fan_club_member_system(bigint);
drop function if exists public.set_fan_club_joko_reference(bigint, text);
drop function if exists public.cancel_fan_club_subscribe(bigint);
drop function if exists public.request_joko_payout(integer, text);
drop function if exists public.purchase_play_pack(bigint);
drop function if exists public.purchase_play_pack(bigint, text, text);
drop function if exists public.set_play_pack_joko_reference(bigint, text);
drop function if exists public.confirm_play_pack_purchase_system(bigint);
drop function if exists public.purchase_merch_item(bigint, text, text);
drop function if exists public.set_merch_joko_reference(bigint, text);
drop function if exists public.confirm_merch_purchase(bigint);
drop function if exists public.confirm_merch_purchase_system(bigint);
drop function if exists public.cancel_merch_purchase(bigint);
drop function if exists public.request_artist_city(uuid, text, text, text);
drop function if exists public.artist_city_demand(uuid);
drop function if exists public.purchase_tour_ticket(bigint, integer, text);
drop function if exists public.set_tour_ticket_fekk_reference(bigint, text);
drop function if exists public.confirm_tour_ticket_system(bigint);
drop function if exists public.cancel_tour_ticket_purchase(bigint);
drop function if exists public.start_live_room(text, text, text, text, text, text);
drop function if exists public.start_live_room(text, text, text, text, text, text, text, uuid);
drop function if exists public.end_live_room(uuid);
drop function if exists public.join_live_room(uuid);
drop function if exists public.leave_live_room(uuid);
drop function if exists public.send_live_room_message(uuid, text);
drop function if exists public.push_live_room_photo(uuid, text, text);
drop function if exists public.start_rect_live(text, text, text, uuid, text, text);
drop function if exists public.end_rect_live(uuid);
drop function if exists public.trending_tracks(integer);
drop function if exists public.trending_portals(integer);
drop function if exists public.trending_live_rooms_by_place(text, text, text, integer);
drop function if exists public.open_or_get_dm(uuid);
drop function if exists public.send_dm(uuid, text);
drop function if exists public.mark_dm_read(uuid);
drop function if exists public.new_wave_tracks(integer);
drop function if exists public.track_is_publicly_live(text, timestamptz);
drop function if exists public.create_pending_artist_tip(uuid, integer, text, text, text);
drop function if exists public.set_tip_joko_reference(bigint, text);
drop function if exists public.confirm_artist_tip_system(bigint);

-- Trigger must go before the function it calls
drop trigger if exists artist_tips_credit_wallet on public.artist_tips;
drop function if exists public.credit_tip_to_wallet() cascade;

-- ── account_type: remove label if Kebu never wanted it ───────
-- Only if you are SURE Kebu should not have 'label'. Adjust as needed.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'users'
      and constraint_name = 'users_account_type_check'
  ) then
    alter table public.users drop constraint users_account_type_check;
    -- Restore fan/artist only (common pre-RECT). Change if Kebu differed.
    alter table public.users
      add constraint users_account_type_check
      check (account_type is null or account_type in ('fan', 'artist'));
  end if;
exception when others then
  raise notice 'account_type check restore skipped: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';

-- Done. Then on RECT only, re-run the clean pastes:
--   1) _PASTE_LABELS_THEN_WALLETS.sql
--   2) any other RECT migrations you still need
-- Do NOT paste into Kebu again.
