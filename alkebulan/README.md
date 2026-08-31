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

## GitHub (31 Aug 2026)

**https://github.com/mbayangxo/Kebu is public.** It is the real Alkebulan platform (the repo used to be Alkebulan-platform; `package.json` name is still `alkebulan`). It already has the website builder (`/create`, `/sites/{subdomain}`).

This Rect agent can **read** Kebu but **cannot push** to it. To put K-Direction on Kebu, start a **new Cursor Cloud Agent on the Kebu repo** and tell it:

- Copy `alkebulan/sites/k-direction` from Rect branch `cursor/k-direction-label-site-c1e4`
- Keep it as the first Alkebulan site; do not overwrite the Kebu builder

Do not merge the label site into JOKO.
