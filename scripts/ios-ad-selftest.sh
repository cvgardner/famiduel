#!/usr/bin/env bash
# Mac only: show a real AdMob TEST interstitial in the iPhone simulator with no taps.
# Builds a throwaway web build with VITE_AD_SELFTEST=1 (src/app/adselftest.ts), installs it
# on a booted simulator, prints the "[ad-selftest]" log lines and saves screenshots to
# build/ios/. Afterwards it puts the normal web build back into ios/ (npm run ios:sync).
#
#   bash scripts/ios-ad-selftest.sh            # uses the first booted simulator
set -euo pipefail
cd "$(dirname "$0")/.."
UDID=$(xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}' | head -1)
[[ -n "$UDID" ]] || { echo "Boot a simulator first (open -a Simulator)." >&2; exit 2; }
BUNDLE=$(sed -nE "s/.*appId: '([^']+)'.*/\1/p" capacitor.config.ts)
mkdir -p build/ios
VITE_AD_SELFTEST=1 npm run build >/dev/null
npx cap copy ios >/dev/null
(cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator \
  -destination "id=$UDID" -derivedDataPath ../../build/ios/sim CODE_SIGNING_ALLOWED=NO build >../../build/ios/selftest-build.log 2>&1) \
  || { echo "build failed: build/ios/selftest-build.log" >&2; exit 1; }
xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
xcrun simctl install "$UDID" build/ios/sim/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch --console-pty "$UDID" "$BUNDLE" >build/ios/selftest-console.log 2>&1 &
LAUNCH=$!
sleep 25; xcrun simctl io "$UDID" screenshot build/ios/selftest-25s.png >/dev/null
sleep 15; xcrun simctl io "$UDID" screenshot build/ios/selftest-40s.png >/dev/null
kill $LAUNCH 2>/dev/null || true
grep -a "ad-selftest" build/ios/selftest-console.log || { echo "no [ad-selftest] lines; full log: build/ios/selftest-console.log"; tail -40 build/ios/selftest-console.log; }
echo "screenshots: build/ios/selftest-25s.png build/ios/selftest-40s.png"
npm run ios:sync >/dev/null && echo "normal build restored in ios/ (reinstall it to stop the self-test)"
