# Put K-Direction on Kebu (then delete it from Rect)

K-Direction does **not** belong in the Rect Sound GitHub. It belongs in **Kebu**.

This Rect agent **cannot push to Kebu**. Cursor only has this workspace:

- Allowed: https://github.com/mbayangxo/Rect
- Blocked: https://github.com/mbayangxo/Kebu (GitHub App has no write)

Until K-Direction is in the Kebu repo, Vercel will not show it when you import **Kebu**. Importing **Rect** would put the label site on the wrong product.

## What you will see on Vercel after it is on Kebu

1. [vercel.com/new](https://vercel.com/new)
2. Import **Kebu** (not Rect, not Joko)
3. **Root Directory:** `sites/k-direction`
4. Env: `PORTAL_PASSWORD`, `PORTAL_SECRET`, `DATABASE_URL`

## Way A — best: let Cursor copy it (one checkbox)

1. GitHub → **Settings** → **Applications** → **Cursor GitHub App** → **Configure**
2. Grant access to **Kebu** (or All repositories) with **write**
3. Start a **new** Cloud Agent **on the Kebu repo** (not this Rect chat)
4. Tell it: copy `sites/k-direction` from Rect branch `cursor/k-direction-kebu-export-c1e4` into Kebu at `sites/k-direction`. Do not overwrite the Kebu builder (`app/`, root `package.json`).
5. After that Kebu PR is on GitHub, say so in the Rect chat. Then this agent will **delete** K-Direction off Rect and close the Rect PR.

## Way B — send it with a GitHub Action

1. Create a GitHub token that can **write** to `mbayangxo/Kebu`
2. Rect repo → Settings → Secrets → Actions → add `KEBU_PUSH_TOKEN`
3. Actions → **Send K-Direction to Kebu** → Run workflow (branch `cursor/k-direction-label-site-c1e4`)

## Way C — upload the zip yourself (no Cursor needed)

1. Download: https://github.com/mbayangxo/Rect/archive/refs/heads/cursor/k-direction-kebu-export-c1e4.zip
2. Unzip. You should see `package.json`, `app/`, `prisma/`, etc. (the site, not Rect Sound)
3. Open https://github.com/mbayangxo/Kebu
4. Create folder `sites/k-direction` and upload those files
5. Also add `sites.json` from `alkebulan/kebu-import/kebu-root-files/` on this branch

Or on a computer that can push to Kebu:

```bash
git clone https://github.com/mbayangxo/Kebu.git
cd Kebu
git checkout -b cursor/k-direction-first-site-c1e4
git subtree add --prefix=sites/k-direction \
  https://github.com/mbayangxo/Rect.git cursor/k-direction-kebu-export-c1e4
# then copy alkebulan/kebu-import/kebu-root-files/* into this repo
git add sites sites.json docs README.md
git commit -m "Add K-Direction as the first Kebu site."
git push -u origin cursor/k-direction-first-site-c1e4
```

Do **not** merge the Rect K-Direction PR into Rect `main`. That would keep the label site on the wrong GitHub.
