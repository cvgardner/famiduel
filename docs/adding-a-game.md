# Adding a game

Read `src/games/airhockey/` first: it is the reference game. Copy its shape.

## Files

```
src/games/<id>/logic.ts   rules + honest bot. Pure TypeScript: no DOM, no Math.random,
                          no Date. Randomness only from the Rng passed in.
src/games/<id>/index.ts   view: default-exports a GameDef { id, create(ctx) }.
tests/<id>.test.ts        vitest: bot-vs-bot finishes, determinism, handicap, each power.
content/games.json        already has an entry for every planned game (name, how-to, handicap text).
content/powers.json       add "<id>": [3 powers] if the game has powers.
src/games/registry.ts     import the def and add it to GAMES.
```

The `<id>` must match `content/games.json`. Once registered the home screen enables
the card and the e2e "bot vs bot" test starts covering it.

## World and players

- World is 360 × 640 (`W`, `H`, `MID` from `src/engine/world.ts`), portrait, origin top-left.
- **Player 0 is at the bottom**, player 1 at the top. Player 1 sees the screen upside down:
  draw any text or icon for them with `text(g, str, x, y, { player: 1 })` or wrap in
  `facing(g, 1, x, y, () => ...)`. Shared things (a board, a ball) are drawn once.
- Each player's controls live in their own half, ideally near their own edge.
  `input.of(p)` gives fingers that *landed* in p's half (owner is fixed at touch-down).
  `Button` (from `src/engine/widgets.ts`) handles tap / hold for one player's button;
  `PowerButton` draws the energy ring and returns true on the frame the power fires.
  Put a player's power button in a corner of their half (airhockey uses bottom-left for
  player 0 and top-right for player 1) so it never sits under a control.
- The DOM pause button sits at the left edge, vertically centred. Keep that spot clear.
- Desktop keys: `KEYS[p]` in `src/engine/game.ts` (left/right/up/down/action/power).
  Support them where it makes sense; they make local testing easy.

## Logic rules

- One class with `step(dt, intents)` (or a turn-based `apply(move)`), a `winner` field,
  a `score: [number, number]`, and an `events` array refilled each step for the view
  (hits, goals, power fired, win). The view turns events into `ctx.sfx` / `ctx.fx` juice.
- Deterministic: the same seed and the same intents give the same match.
- **Honest bots:** a bot class with `think(game, dt) → intent` (or `chooseMove(game)`).
  Bots obey exactly the same rules and speed caps as people. Skill (`easy | normal | hard`)
  changes only reaction delay, aim noise and look-ahead, never physics or extra info
  (no peeking at hidden ships, no knowing the Quick Draw time in advance).
  hard should beat easy most of the time; a bot-vs-bot match must always end.
- **Handicap:** `players[p].assist` is 0..3. Map it to the game's knob from games.json with
  `lerpAssist(assist, valueAt0, valueAt3)`. Keep it gentle: the better player should still
  usually win at assist 1.
- **Energy and powers** (only if `powersOn` and `players[p].power`): one `Energy` per
  player, `energy.charge(amount, trailing)` on good play (and a bigger charge on conceding),
  `energy.spend(duration)` when fired, `energy.tick(dt)` each step. Effects must be visible
  and counterable (telegraph with a glow / banner). A full bar takes roughly 15–25 s of play.
- Matches should last about 1–3 minutes. Turn-based games: keep a time cap per bot move.
- Call `ctx.end({ winner, score, summary })` exactly once from the view when the logic
  reports a winner. A draw is `winner: null`.

## Look and feel ("polished" bar)

- Clear, high-contrast shapes; each player's things in `ctx.players[p].color`.
- Every action has feedback: a sound (`ctx.sfx.play(...)`), particles (`ctx.fx.burst`),
  a pop-up for each player (`ctx.fx.pop(str, x, y, color, player)`), shake on big moments.
- Show each player's score on their side, readable from their seat.
- Show whose turn it is in turn-based games, in both orientations.
- Test touch targets on a 360-wide world: buttons at least 44 units across.

## Tests

`tests/<id>.test.ts`, using helpers from `tests/helpers.ts`:
1. bot vs bot (normal/normal) on a few seeds always ends with a winner (or legal draw) in a sane time;
2. same seed → same result;
3. hard beats easy most of the time (skip for pure-luck games like RPS);
4. the handicap knob changes what it should;
5. each power does what its description says;
6. rule edge cases (e.g. checkers forced capture, four-in-a-row diagonal win).

Then run all checks (see CLAUDE.md).
