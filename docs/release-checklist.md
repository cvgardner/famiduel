# iOS release checklist (v1.0)

Everything here runs on your Mac, in order. Steps 1–3 are once; after that a new build
is `npm run ios:release` (step 8). You already have an Apple Developer account.

Form answers and listing text: `docs/app-store/` (listing.md, app-review-answers.md).

## Decided (18 Nov 2026)

- **Bundle ID:** `com.gardenogames.famiduel`, already set in the project. It can never change
  after the first upload.
- **App Store name:** "FamiDuel: 2 Player Games". It must not already be taken on the App
  Store; App Store Connect tells you in step 3.
- **Support email:** durianirl@gardeno-games.com, shown publicly on the support and privacy
  pages (already written into `site/`).
- **EU: skipped at launch.** v1 goes out everywhere except the 27 EU countries, because
  Apple's trader check (Digital Services Act) can take weeks. The EU is added later without a
  new build: see "Later: add the EU" at the end. FamiDuel earns from ads and Remove Ads, so
  it is a "trader"; if App Store Connect asks for trader status before you can submit, that's
  the honest answer. The contact details show only on EU store pages, so with the EU off
  they're shown nowhere.

## Your accounts: ads and the purchase (once)

These need your logins, so they're yours. Everything else in this file can be run by a
Claude session on your Mac.

1. **Paid Apps agreement.** App Store Connect > Business: accept the Paid Apps agreement and
   add bank and tax details. Without it the Remove Ads purchase can't even be tested.
2. **The Remove Ads product.** After step 3 below creates the app: Monetization >
   In-App Purchases > + > Non-Consumable, product ID `famiduel.removeads`, $4.99
   (docs/app-store/app-review-answers.md has the text).
3. **A sandbox tester.** Users and Access > Sandbox > + (any email you don't use for a real
   Apple ID). On the iPhone: Settings > Developer > Sandbox Apple Account. TestFlight builds
   buy for free with your normal Apple ID, so this is only for Xcode runs.
4. **AdMob.** admob.google.com: sign up (payments profile and tax form), Apps > Add app >
   iOS, "not yet listed" for now (link it to the store listing after release). Then
   Ad units > Add > **Interstitial**. In App settings set **"Child-directed: tag all ad
   requests as child-directed"** if offered, and in Blocking controls > Content leave max
   rating at **G**. Send the app ID (`ca-app-pub-…~…`) and the interstitial unit ID
   (`ca-app-pub-…/…`), or run `bash scripts/ios-set-ads.sh <app id> <unit id>` yourself.
   Until then builds show Google's "Test Ad", which is fine for TestFlight.
5. **app-ads.txt** (after the app is live): AdMob shows one line for it; it must sit at the
   root of your developer website (the Marketing URL's domain). It's optional at launch but
   lifts ad fill.

## 1. Set up the project (once)

```sh
git clone https://github.com/cvgardner/famiduel && cd famiduel   # or git pull
npm ci
```

The bundle ID and your Team ID (`ios/release.env`) are already set. To change either:
`bash scripts/ios-set-ids.sh <bundle id> <team id>`. You need the current Xcode from the Mac App Store, with your Apple ID added in
Xcode > Settings > Accounts.

## 2. Sign once in Xcode and run it on your iPhone

```sh
npm run ios:sync    # builds the web app and copies it into ios/
npm run ios:open    # opens ios/App/App.xcodeproj in Xcode
```

In Xcode: click **App** (top of the left sidebar) > target **App** > **Signing & Capabilities**,
tick "Automatically manage signing" and choose your team. Xcode registers the bundle ID
with Apple here. Wait for "Resolving packages" to finish (first time only).

Plug in your iPhone, pick it at the top of the window and press Run (▶). Check:

- [ ] The icon and the dark launch screen show, then the home screen, with no status bar.
- [ ] The app stays portrait when the phone is turned or lying flat.
- [ ] Sound plays after the first tap; with the ring switch on silent you may hear nothing.
- [ ] Settings shows **Vibration**, and hits, goals and the win buzz (Taptic).
- [ ] Mid-match, swipe home and come back: the match is paused, Resume counts 3-2-1.
- [ ] Swiping up from the bottom edge or down from the top edge during a match plays the
      game; a second swipe is needed to leave the app.
- [ ] Names and a match-night score are still there after force-quitting and reopening.
- [ ] Ads: the first launch shows none. Force-quit, reopen, play two matches (3+ minutes),
      tap Rematch: a Google "Test Ad" interstitial shows, closes with its ✕, and the intro
      follows. No ad ever shows mid-match.
- [ ] Settings > More shows "Remove ads · $4.99" (the price appears only once the
      product exists in App Store Connect) and "Restore purchase"; tapping one goes straight
      to Apple's purchase sheet, with no grown-ups question. Buy with the sandbox tester: "Ads removed" shows and no ad follows.
      Delete and reinstall, tap Restore purchase: "Ads removed" again.

## 3. Create the app in App Store Connect (once)

appstoreconnect.apple.com > **Apps** > **+** > **New App**:
platform iOS, name (from above), primary language English (U.S.), bundle ID (the one
from step 1, in the list after step 2), SKU `famiduel-ios`, Full Access.

Then fill in, from `docs/app-store/`:
- **App Information:** subtitle, category (Games: Family, Sports), content rights, age rating.
- **Pricing and Availability:** Free. Countries: all, then untick the 27 EU countries
  (Austria, Belgium, Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia, Finland, France,
  Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, Netherlands,
  Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden). The UK, Norway, Iceland and
  Switzerland aren't in the EU and stay on.
- **App Privacy:** the data types in app-review-answers.md (from the Google ads SDK), and
  the privacy policy URL from step 4.

## 4. Host the support and privacy pages (once)

The store needs a working support URL and privacy policy URL. They're in `site/`.

```sh
npm run site:publish
```

Then GitHub > famiduel > Settings > Pages > "Deploy from a branch", branch `gh-pages`, `/ (root)`.
After a minute: https://cvgardner.github.io/famiduel/privacy.html and …/support.html.
GitHub Pages builds with GitHub Actions; if the Actions billing block stops it, drag the
`site` folder onto app.netlify.com/drop and use those URLs instead.

## 5. Screenshots

```sh
npx playwright install chromium   # once
npm run store:shots               # writes docs/app-store/screenshots/
```

Look through them, then upload `iphone-6.9/` to the 6.9" slot and `iphone-6.3/` to the
6.3" slot on the version page (App Store Connect scales them for smaller phones).

## 6. Upload a build

```sh
npm run ios:release
```

It builds the web app, syncs it, archives a Release build with a fresh build number,
signs it with your account and uploads it. The first run may ask to let `codesign` use
your keychain: choose "Always Allow". Logs: `build/ios/archive.log`, `build/ios/export.log`.

## 7. TestFlight

App Store Connect > TestFlight. The build appears after processing (usually 5–30 min).
Add yourself (and family) under Internal Testing, install the TestFlight app on the phone
and play a few matches. Redo the step 2 checks on the TestFlight build.

## 8. Submit for review

On the iOS App 1.0 page: paste the listing text, add the screenshots, pick the build,
fill App Review Information (notes in app-review-answers.md, sign-in not required),
choose manual or automatic release, then **Add for Review** > **Submit**.

New builds later: bump `MARKETING_VERSION` (Xcode > target App > General > Version) for
a new store version, then `npm run ios:release` again.

## Later: add the EU

When you're ready to sell in the EU (no new build or version needed):

1. Get an address you're happy to show (a PO box or virtual mailbox works, with a bill or
   receipt that links it to you), a phone number that can receive Apple's code (a virtual
   number is fine) and an email.
2. App Store Connect > Apps > FamiDuel > General > App Compliance > Digital Services Act >
   Edit: choose Trader, enter and verify the details, and upload the document Apple asks
   for. If your developer account is an organization, Apple shows its D-U-N-S address
   instead and you can't swap it.
3. Wait for verification (some developers waited weeks in autumn 2026; Apple Developer
   Support by phone has sped it up).
4. Pricing and Availability: tick the 27 EU countries. It takes effect within a day.

## What was and wasn't tested

Built in a Linux cloud session, so **nothing native has been compiled or run yet**: the
Xcode project, `GameViewController` (portrait, hidden status bar, edge gestures, home
indicator), the Taptic haptics, the app-pause hook, `ios-release.sh` and the screenshot
script are untested until steps 2, 5 and 6. Tested here: typecheck, unit tests (incl. the
haptic mapping and listing lengths), the web build, `cap sync`, and the icon and splash
render. If a step fails, the log it names is the thing to paste back.
