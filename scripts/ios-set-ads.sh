#!/usr/bin/env bash
# Swap Google's test AdMob IDs for the real ones from your AdMob account.
#
#   bash scripts/ios-set-ads.sh ca-app-pub-1234567890123456~1234567890 ca-app-pub-1234567890123456/1234567890
#
# First argument: the AdMob APP ID (has a "~"). Second: the INTERSTITIAL ad unit ID (has a "/").
# Both are in AdMob > Apps > FamiDuel (iOS) > App settings / Ad units. They are not secrets.
# Until you run this, builds show Google's labelled "Test Ad", which is safe to tap.
set -euo pipefail
cd "$(dirname "$0")/.."

APP="${1:-}"
UNIT="${2:-}"
[[ "$APP" =~ ^ca-app-pub-[0-9]{16}~[0-9]{10}$ ]] || { echo "Usage: $0 <app id ca-app-pub-...~...> <interstitial unit ca-app-pub-.../...>" >&2; exit 2; }
[[ "$UNIT" =~ ^ca-app-pub-[0-9]{16}/[0-9]{10}$ ]] || { echo "The interstitial unit ID looks like ca-app-pub-1234567890123456/1234567890" >&2; exit 2; }

swap() { local f="$1" re="$2"; sed -E "$re" "$f" >"$f.tmp" && mv "$f.tmp" "$f"; }
swap ios/App/App/Info.plist "s#ca-app-pub-[0-9]+~[0-9]+#$APP#"
# Vite reads .env.production at `npm run build` (engine/ads.ts AD_UNIT_IOS).
grep -v '^VITE_ADMOB_INTERSTITIAL_IOS=' .env.production 2>/dev/null >.env.production.tmp || true
echo "VITE_ADMOB_INTERSTITIAL_IOS=$UNIT" >>.env.production.tmp
mv .env.production.tmp .env.production
echo "AdMob app $APP, interstitial $UNIT. Next: npm run ios:sync (commit Info.plist and .env.production)."
