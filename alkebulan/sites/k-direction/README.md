# K-Direction

First site built with **Kebu** on the Alkebulan platform. Brand: **K-DIRECTION / K-DIRECTION CORP.** Not Rect Sound.

- Platform: [`../../README.md`](../../README.md)
- How Kebu works: [`../../kebu/README.md`](../../kebu/README.md)

The `/portal` on this site is this brand’s Kebu dashboard.

This copy is **temporary on Rect**. Canonical home: `sites/k-direction` on https://github.com/mbayangxo/Kebu. See [`../../kebu-import/KEBU_IMPORT.md`](../../kebu-import/KEBU_IMPORT.md).

## Direct answers

| Question | Answer |
| --- | --- |
| **Vercel?** | **Yes — after it is on Kebu.** Import the **Kebu** repo. **Root Directory:** `sites/k-direction`. Do not import Rect. |
| **Photos?** | **Yes.** Portal upload on artists, blog posts, and events. |
| **Edit blogs?** | **Yes.** `/portal` → Blog. |
| **Portal?** | **Yes.** `/portal` — add or remove artists and events. |
| **Jobs + resumes?** | **Yes.** Careers apply form. Staff view at `/portal/applications`. |
| **Tickets?** | **Joko only.** People pay on Joko. This site never checkouts. |
| **Kebu?** | This is site #1 on Kebu. Settings/artists can also store a Kebu URL. |
| **Contact?** | Always saved to the portal inbox. |
| **Supabase?** | **Not applied.** Prisma + SQLite locally. SQL draft in `supabase/migrations/`. |

## Run

```bash
cd alkebulan/sites/k-direction
cp env.example .env
npm install
npm run db:setup
npm run dev
```

- Site: [http://127.0.0.1:3100](http://127.0.0.1:3100)
- Portal: [http://127.0.0.1:3100/portal](http://127.0.0.1:3100/portal)
