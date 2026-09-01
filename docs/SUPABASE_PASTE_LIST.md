# Supabase — everything to paste (RECT)

**Important:** Paste **`.sql` files only** into Supabase → SQL Editor → Run.  
**Never paste** `scripts/apply-supabase-sql.mjs` (JavaScript → `syntax error at or near "{"`).

---

## Fresh Supabase (no `public.users` yet)

Run **core** first, then fix-probe, then artist-os:

```bash
npm run db:bundle:core        # → _BUNDLE_core.sql
npm run db:bundle:fix-probe   # → _BUNDLE_fix_probe.sql
npm run db:bundle:artist-os   # → _BUNDLE_artist_os.sql
```

Paste each `_BUNDLE_*.sql` in order → **Run once** per file.

Or one CLI pass with `SUPABASE_DB_URL` in `.env.local`:

```bash
npm run db:apply:core
npm run db:apply:fix-probe
npm run db:apply:artist-os
```

---

## If you already have RECT running (minimum new batch)

**Easiest — one paste each (no CLI):**

```bash
npm run db:bundle:fix-probe    # → supabase/migrations/_BUNDLE_fix_probe.sql
npm run db:bundle:artist-os    # → supabase/migrations/_BUNDLE_artist_os.sql
```

Open each `_BUNDLE_*.sql` in Supabase SQL Editor → paste entire file → **Run once**.

**Or one command** (add `SUPABASE_DB_URL` to `.env.local` first):

```bash
npm run db:apply:fix-probe
npm run db:apply:artist-os
```

---

Individual files (if you prefer):

| # | File | What it enables |
|---|------|-----------------|
| 1 | `20260830_plays_listened_secs.sql` | Completion rate on plays |
| 2 | `20260830_track_lyrics.sql` | Lyrics on tracks |
| 3 | `20260830_monetization_stack.sql` | Wallet ledger, payouts |
| 4 | `20260830_joko_play_pack_payment.sql` | JOKO on play packs |
| 5 | `20260830_artist_merch_store.sql` | Merch store |
| 6 | `20260830_merch_wallet_credit.sql` | Merch → wallet |
| 7 | `20260830_rect_score_music_purchases.sql` | Paid downloads |
| 8 | `20260830_tour_demand_fekk.sql` | Tours / FEKK tickets |
| 9 | `20260830_hardening_monetization.sql` | Monetization fixes |
| 10 | `20260830_play_pack_prices.sql` | Play pack pricing |
| 11 | `20260830_live_rooms.sql` | Live Room |
| 12 | `20260830_live_rooms_hardening.sql` | Live hardening |
| 13 | `20260830_rect_live.sql` | RECT Live |
| 14 | `20260830_discovery_trending.sql` | Discover trending |
| 15 | `20260830_direct_messages.sql` | DMs (optional) |
| 16 | **`20260831_artist_os_delivery_suite.sql`** | DSP delivery tables, `launch_at`, ISRC/UPC, New Wave RPC, tip→wallet |
| 17 | **`20260831_joko_tips.sql`** | JOKO tips (pending → confirm → wallet) |

Optional extras:

- `20260830_tracks_taali_fields.sql` — extra track columns (if not in delivery suite)
- `20260830_users_artist_banner.sql` — artist banner
- `20260830_tracks_editorial_boost.sql` — RECT SCORE editorial

---

## Artist OS quick apply (CLI)

With `SUPABASE_DB_URL` in `.env.local`:

```bash
npm run db:apply:artist-os
```

Or one file:

```bash
npm run db:apply -- 20260831_artist_os_delivery_suite.sql
```

---

## Verify after paste

```bash
node --env-file=.env.local scripts/probe-artist-os.mjs
```

In SQL Editor, run: `supabase/migrations/_probe_missing_aug08_09.sql` — every row should be `ok`.

---

## Full fresh install order

See `supabase/migrations/APPLY_ORDER.md` (items 1–97+).

---

## Taali (separate Supabase project)

Taali uses its **own** Supabase project — not RECT’s database.

Paste from `/workspace/taali/supabase/migrations/` in order:

1. `20260901_001_foundation.sql`
2. `20260901_002_catalog.sql`
3. `20260901_003_rights.sql`
4. `20260901_004_delivery.sql`
5. `20260901_005_api_audit.sql`

Then: `cd taali && npm run probe:taali`

---

## Env vars (RECT → Taali)

On RECT (`.env.local`):

```
TAALI_API_URL=https://your-taali-app.vercel.app
TAALI_API_KEY=your-taali-api-key
TAALI_WEBHOOK_SECRET=shared-secret
```

On Taali:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
TAALI_API_KEY=same-key-rect-uses
```
