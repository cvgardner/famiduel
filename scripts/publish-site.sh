#!/usr/bin/env bash
# Publish site/ (privacy policy and support page the App Store needs) to the repo's
# gh-pages branch, which GitHub Pages serves at https://cvgardner.github.io/famiduel/.
#
#   npm run site:publish
#
# One-time: GitHub > repo Settings > Pages > Source "Deploy from a branch", branch
# gh-pages, folder / (root). The support email is written in the pages themselves.
set -euo pipefail
cd "$(dirname "$0")/.."

REMOTE="$(git remote get-url origin)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp -R site/. "$TMP/"
touch "$TMP/.nojekyll"

cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name || echo FamiDuel)" \
    -c user.email="$(git -C "$OLDPWD" config user.email || echo noreply@example.com)" \
    commit -q -m "Publish FamiDuel support and privacy pages"
git push -q -f "$REMOTE" gh-pages
echo "Published. In a minute or two: https://cvgardner.github.io/famiduel/privacy.html"
