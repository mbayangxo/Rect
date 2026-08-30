# K-Direction

First Kebu site on the Alkebulan platform. Brand: **K-DIRECTION / K-DIRECTION CORP.** Not Rect Sound.

This Cursor agent is tied to the Rect GitHub repo. It cannot become a separate Kebu project by itself. Create `github.com/mbayangxo/Kebu`, copy this app there, and open **that** repo in Cursor. See [`../README.md`](../README.md).

## Direct answers

| Question | Answer |
| --- | --- |
| **Vercel?** | **Yes.** Separate Vercel project. **Root Directory:** `alkebulan/k-direction`. Do not use the repo-root `vercel.json` (that deploys Rect Sound). |
| **Photos?** | **Yes.** Portal upload on artists, blog posts, and events. |
| **Edit blogs?** | **Yes.** `/portal` → Blog. |
| **Portal for artists and events?** | **Yes.** `/portal` — add or remove artists and events. |
| **Job applications + resumes?** | **Yes.** Careers apply form. Staff view at `/portal/applications`. Resumes are portal-only. |
| **Tickets?** | **Joko only.** People pay on Joko. K-Direction never checkouts. Settings can store a Joko home URL; each event can store its own Joko listing. Public button: “Buy tickets on Joko.” |
| **Kebu?** | This *is* a Kebu site (first one). Settings and artists can also store a Kebu URL. |
| **Contact form?** | **Always the portal inbox.** Settings: portal / personal email / both. Email send needs a provider on Vercel later. |
| **Supabase migrations?** | **No, not applied.** Prisma + SQLite locally. SQL draft in `supabase/migrations/` for a future Kebu/K-Direction Supabase project. Do not use Rect Sound’s database. |

SQLite on Vercel is ephemeral. Lasting portal data needs Supabase (or other Postgres) plus blob storage later.

## Run locally

```bash
cd alkebulan/k-direction
cp env.example .env
npm install
npm run db:setup
npm run dev
```

- Site: [http://127.0.0.1:3100](http://127.0.0.1:3100)
- Portal: [http://127.0.0.1:3100/portal](http://127.0.0.1:3100/portal) — `PORTAL_PASSWORD` in `.env`

```bash
npm run e2e
```
