-- ============================================================
-- UNDO: Kebu shop SQL accidentally pasted into RECT Supabase
-- Paste in RECT SQL Editor → Run once. Safe to re-run.
--
-- Removes ONLY Kebu shop / email-list / invite objects from
-- APPLY_SHOP_ORDERS-style pastes (022–059).
--
-- DOES NOT drop RECT Artist OS tables (artist_wallets, tracks,
-- plays, live_rooms, rect_labels, DMs, merch, etc.).
--
-- DOES NOT drop Kebu foundation (projects, businesses,
-- business_members, set_updated_at) — those may exist from an
-- earlier mistaken paste. Optional cleanup is commented at the
-- bottom — only uncomment if you are sure RECT never needs them.
-- ============================================================

-- Dependent tables first (CASCADE also covers FKs)
drop table if exists public.shop_messages cascade;
drop table if exists public.shop_message_threads cascade;
drop table if exists public.shop_wishlists cascade;
drop table if exists public.shop_customer_profiles cascade;
drop table if exists public.shop_customers cascade;
drop table if exists public.shop_cart_drafts cascade;
drop table if exists public.shop_order_items cascade;
drop table if exists public.shop_order_counters cascade;

-- Discount ↔ campaign FKs can be circular; drop both
drop table if exists public.shop_discount_codes cascade;
drop table if exists public.business_email_campaign_recipients cascade;
drop table if exists public.business_email_campaigns cascade;
drop table if exists public.business_email_subscribers cascade;

drop table if exists public.shop_orders cascade;
drop table if exists public.project_products cascade;
drop table if exists public.business_invites cascade;

notify pgrst, 'reload schema';

-- Optional: also remove Kebu foundation if it was only created by
-- a mistaken paste into RECT. Uncomment ONLY if these tables are
-- not needed and have no data you care about.
--
-- drop table if exists public.business_members cascade;
-- drop table if exists public.businesses cascade;
-- drop table if exists public.projects cascade;
-- drop function if exists public.set_updated_at();

-- After this runs, paste supabase/migrations/_VERIFY_RECT_CONNECTED.sql
-- and confirm every status = 'ok'.
