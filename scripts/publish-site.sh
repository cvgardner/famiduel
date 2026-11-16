#!/usr/bin/env bash
# Publish site/ (privacy policy and support page the App Store needs) to the repo's
# gh-pages branch, which GitHub Pages serves at https://cvgardner.github.io/famiduel/.
#
#   SUPPORT_EMAIL=you@example.com npm run site:publish
#
# One-time: GitHub > repo Settings > Pages > Source "Deploy from a branch", branch
# gh-pages, folder / (root). The email is filled in only in the published copy.
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -n "${SUPPORT_EMAIL:-}" && "$SUPPORT_EMAIL" == *@* ]] || { echo "Set SUPPORT_EMAIL=you@example.com" >&2; exit 2; }
REMOTE="$(git remote get-url origin)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp -R site/. "$TMP/"
for f in "$TMP"/*.html; do sed "s/SUPPORT_EMAIL/$SUPPORT_EMAIL/g" "$f" >"$f.tmp" && mv "$f.tmp" "$f"; done
touch "$TMP/.nojekyll"

cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name || echo FamiDuel)" \
    -c user.email="$(git -C "$OLDPWD" config user.email || echo noreply@example.com)" \
    commit -q -m "Publish FamiDuel support and privacy pages"
git push -q -f "$REMOTE" gh-pages
echo "Published. In a minute or two: https://cvgardner.github.io/famiduel/privacy.html"
