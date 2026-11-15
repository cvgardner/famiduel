# App Store Connect form answers (v1.0)

Answers for the forms App Store Connect asks before review. They hold for v1 as built:
free, no ads, no purchases, no accounts, no network requests (the web build makes none;
`grep -rn "fetch(\|XMLHttpRequest\|sendBeacon" src` finds nothing). **Redo the App
Privacy and age rating answers when ads or the remove-ads purchase ship** (CLAUDE.md
plans both): an ad SDK collects data and changes several answers below.

## App Privacy (App Store Connect > App Privacy)

- **Do you or your third-party partners collect data from this app?** No.
- Result on the store page: **Data Not Collected**.
- Why that's accurate: player names, settings, scores, match-night and tournament progress
  and the daily course best are saved only in the app's on-device storage
  (`src/app/store.ts`, `localStorage`) and never leave the phone. Apple counts data as
  "collected" only when it's sent off the device.
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
| Advertising | No |
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
always "No"/"None": the app has no network, accounts, chat, web views of outside pages,
purchases or ads.

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
  at the top of the home screen, pick a game and press Ready. There
  are no accounts, purchases, ads or network features; all data stays on the device.
  The pause button needs a press and hold (so a child's stray tap doesn't pause), and a
  swipe from the top or bottom edge needs a second swipe because both edges are players'
  play areas.

## Content rights

"Does your app contain, show, or access third-party content?" **No.** All art is drawn
in code and all sounds are synthesized (CLAUDE.md "Tech"); no trademarked game names.

## Accessibility (optional, App Store accessibility labels)

docs/accessibility-labels.md lists the labels the app can claim and the test behind each.
"Larger Text" still needs a setting that reaches 2x (PR #338).
