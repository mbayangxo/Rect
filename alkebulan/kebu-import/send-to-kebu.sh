#!/usr/bin/env bash
# Copy K-Direction from this Rect checkout into a local Kebu clone and push a branch.
# Requires: git push access to https://github.com/mbayangxo/Kebu
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SITE_SRC="$ROOT/alkebulan/sites/k-direction"
ROOT_FILES="$ROOT/alkebulan/kebu-import/kebu-root-files"
KEBU_DIR="${1:-}"

if [[ ! -d "$SITE_SRC/app" ]]; then
  echo "K-Direction source not found at $SITE_SRC" >&2
  exit 1
fi

if [[ -z "$KEBU_DIR" ]]; then
  KEBU_DIR="$(mktemp -d /tmp/kebu-send-XXXXXX)"
  if [[ -n "${KEBU_PUSH_TOKEN:-}" ]]; then
    git clone "https://x-access-token:${KEBU_PUSH_TOKEN}@github.com/mbayangxo/Kebu.git" "$KEBU_DIR"
  else
    git clone https://github.com/mbayangxo/Kebu.git "$KEBU_DIR"
  fi
  CLEANUP=1
else
  CLEANUP=0
fi

cd "$KEBU_DIR"
git config user.name "K-Direction transfer"
git config user.email "goldendaffodilxo@gmail.com"
git fetch origin
git checkout -B cursor/k-direction-first-site-c1e4 origin/main

rm -rf sites/k-direction
mkdir -p sites docs
cp -a "$SITE_SRC/." sites/k-direction/
cp -a "$ROOT_FILES/sites.json" sites.json
cp -a "$ROOT_FILES/docs/." docs/

# Point the site README at Kebu paths (not Rect's alkebulan/ folder)
cat > sites/k-direction/README.md <<'EOF'
# K-Direction

First site on **Kebu / Alkebulan**. Brand: **K-DIRECTION / K-DIRECTION CORP.**

This app lives in the Kebu repo at `sites/k-direction`. The builder stays at the repo root. Tickets are sold on **Joko**.

## Run

```bash
cd sites/k-direction
cp env.example .env
npm install
npm run db:setup
npm run dev
```

- Site: http://127.0.0.1:3100
- Portal: http://127.0.0.1:3100/portal

Vercel: separate project, Root Directory `sites/k-direction`.
EOF

if [[ -f README.md ]] && ! grep -q "sites/k-direction" README.md; then
  {
    echo "# Kebu (Alkebulan platform)"
    echo
    echo "African Cloud — website builder, business identity, and hosted sites."
    echo
    echo "- **This repo** used to be named Alkebulan-platform. Same code, new name: https://github.com/mbayangxo/Kebu"
    echo "- **Builder:** this Next.js app at the repo root (\`npm run dev\`)"
    echo "- **First brand site:** [sites/k-direction](sites/k-direction) — K-DIRECTION. Tickets on Joko. See [docs/ALKEBULAN-SITES.md](docs/ALKEBULAN-SITES.md) and [docs/WHICH-PROJECT.md](docs/WHICH-PROJECT.md)"
    echo
    echo "---"
    echo
    cat README.md
  } > README.md.next
  mv README.md.next README.md
fi

git add sites sites.json docs README.md
git status
git commit -m "Add K-Direction as the first Kebu site."
git push -u origin cursor/k-direction-first-site-c1e4

echo
echo "Pushed Kebu branch cursor/k-direction-first-site-c1e4"
echo "Open a PR on https://github.com/mbayangxo/Kebu"

if [[ "$CLEANUP" -eq 1 ]]; then
  echo "Clone left at $KEBU_DIR"
fi
