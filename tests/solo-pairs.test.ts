import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { setReader, soloReader, type G } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { DT, player } from './helpers';

const idle = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0, steering: () => null } as unknown as Input;

/**
 * Plays the bot against a person who never touches the screen, rendering every frame with the
 * solo reader, and returns each line of words (a letter, 5+ characters) that read twice for the
 * person in more than one frame in a row. A single frame is the known lag when the bot's seat
 * draws first (draw.ts can only skip a copy it has already seen).
 */
function doubled(id: string, botSeat: 0 | 1): Record<string, number> {
  const players: [PlayerInfo, PlayerInfo] = botSeat === 1 ? [player({ bot: null }), player({ bot: 'normal' })] : [player({ bot: 'normal' }), player({ bot: null })];
  const fx = new Fx();
  let ended = false;
  const view = GAMES[id].create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as { update(dt: number, i: Input): void; render(g: G): void };
  const { g, words } = recorder();
  // Width from the font size, so fitSize() shrinks long lines like a real canvas does.
  const font = () => parseFloat(String((g as unknown as { font: string }).font).split(' ')[1]) || 20;
  (g as unknown as { measureText: unknown }).measureText = (s: string) => ({ width: [...s].length * font() * 0.55 });
  const sizes: number[] = [];
  const fill = (g as unknown as { fillText: (s: string, x: number, y: number) => void }).fillText;
  (g as unknown as { fillText: unknown }).fillText = (s: string, x: number, y: number) => {
    fill(s, x, y);
    sizes[words.length - 1] = font();
  };
  const run: Record<string, number> = {};
  const worst: Record<string, number> = {};
  for (let i = 0; i < 60 * 90 && !ended; i++) {
    view.update(DT, idle);
    fx.update(DT);
    words.length = 0;
    sizes.length = 0;
    setReader(soloReader([players[0].bot, players[1].bot]), g);
    try {
      view.render(g);
      fx.render(g);
    } finally {
      setReader(null);
    }
    const seen: Record<string, number> = {};
    words.forEach((w, k) => {
      // Keyed by size too: Snake's banner and its corner HUD both say "Round 2", two different labels.
      const key = `${w.str} @${sizes[k]}`;
      if (w.upright === (botSeat === 1) && /\p{L}/u.test(w.str) && [...w.str].length >= 5) seen[key] = (seen[key] ?? 0) + 1;
    });
    for (const s of Object.keys(run)) if ((seen[s] ?? 0) < 2) delete run[s];
    for (const [s, n] of Object.entries(seen)) {
      if (n < 2) continue;
      run[s] = (run[s] ?? 0) + 1;
      if (run[s] > 1) worst[s] = Math.max(worst[s] ?? 0, run[s]);
    }
  }
  return worst;
}

// Each strip is that player's own card (name, status, "Hole | Total"), so the same words on both are fine.
// Two frogs that miss at once each get a "Miss!" (two events, not one line twice).
const PER_CARD: Record<string, RegExp> = { minigolf: /^(Total|Hole \d+ of \d+ · Par \d+|Wait · .* shoots) @/, snacksnatch: /^Miss! @/ };

// F201/F202: playing the bot, its half reads upright for the person, so a line both seats draw
// with the same words read twice: Sumo's long round banner, Ping Pong's "Rally 4" and its paired
// "Curve!"/"Rally x5!" pops, Snack Snatch's "Faster snacks!".
describe('Play the bot: one copy of each paired line', () => {
  for (const id of ['tanks', 'sumo', 'snacksnatch', 'airhockey', 'pingpong', 'snake', 'chopchop', 'penalty', 'quickdraw', 'minigolf', 'seabattle', 'rps']) {
    it(id, () => {
      for (const seat of [0, 1] as const) {
        const d = doubled(id, seat);
        for (const s of Object.keys(d)) if (PER_CARD[id]?.test(s)) delete d[s];
        expect(d, `bot in seat ${seat}`).toEqual({});
      }
    }, 60_000);
  }
});
