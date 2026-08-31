# Alkebulan

Platform folder. **Kebu** is the site builder. **Sites** built with Kebu live under `sites/`. This is not Rect Sound.

```
alkebulan/
  kebu/                 ← Kebu (how we build sites)
  sites/
    k-direction/        ← first site built with Kebu
```

| Piece | Path | Role |
| --- | --- | --- |
| Kebu | `alkebulan/kebu` | Site builder. Register sites, follow the how-to. |
| K-Direction | `alkebulan/sites/k-direction` | First Kebu site. Label website + portal. Tickets on Joko. |

How to add the next site: [`kebu/README.md`](kebu/README.md).

## GitHub merge

**Alkebulan-platform and Kebu are already one GitHub repo.** https://github.com/mbayangxo/Alkebulan-platform redirects to https://github.com/mbayangxo/Kebu.

K-Direction is ready to live at `sites/k-direction` on Kebu. This Rect agent prepared that merge but **cannot push** (`cursor[bot]` has no write access to Kebu).

Grant Cursor write access to Kebu: GitHub → Settings → Applications → Cursor → Configure → add **Kebu**. Then start a Cloud Agent **on the Kebu repo** and tell it to add `sites/k-direction` from Rect branch `cursor/k-direction-label-site-c1e4`.
