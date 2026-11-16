# App Store Connect form answers (v1.0)

Answers for the forms App Store Connect asks before review, for v1 as built: free, with
fair interstitial ads from Google AdMob between matches (docs/ads.md) and one non-consumable
purchase, **Remove Ads** (`famiduel.removeads`). No accounts, no chat, no tracking. The
app's own code still makes no network requests (`grep -rn "fetch(\|XMLHttpRequest\|sendBeacon" src`
finds nothing); the only data that leaves the phone is what the Google Mobile Ads SDK sends.

## App Privacy (App Store Connect > App Privacy)

- **Do you or your third-party partners collect data from this app?** **Yes** (the Google
  Mobile Ads SDK counts, even though we never see the data).
- Tick these data types. For each: **not linked** to the user's identity, **not used for
  tracking**. Purposes as listed.

| Category | Data type | Purposes |
|---|---|---|
| Location | Coarse Location (from the IP address) | Third-Party Advertising, Analytics |
| Identifiers | Device ID (IDFV; the IDFA is unavailable without the tracking prompt) | Third-Party Advertising, Analytics |
| Usage Data | Product Interaction | Third-Party Advertising, Analytics |
| Usage Data | Advertising Data | Third-Party Advertising, Analytics |
| Diagnostics | Crash Data | Third-Party Advertising, Analytics |
| Diagnostics | Performance Data | Third-Party Advertising, Analytics |
| Diagnostics | Other Diagnostic Data | Third-Party Advertising, Analytics |

- Do **not** tick Contact Info, Health, Financial Info (Apple handles the payment), User
  Content, Browsing/Search History, Contacts, Purchases (StoreKit is Apple's, not ours)
  or Sensitive Info.
- Result on the store page: "Data Not Linked to You" with the types above, and no
  "Data Used to Track You" section.
- This follows Google's own "data disclosure" page for the Mobile Ads SDK
  (developers.google.com/admob/ios/privacy/data-disclosure). Glance at that page while
  filling the form in case Google has changed its list since 16 Nov 2026.
- Why "not tracking": every request is child-directed, under the age of consent and
  non-personalized (`src/engine/ads.ts`), and the app has no `NSUserTrackingUsageDescription`,
  so it never shows the App Tracking Transparency prompt and never reads the IDFA.
- The SDK ships its own privacy manifest (PrivacyInfo.xcprivacy), so nothing to add in Xcode.
- Privacy Policy URL: the hosted `site/privacy.html` (see docs/release-checklist.md).

## Age rating (App Information > Age Rating > Edit)

Expected result: **9+**, as planned in CLAUDE.md (Games, not the Kids category).

Step 1, in-app controls and capabilities:

| Question | Answer |
|---|---|
| Parental controls | No |
| Age assurance | No |
| Unrestricted web access | No |
| User-generated content | No (player names stay on the device and nobody else sees them) |
| Messaging and chat | No |
| Advertising | **Yes** (interstitials between matches, family-safe, non-personalized) |
| Social media / social feed | No |

Step 2, content (frequency):

| Content | Answer | Why |
|---|---|---|
| Cartoon or fantasy violence | Infrequent / mild | Tank Duel's cartoon tanks "bonk" each other, Quick Draw is a cartoon cowboy draw, Sumo pushes |
| Realistic violence | None | |
| Prolonged graphic or sadistic violence | None | |
| Profanity or crude humor | None | |
| Mature or suggestive themes | None | |
| Horror or fear themes | None | |
| Medical or treatment information | None | |
| Health or wellness topics | None | |
| Alcohol, tobacco or drug use or references | None | |
| Sexual content or nudity | None | |
| Simulated gambling | None | |
| Gambling (real money) | No | |
| Contests | No | |
| Loot boxes | No | |

Step 3, age categories: **Not Applicable** (not "Made for Kids"). Choosing the Kids category
would bind future ads and purchases to the Kids rules (no third-party ads or analytics);
CLAUDE.md chose Games 9+ instead. Leave "Override to higher age rating" off.

If App Store Connect shows a question not listed here, the honest answer for v1 is almost
always "No"/"None": the app has no accounts, chat, user content or web views of outside
pages. Its only network use is the ads, and its only purchase is Remove Ads.

## Export compliance

Already answered in the build: `ITSAppUsesNonExemptEncryption = false` in
`ios/App/App/Info.plist` (the app uses no encryption beyond what iOS itself provides),
so App Store Connect won't ask on each upload.

## App Review Information (version page > App Review Information)

- **Sign-in required:** No.
- **Contact:** your name, phone and email (Apple only; not shown on the store).
- **Notes** (paste):

  FamiDuel is a two-player game for one phone: lay the phone flat between two people and
  each player uses the half of the screen nearest them. To try it alone, tap "Play the bot"
  at the top of the home screen, pick a game and press Ready. There are no accounts or
  chat; names and scores stay on the device. Ads (Google AdMob, child-directed,
  non-personalized, G-rated) show only between matches: never in the first session, at
  most one every 2 matches and 3 minutes, so to see one, reopen the app and finish two
  matches. The Remove Ads purchase is in Settings > For grown-ups, behind a parental gate
  (a multiplication question written in words); Restore Purchase is next to it.
  The pause button needs a press and hold (so a child's stray tap doesn't pause), and a
  swipe from the top or bottom edge needs a second swipe because both edges are players'
  play areas.

## In-App Purchase (Monetization > In-App Purchases > +)

- Type **Non-Consumable**. Reference name "Remove Ads". Product ID **`famiduel.removeads`**
  (must match `REMOVE_ADS_ID` in src/engine/ads.ts exactly).
- Price: $4.99 tier (CLAUDE.md range $4.99–6.99). Availability: all countries.
- Display name "Remove Ads"; description "No more ads between matches. Every game stays free."
- Review screenshot: Settings > For grown-ups showing the Remove ads row (take it from a
  TestFlight build or `npm run store:shots`'s settings shot).
- Review notes: "Settings > For grown-ups > Remove ads, after the grown-ups question."
- Family Sharing: on is friendly for a family app (optional).
- The first purchase must be submitted **with** the app version: on the version page,
  under In-App Purchases, add Remove Ads before Submit.

## Content rights

"Does your app contain, show, or access third-party content?" **No.** All art is drawn
in code and all sounds are synthesized (CLAUDE.md "Tech"); no trademarked game names.

## Accessibility (optional, App Store accessibility labels)

docs/accessibility-labels.md lists the labels the app can claim and the test behind each.
"Larger Text" still needs a setting that reaches 2x (PR #338).
