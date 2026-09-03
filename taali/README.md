# Taali

**Taali** is the distribution rail for **RECT**. Artists upload once on RECT; RECT hands releases to Taali for metadata validation and DSP delivery.

| | RECT | Taali |
|---|---|---|
| **Role** | Fan platform — plays, charts, artist OS | Distribution — catalog intake, validation, DSP delivery |
| **Database** | RECT Supabase project | **Separate** Taali Supabase project |
| **Users** | Fans & artists | Operators & RECT API (Phase 1) |

## Phase 1 scope

- REST API under `/api/v1/*` (API key auth)
- Dashboard for release overview, manual intake, and delivery status
- Honest `not_configured` states when DSP providers are not wired yet

## Setup

1. Create a **dedicated Supabase project** for Taali (do not reuse RECT’s DB).
2. Copy `.env.example` → `.env.local` and fill in Supabase + `TAALI_API_KEY`.
3. Apply migrations from `supabase/migrations/` in order (see `APPLY_ORDER.md`):

   ```bash
   npm run db:apply:all
   # or paste each .sql file in Supabase SQL Editor
   ```

4. Verify:

   ```bash
   npm run probe:taali
   ```

5. Run the app:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) for the landing page and `/dashboard` for the operator UI.

## RECT → Taali handoff

On **RECT** (`.env.local`):

```env
TAALI_API_URL=https://your-taali-app.vercel.app/api
TAALI_API_KEY=your-taali-api-key
TAALI_WEBHOOK_SECRET=shared-secret
```

On **Taali**:

```env
TAALI_API_KEY=your-taali-api-key   # same value RECT sends as Bearer token
```

RECT calls `POST /api/v1/releases` to create a package, then `POST /api/v1/releases/:id/validate` and `POST /api/v1/releases/:id/submit` to queue delivery.

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check (no auth) |
| GET | `/api/v1/releases` | List releases |
| POST | `/api/v1/releases` | Create release |
| GET | `/api/v1/releases/:id` | Get release + tracks |
| POST | `/api/v1/releases/:id/validate` | Run metadata validation |
| POST | `/api/v1/releases/:id/submit` | Queue delivery `{ provider_id, destinations[] }` |
| GET | `/api/v1/deliveries?organization_id=` | List deliveries for org |

All v1 routes except health require `Authorization: Bearer <TAALI_API_KEY>`.

## Scripts

| Script | Command |
|--------|---------|
| Apply one migration | `npm run db:apply -- 20260901_001_foundation.sql` |
| Apply all migrations | `npm run db:apply:all` |
| Probe Supabase + env | `npm run probe:taali` |
