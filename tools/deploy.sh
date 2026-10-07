#!/usr/bin/env bash
# Put The Toolbox live on Cloudflare Pages: https://thetoolbox.pages.dev
# Uses CLOUDFLARE_API_TOKEN from ~/.claude/.env (or an existing `npx wrangler login`).
# Only the website goes up — tests, screenshots, docs and the dev server stay behind.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f "$HOME/.claude/.env" ]]; then set -a; source "$HOME/.claude/.env"; set +a; fi

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp -R index.html style.css manifest.webmanifest sw.js js css vendor fonts icons "$STAGE/"
node tools/stamp-sw.mjs "$STAGE"

# The project was created on classic Pages (--force, once, on 2026-10-07), so
# wrangler deploys to it directly and the link stays thetoolbox.pages.dev.
npx --yes wrangler@latest pages deploy "$STAGE" \
  --project-name thetoolbox --branch main --commit-dirty=true
