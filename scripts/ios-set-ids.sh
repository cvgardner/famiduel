#!/usr/bin/env bash
# Set the App Store bundle ID (and optionally the Team ID) everywhere it lives.
#
#   bash scripts/ios-set-ids.sh com.yourname.famiduel [TEAMID]
#
# The bundle ID must match the one you pick when you create the app in App Store
# Connect, and it can't change after the first upload.
set -euo pipefail
cd "$(dirname "$0")/.."

ID="${1:-}"
TEAM="${2:-}"
[[ "$ID" =~ ^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ]] || { echo "Usage: $0 com.yourname.famiduel [TEAMID]" >&2; exit 2; }

# sed -i differs between macOS and Linux; write through a temp file instead.
swap() { local f="$1" re="$2"; sed -E "$re" "$f" >"$f.tmp" && mv "$f.tmp" "$f"; }

swap capacitor.config.ts "s/appId: '[^']*'/appId: '$ID'/"
swap ios/App/App.xcodeproj/project.pbxproj "s/PRODUCT_BUNDLE_IDENTIFIER = [^;]*;/PRODUCT_BUNDLE_IDENTIFIER = $ID;/"
if [[ -n "$TEAM" ]]; then
  [[ "$TEAM" =~ ^[A-Z0-9]{10}$ ]] || { echo "A Team ID is 10 letters and digits, like ABCDE12345." >&2; exit 2; }
  swap ios/release.env "s/^TEAM_ID=.*/TEAM_ID=$TEAM/"
fi
echo "Bundle ID: $ID${TEAM:+, Team ID: $TEAM}. Next: npm run ios:sync"
