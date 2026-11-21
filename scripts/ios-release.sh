#!/usr/bin/env bash
# Build FamiDuel for iOS and upload it to App Store Connect (TestFlight), in one command.
#
#   npm run ios:release              archive, sign and upload
#   npm run ios:release -- --no-upload   archive and export an .ipa only (build/ios/export)
#
# Needs: a Mac with Xcode, `npm ci` done, and your Apple ID added in
# Xcode > Settings > Accounts (it signs and uploads with that account).
# Set your Team ID once in ios/release.env. See docs/release-checklist.md.
#
# Optional: upload with an App Store Connect API key instead of the Xcode account by
# setting ASC_KEY_PATH (the .p8 file), ASC_KEY_ID and ASC_ISSUER_ID.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
OUT="$ROOT/build/ios"
PROJECT="$ROOT/ios/App/App.xcodeproj"

UPLOAD=1
for arg in "$@"; do
  case "$arg" in
    --no-upload) UPLOAD=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

fail() { echo "✗ $*" >&2; exit 1; }

[[ "$(uname)" == "Darwin" ]] || fail "This runs on a Mac (it needs Xcode)."
command -v xcodebuild >/dev/null || fail "xcodebuild not found. Install Xcode, then run: sudo xcode-select -s /Applications/Xcode.app"

# shellcheck disable=SC1091
[[ -f ios/release.env ]] && source ios/release.env
TEAM_ID="${TEAM_ID:-}"
[[ -n "$TEAM_ID" && "$TEAM_ID" != "YOUR_TEAM_ID" ]] ||
  fail "Set TEAM_ID in ios/release.env (developer.apple.com > Account > Membership details > Team ID)."

BUNDLE_ID="$(grep -m1 'PRODUCT_BUNDLE_IDENTIFIER' "$PROJECT/project.pbxproj" | sed -E 's/.*= *"?([^";]+)"?;.*/\1/')"
VERSION="$(grep -m1 'MARKETING_VERSION' "$PROJECT/project.pbxproj" | sed -E 's/.*= *([^;]+);.*/\1/')"
# A new build number every run (App Store Connect refuses a repeat): UTC date and time.
BUILD="$(date -u +%Y%m%d%H%M)"

echo "→ FamiDuel $VERSION ($BUILD), bundle $BUNDLE_ID, team $TEAM_ID"

echo "→ Building the web app and copying it into the iOS project"
npm run build
npx cap sync ios

AUTH=()
if [[ -n "${ASC_KEY_PATH:-}" ]]; then
  AUTH=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi

rm -rf "$OUT"
mkdir -p "$OUT"

echo "→ Archiving (Release)"
xcodebuild \
  -project "$PROJECT" \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$OUT/FamiDuel.xcarchive" \
  -allowProvisioningUpdates ${AUTH[@]+"${AUTH[@]}"} \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  CURRENT_PROJECT_VERSION="$BUILD" \
  archive | tee "$OUT/archive.log" | grep -E '^(\*\*|error|warning: .*sign)' || true
[[ -d "$OUT/FamiDuel.xcarchive" ]] || fail "Archive failed. Full log: build/ios/archive.log"

DESTINATION=export
[[ $UPLOAD == 1 ]] && DESTINATION=upload
cat >"$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$DESTINATION</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>testFlightInternalTestingOnly</key><false/>
</dict>
</plist>
PLIST

if [[ $UPLOAD == 1 ]]; then echo "→ Signing and uploading to App Store Connect"; else echo "→ Signing and exporting the .ipa"; fi
xcodebuild -exportArchive \
  -archivePath "$OUT/FamiDuel.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/export" \
  -allowProvisioningUpdates ${AUTH[@]+"${AUTH[@]}"} | tee "$OUT/export.log" | grep -E '^(\*\*|error)' || true
grep -q 'EXPORT SUCCEEDED' "$OUT/export.log" || fail "Export/upload failed. Full log: build/ios/export.log"

if [[ $UPLOAD == 1 ]]; then
  echo "✓ Uploaded FamiDuel $VERSION ($BUILD). It shows in App Store Connect > TestFlight after processing (usually 5–30 min)."
else
  echo "✓ Exported: build/ios/export/App.ipa"
fi
