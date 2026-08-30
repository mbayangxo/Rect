# K-Direction

Standalone public site for **K-Direction**. It does not share code, auth, or data with Rect Sound.

Pages read from a real database. The contact form writes inquiries through `/api/contact` — it is not a mailto stub.

## Run

```bash
cd k-direction
cp env.example .env
npm install
npm run db:setup
npm run dev
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100).

## Vercel

Create a Vercel project whose **Root Directory** is `k-direction` (do not deploy the Rect Sound app at the repo root). Set `DATABASE_URL`. The included `vercel.json` runs Prisma generate, migrate, seed, then `next build`.

Local default is SQLite (`file:./prisma/dev.db`). For production, point `DATABASE_URL` at Postgres/Supabase and switch the Prisma datasource provider to `postgresql`.

## Data

Seed content lives in `content/` and is loaded by `prisma/seed.ts`. Portraits are in `public/artists/`.
