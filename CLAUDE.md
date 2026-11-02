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

## Status (30 Oct 2026)

All 13 launch games plus Tic-Tac-Toe and RPS are playable, each with an honest bot, a
handicap knob and (except Checkers, TTT, RPS) three powers. Known follow-ups:
- Sea Battle easy-vs-easy showed a mild seat bias (116/200 for player 1) in sims; unexplained.
- Minigolf easy bot may still be too strong for small kids (2–5 strokes a hole).
- 7-game tournament (Chris, 1 Nov 2026): best of 7 across different action/aim games
  (board games stay out), first to 4, a draw adds a game. Rules in `src/core/tournament.ts`,
  saved in the store so a quit game or closed app carries on.
- Retention direction (Chris, 1 Nov 2026): no new minigame every two weeks (bloat). Lean on
  super powers instead: new powers and/or a rotation keep the app fresh.
- Not built yet: ads / remove-ads unlock, highlight clips, rivalry cards, daily course,
  Family Wrapped, store wrapper (Capacitor), mini pool.
