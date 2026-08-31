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

K-Direction must live at `sites/k-direction` on **Kebu**, not in this Rect repo. This folder is a temporary holding copy.

**How to send it:** [`kebu-import/KEBU_IMPORT.md`](kebu-import/KEBU_IMPORT.md)

This Rect agent cannot push to Kebu (`cursor[bot]` has no write). After it is on Kebu, delete this copy from Rect. Do not merge this into Rect `main`.
