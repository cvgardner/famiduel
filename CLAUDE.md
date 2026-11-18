# FamiDuel — project context

One-phone, two-player minigame collection for families: the phone lies flat between two
players, each owns the half nearest them. Original game (not a clone of "2 Player Games:
the Challenge"); the plan and market research are in the GameDev project's
`research/two-player-games/` page (https://claude.ai/artifact/5AoH1evQACGevdtM1S3sdw).

## Decisions already made (Oct 2026, Chris)

- **Pitch:** "Classic 2-player games, with super powers." Family edition done properly:
  honest bots, one-gesture controls tested on small phones, correct rules, a handicap so a
  parent and a young kid get close matches, match nights with a family scoreboard.
- **Launch 13:** Minigolf (hero), Air Hockey, Sumo, Ping Pong, Penalty Shootout, Snack Snatch,
  Snake Duel, Quick Draw, Tank Duel, Sea Battle, Four in a Row, Checkers, Chop Chop.
  Free extras: Tic-Tac-Toe, Rock Paper Scissors. First update: mini pool.
  **No chess** (audience is families with small kids). Free to try: minigolf, air hockey, sumo.
- **Monetization:** free with fair ads + one-time $4.99–6.99 remove-ads / unlock-all.
  At most one interstitial between matches, never mid-round or in the first session, never
  to unlock a game. Families-certified ad SDKs, non-personalized for kids, listed in Games 9+
  (not Apple's Kids category), parental gate. Paid installs only after measuring LTV > CPI.
- **Super powers:** energy fills from play; each player picks 1 of 3 per game before the
  match; telegraphed so they can be countered; the trailing / assisted player charges faster.
  Classic-mode toggle. Powers are never sold. Powers live in `content/powers.json`.
- **Sharing (later):** highlight clips, rivalry cards, daily minigolf course with a
  friends-first leaderboard (Game Center / Play Games), Family Wrapped each December.
  NOT "design for being filmed". Sharing sits behind a parental gate; no accounts, no chat,
  names stay on the device.
- **Hidden for now (1 Nov 2026):** Checkers, Four in a Row, Tic-Tac-Toe (board/thought games
  families already own). `"hidden": true` in `content/games.json` removes the home card and
  keeps everything else; delete the flag to bring one back, `/?all` shows all. Focus new
  games and polish on action games; no new board/thought games.
- **Never use** trademarked names (Hungry Hippos, etc.). Don't put the SupaSmak slam in here.

## Tech

- TypeScript + Vite + Canvas 2D web build, one self-contained `dist/index.html`.
  Shareable by link and testable headlessly. Store builds later by wrapping the web build
  (e.g. Capacitor) — engine is not decided, keep `logic.ts` files portable.
- Fixed portrait world of 360 × 640 units (`src/engine/world.ts`), letterboxed.
  Player 0 sits at the bottom, player 1 at the top; player 1's text is rotated 180°.
- Each game = `src/games/<id>/logic.ts` (pure, deterministic rules + honest bot, no DOM)
  and `src/games/<id>/index.ts` (view: input → intents, drawing, sfx/fx). Register it in
  `src/games/registry.ts`. Read `docs/adding-a-game.md` before writing a game.
- Placeholder art is drawn in code; sounds are synthesized (`src/engine/sfx.ts`). No assets.

## Checks (the merge gate)

GitHub Actions does not run on this account (billing is blocked; assume it always is).
The workflow file exists but **`npm run verify` is the merge gate** (see docs/verification.md):
typecheck, unit tests, build, browser e2e, and a real-time "play like a person" pass that
writes screenshots to `playtest-report/`. In the cloud env prefix it with
`PW_CHROMIUM=/opt/pw-browsers/chromium`.

Weekend improvement routine: docs/improvement-loop.md, backlog in docs/backlog.md.
Playable artifact: https://claude.ai/artifact/L57D46DKP6QN7UvoAitWQs — republish from
`npm run build` with dist/index.html's doctype/html/head/body tags and charset/viewport
metas stripped.

Every built game must have: logic tests (bot-vs-bot match finishes, determinism, handicap
knob, each power), and it is covered automatically by the e2e "bot vs bot" test.

## Status (14 Nov 2026)

All 13 launch games plus Tic-Tac-Toe and RPS are playable, each with an honest bot, a
handicap knob and (except Checkers, TTT, RPS) three powers. Since then: Play the bot (solo,
bot words face the person), Bigger text and Little hands settings, menus at 200% text,
light/dark menus, pause with 3-2-1 resume, first-match ghost finger, match nights, the
7-game tournament, and many weekend-loop polish passes (docs/backlog.md has each with its PR).
- 7-game tournament (Chris, 1 Nov 2026): best of 7 across different action/aim games
  (board games stay out), first to 4, a draw adds a game. Rules in `src/core/tournament.ts`,
  saved in the store so a quit game or closed app carries on.
- Retention direction (Chris, 1 Nov 2026): no new minigame every two weeks (bloat). Lean on
  super powers instead: new powers and/or a rotation keep the app fresh (how it rotates is
  not decided).
- Daily minigolf course: on-device only (intro "📅 Today" switch, day's best kept on the phone);
  its share link / leaderboard is not built.
- App Store accessibility labels we can claim and the test behind each:
  docs/accessibility-labels.md (Larger Text needs a setting that reaches 2x: Chris's call).
- Settled (don't reopen without new evidence): Sea Battle's seat bias was noise (2000
  mirrored games, 49-50%); Minigolf's easy bot was made weaker for small kids (+0.8 over par).
- Not built yet: highlight clips, rivalry cards, daily course sharing,
  Family Wrapped, mini pool.

## iOS store build (15 Nov 2026, Chris: "get the app in front of users, not iterate more")

- Capacitor 8 wraps the same web build: `capacitor.config.ts`, `ios/` (Swift Package Manager,
  no CocoaPods). v1 is free with fair ads and a Remove Ads purchase, iPhone-only (TARGETED_DEVICE_FAMILY = 1;
  iPads run the iPhone app), portrait only.
- Native bits live in `src/engine/native.ts` (no-ops in a browser): Taptic haptics from the
  same patterns as `engine/haptics.ts`, and the app's pause event pausing a match.
  `GameViewController` in `ios/App/App/SceneDelegate.swift`: no status bar, edge swipes
  deferred (both short edges are play areas), home indicator auto-hides.
- Confirmed by Chris (18 Nov 2026): bundle ID `com.gardenogames.famiduel` (permanent after the
  first upload; `scripts/ios-set-ids.sh` changes it), App Store name "FamiDuel: 2 Player Games",
  support email durianirl@gardeno-games.com (in `site/`). EU skipped at launch (Chris, 18 Nov
  2026): added later once DSA trader status is verified, no new build needed. Release steps: docs/release-checklist.md; store text and form
  answers: docs/app-store/; support and privacy pages: site/.
- `npm run store:art` redraws the icon and splash; `npm run store:shots` takes App Store
  screenshots (needs a browser, so not in cloud sessions); `npm run ios:release` (Mac only)
  archives and uploads to TestFlight.
- **Ads (Chris, 16 Nov 2026: v1 ships with them):** Google AdMob interstitials, child-directed,
  non-personalized, G-rated, no ATT prompt; only when a result screen is left, never in the
  first session, at most one per 2 matches and 3 min (`src/core/adpolicy.ts`). Remove Ads is a
  $4.99 non-consumable `famiduel.removeads` behind the parental gate. Browsers get no ads
  (`?fakeads` for tests). Details: docs/ads.md. Privacy answers and policy already reflect it.
