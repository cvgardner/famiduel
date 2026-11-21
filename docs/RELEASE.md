# Release guide (for Claude Code on Chris's Mac)

When Chris says "ship a new build", "publish the site" or "redo the screenshots", follow
this file. It runs on his Mac (Xcode is needed; nothing here works in a Linux cloud
session). The once-only setup and the App Store Connect form answers are in
docs/release-checklist.md and docs/app-store/.

Facts: bundle ID `com.gardenogames.famiduel`, App Store name "FamiDuel: 2 Player Games",
Team ID in `ios/release.env`. EU is skipped at launch. Apple requires the Xcode 27 SDK for
uploads from April 2027. GitHub Actions failures are a billing block: ignore them.

## Ground rules

1. **Start from a fresh main, every time, before any build or publish.**
   ```sh
   git checkout main && git pull --ff-only && npm ci
   ```
   Stop if `git status` shows local changes or the pull fails, and tell Chris. A publish from
   a stale checkout once put old wording back on the live support site (19 Nov 2026).
2. **Ask Chris first** (one line, then wait for his yes) before: pushing to main, merging a
   PR, `npm run site:publish`, `npm run ios:release` (uploads), changing the version number,
   or anything else that can't be undone. Work on a branch with a PR for code changes.
3. **Never handle Apple secrets.** Don't type, read, print or store his Apple ID password,
   2FA codes, signing certificates or App Store Connect API keys (`ASC_KEY_*`). If Xcode or
   the keychain asks for one, stop and let Chris answer the prompt himself.
4. When a command fails, show the last lines of the log it names and stop. Don't retry with
   different flags or skip checks to get it green.

## Ship a new build

1. Fresh main (rule 1).
2. Check it:
   ```sh
   npx playwright install chromium   # first time on this Mac
   npm run verify
   ```
   All five steps must pass (typecheck, unit tests, build, e2e, playtest). Glance at
   `playtest-report/index.html` if anything visual changed.
3. Version. Each upload gets a fresh build number automatically (UTC date and time), so
   nothing to bump for another build of the same version. For a **new store version**
   (after 1.0.0 is released), ask Chris which number, then:
   ```sh
   sed -i '' 's/MARKETING_VERSION = 1.0.0;/MARKETING_VERSION = 1.0.1;/' ios/App/App.xcodeproj/project.pbxproj
   ```
   (both Debug and Release lines change), commit it on a branch and open a PR.
4. Ask Chris, then upload:
   ```sh
   npm run ios:release
   ```
   It builds the web app, runs `cap sync`, archives Release, signs with his Xcode account
   and uploads to App Store Connect. Logs: `build/ios/archive.log`, `build/ios/export.log`.
   `npm run ios:release -- --no-upload` makes an .ipa only, with no upload.
5. Tell Chris the version and build number it printed, and that it shows in App Store
   Connect > TestFlight after processing (usually 5–30 min). Then hand over (see below).

Optional Mac checks: `bash scripts/ios-ad-selftest.sh` shows a test ad in a booted
simulator and saves screenshots to `build/ios/`.

## Store screenshots

```sh
git checkout main && git pull --ff-only
npm run store:shots
```

Writes `docs/app-store/screenshots/iphone-6.9/` and `iphone-6.3/`. Show Chris where they
are; uploading them in App Store Connect is his step.

## Support and privacy site

```sh
git checkout main && git pull --ff-only
npm run site:publish        # ask Chris first: it force-pushes site/ to gh-pages
```

Then confirm the live pages match main (allow a minute or two for GitHub Pages):

```sh
for p in index support privacy; do
  curl -fsS "https://cvgardner.github.io/famiduel/$p.html" | diff -q - "site/$p.html" >/dev/null \
    && echo "$p: live matches main" || echo "$p: DIFFERENT, check again in a minute"
done
```

## Chris's steps in App Store Connect

Stop and tell Chris when the flow reaches any of these. They need his login or are his call:

- Agreements, tax and banking (Business), and AdMob or Apple account settings.
- TestFlight: adding testers and trying the build on his phone.
- The version page: listing text, screenshots, App Review notes, age rating, privacy
  answers, pricing and countries (copy from docs/app-store/).
- Picking the build for the version.
- Add for Review > Submit, and answering Apple if they reply or reject.
- Releasing (manual release) once approved.
- Later: EU trader status and ticking the EU countries (docs/release-checklist.md, "Later:
  add the EU").
