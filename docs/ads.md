# Fair ads and Remove Ads (store build)

Chris, 16 Nov 2026: FamiDuel v1 ships with ads (reverses the old "no ads in v1"). The
family-safe setup below was picked on a decision card in the project thread.

## The rules (src/core/adpolicy.ts, tests/adpolicy.test.ts)

- Full-screen interstitials only. No banners, no rewarded ads, no app-open ads.
- An ad can show only when someone leaves a result screen (Rematch, Games, Next game),
  never during a match, an intro or a pause. Nothing ever waits for an ad: if none is
  loaded, the app goes straight on.
- Never in the first session on a phone (`freeLaunches: 1`).
- At most one every 2 finished matches and 3 minutes apart; opening the app counts as the
  last ad, so the first can come 3 minutes in at the earliest.
- Never to unlock a game or a power. Never after Remove Ads.
- Sound is muted while an ad is up.

## AdMob settings (src/engine/ads.ts)

- `tagForChildDirectedTreatment: true`, `tagForUnderAgeOfConsent: true`,
  `maxAdContentRating: General`, and `npa: true` on every request. Because of these the
  UMP/GDPR consent form isn't shown (Google doesn't show it for under-age-tagged requests)
  and there is no App Tracking Transparency prompt (no `NSUserTrackingUsageDescription`).
- Defaults are Google's public test IDs (labelled "Test Ad"): app
  `ca-app-pub-3940256099942544~1458002511` in Info.plist, interstitial
  `ca-app-pub-3940256099942544/4411468910`. `scripts/ios-set-ads.sh <app id> <unit id>`
  writes the real ones (Info.plist and `.env.production`, read by Vite as
  `VITE_ADMOB_INTERSTITIAL_IOS`). Never tap your own real ads.
- `SKAdNetworkItems` holds Google's own ID (cstr6suwn9). Google's quick-start page lists
  more third-party IDs; adding them helps only when advertisers buy install campaigns,
  so it can wait.
- Plugin: `@capacitor-community/admob` 8.x (Swift Package Manager, bundles Google Mobile
  Ads SDK and its privacy manifest).

## Remove Ads (StoreKit via @capgo/native-purchases)

- Non-consumable `famiduel.removeads` ($4.99). Settings > More shows
  "Remove ads · <price>" and "Restore purchase". No in-app parental gate since 20 Nov 2026
  (Games 9+, not the Kids category); Apple's purchase sheet asks for Face ID or a password.
- Owned is cached in the save (`ads.removed`) so an offline phone stays ad-free; at each
  start StoreKit's current entitlements win (a refund brings ads back).

## In a browser

No ads and no purchase rows; the web playable is unchanged (footer still says "no ads").
`?fakeads` swaps in a grey stand-in ad and a purchase that always works; `?fakeads=now`
also drops the waits so an ad comes after one match. `&fakeowned` starts with Remove ads
already bought on this Apple ID (a reinstall: Restore finds it), and `&fakestore` lets the
stand-in store answer at launch (owned removes ads with no tap; not owned, after a refund,
brings them back). e2e/ads.spec.ts walks buying, restoring, nothing to restore and a refund.

## Testing on a Mac

- `bash scripts/ios-ad-selftest.sh` (booted simulator, no taps): plays one bot match in a
  throwaway build and taps Rematch, so the real AdMob test interstitial shows; logs
  `[ad-selftest]` lines and saves screenshots to build/ios/. Passed 17 Nov 2026 on an
  iPhone 17 simulator (Xcode 26.1.1).
- Remove Ads without App Store Connect: open ios/App/App.xcodeproj and press Run. The App
  scheme uses ios/App/Products.storekit (a local test store with `famiduel.removeads`), so
  Settings > More > Remove ads buys for free in the simulator. Debug > StoreKit >
  Manage Transactions deletes the purchase to try Restore.
- The app's own PrivacyInfo.xcprivacy sits beside those of Capacitor and the Google SDKs;
  an unsigned Release archive contains all six.

## Not built (later)

Android (AdMob works the same; needs a Play Billing product), a "Remove ads" nudge on the
result screen, mediation, the extra SKAdNetwork IDs.
