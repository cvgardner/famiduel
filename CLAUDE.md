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
The workflow file exists but **local checks are the merge gate**. Before every merge run:

```sh
npm run typecheck && npm test && npm run build
PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e   # cloud env; locally just npm run test:e2e
```

Every built game must have: logic tests (bot-vs-bot match finishes, determinism, handicap
knob, each power), and it is covered automatically by the e2e "bot vs bot" test.
