# Alkebulan sites on Kebu

Kebu is the builder. Alkebulan is the platform name. Brand websites built with Kebu live in `sites/`.

| Site | Path | Notes |
| --- | --- | --- |
| K-Direction | `sites/k-direction` | First site. Label website + portal. Tickets on Joko. |

K-Direction is its own Next.js app. Deploy it as a **separate Vercel project** with Root Directory `sites/k-direction`. Do not replace the Kebu builder at the repo root.

```bash
cd sites/k-direction
cp env.example .env
npm install
npm run db:setup
npm run dev
```
