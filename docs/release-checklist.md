# iOS release checklist (v1.0)

Everything here runs on your Mac, in order. Steps 1–3 are once; after that a new build
is `npm run ios:release` (step 8). You already have an Apple Developer account.

Form answers and listing text: `docs/app-store/` (listing.md, app-review-answers.md).

## Decide first

- **Bundle ID.** Placeholder `com.gardenogames.famiduel`. It can never change after the
  first upload, so pick the one you want to keep.
- **App Store name.** Draft: "FamiDuel: 2 Player Games" (docs/app-store/listing.md has options).
  The name must not already be taken on the App Store; App Store Connect tells you in step 4.
- **Support email** for the support and privacy pages (it's shown publicly).
- **EU.** To sell in the EU, Apple needs you to declare "trader" status (Digital Services Act).
  As a trader your address, phone and email are shown on the store page there. If you'd rather
  not yet, untick the EU countries in Pricing and Availability for now.

## 1. Set up the project (once)

```sh
git clone https://github.com/cvgardner/famiduel && cd famiduel   # or git pull
git checkout claude/ios-publishing    # until the PR is merged
npm ci
bash scripts/ios-set-ids.sh com.gardenogames.famiduel YOURTEAMID
```

Team ID: developer.apple.com > Account > Membership details (10 letters and digits).
You need the current Xcode from the Mac App Store, with your Apple ID added in
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

## 3. Create the app in App Store Connect (once)

appstoreconnect.apple.com > **Apps** > **+** > **New App**:
platform iOS, name (from above), primary language English (U.S.), bundle ID (the one
from step 1, in the list after step 2), SKU `famiduel-ios`, Full Access.

Then fill in, from `docs/app-store/`:
- **App Information:** subtitle, category (Games: Family, Sports), content rights, age rating.
- **Pricing and Availability:** Free; countries (see EU above).
- **App Privacy:** "Data Not Collected", and the privacy policy URL from step 4.

## 4. Host the support and privacy pages (once)

The store needs a working support URL and privacy policy URL. They're in `site/`.

```sh
SUPPORT_EMAIL=you@example.com npm run site:publish
```

Then GitHub > famiduel > Settings > Pages > "Deploy from a branch", branch `gh-pages`, `/ (root)`.
After a minute: https://cvgardner.github.io/famiduel/privacy.html and …/support.html.
GitHub Pages builds with GitHub Actions; if the Actions billing block stops it, drag the
`site` folder onto app.netlify.com/drop (replace SUPPORT_EMAIL in the two pages first)
and use those URLs instead.

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

## What was and wasn't tested

Built in a Linux cloud session, so **nothing native has been compiled or run yet**: the
Xcode project, `GameViewController` (portrait, hidden status bar, edge gestures, home
indicator), the Taptic haptics, the app-pause hook, `ios-release.sh` and the screenshot
script are untested until steps 2, 5 and 6. Tested here: typecheck, unit tests (incl. the
haptic mapping and listing lengths), the web build, `cap sync`, and the icon and splash
render. If a step fails, the log it names is the thing to paste back.
