# Kebu

Kebu is the site builder on the Alkebulan platform. You do not build label sites inside Rect Sound. You build them with Kebu.

## How we do it

1. **Platform folder:** `alkebulan/` — everything Kebu lives here.
2. **Builder:** `alkebulan/kebu/` — this README and `sites.json`.
3. **A site:** `alkebulan/sites/<name>/` — one Next.js app per brand.
4. **First site:** K-Direction, at `alkebulan/sites/k-direction`. That is the template.

Each site has:

- A public website (home, artists, events, news, contact, careers)
- A Kebu portal at `/portal` (edit artists, events, blog, jobs, inquiries)
- Photos uploaded in the portal
- Event tickets sold on **Joko** (this site never checkouts)
- Its own Vercel project (Root Directory = `alkebulan/sites/<name>`)
- Its own database later (Supabase). Local is Prisma + SQLite.

## Add another site

1. Copy `alkebulan/sites/k-direction` to `alkebulan/sites/<new-name>`.
2. Change the brand in `content/site.ts`, seed data, and `.env`.
3. Add a row to `sites.json`.
4. Run it on a new port. Deploy as a new Vercel project.

## K-Direction (site 1)

```bash
cd alkebulan/sites/k-direction
cp env.example .env
npm install
npm run db:setup
npm run dev
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100) and the portal at [http://127.0.0.1:3100/portal](http://127.0.0.1:3100/portal).

## Cursor / GitHub

Checked `mbayangxo`: **Kebu** and **alkebulan-platform** GitHub repos are not there. **Keit** was renamed to **[JOKO](https://github.com/mbayangxo/JOKO)** (payments). Alkebulan-platform is this `alkebulan/` folder inside Rect.

Do not merge K-Direction into JOKO. When a real Kebu repo URL exists, copy `alkebulan/` to that repo root and open it in a new Cursor project.
