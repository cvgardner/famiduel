# FamiDuel

Two players. One phone. Super powers.

A family two-player minigame collection: put the phone flat between you, each player
owns their half of the screen. Honest bots, a handicap that keeps parent-vs-kid matches
close, super powers you pick before each match, and a match-night scoreboard.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173 (also on your LAN, open it on a phone)
npm run build      # one self-contained dist/index.html
```

Desktop keys: player 0 (bottom) arrows + Space (action) + Enter (power);
player 1 (top) WASD + F (action) + E (power). Add `?seed=anything` for a repeatable match.

## Checks

```sh
npm run typecheck
npm test           # rules + bots (vitest)
npm run test:e2e   # every game bot-vs-bot in a real browser (playwright)
```

## Layout

- `content/games.json` — the game list (names, how-to, handicap text)
- `content/powers.json` — super powers per game, and energy rules
- `src/core/` — rng, energy, handicap (pure)
- `src/engine/` — stage, input, drawing, fx, sfx, in-canvas buttons
- `src/app/` — menus, intro / power pick, results, on-device store
- `src/games/<id>/` — one folder per game (`logic.ts` rules + bot, `index.ts` view)
- `docs/adding-a-game.md` — how to add a game
