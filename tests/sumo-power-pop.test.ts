import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import type { Sumo } from '../src/games/sumo/logic';
import { DT, player, power } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F177: a power's name popped at a fixed spot by the near rope, so a wrestler standing there
// (often the one who had just grown) covered the word ("Grow!" under the top wrestler).
describe('Sumo: a power\'s name clears both wrestlers', () => {
  it('for both seats, over several bot matches, for the whole time the pop shows', () => {
    const clashes: string[] = [];
    const seats = new Set<number>();
    let checked = 0;
    let covered = 0;
    const seen = new WeakSet<object>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal', power: power('sumo', 'grow') }), player({ bot: 'normal', power: power('sumo', 'grow') })];
      const sfx = { play() {} } as unknown as Sfx;
      const fx = new Fx();
      const view = GAMES.sumo.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx, fx, end() {} }) as unknown as { game: Sumo; update(dt: number, i: Input): void };
      const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false } as unknown as Input;
      const g = view.game;
      for (let i = 0; i < 60 * 90 && !g.finished; i++) {
        view.update(DT, input);
        fx.update(DT);
        for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
          if (!f.str.endsWith('Grow!')) continue;
          seats.add(f.player);
          checked++;
          const born = !seen.has(f);
          seen.add(f);
          let hit = false;
          const w = Math.min(344, [...f.str].length * f.size * 0.55) / 2;
          for (const q of [0, 1] as const) {
            const wr = g.wrestlers[q];
            const nx = Math.max(f.x - w, Math.min(f.x + w, wr.x));
            const ny = Math.max(f.y - f.size * 0.45, Math.min(f.y + f.size * 0.45, wr.y));
            const gap = Math.hypot(wr.x - nx, wr.y - ny) - g.radius(q);
            if (gap < 0) hit = true;
            if (gap < 0 && born) clashes.push(`seed ${seed} step ${i} seat ${f.player}: pop born ${gap.toFixed(1)} into wrestler ${q}`);
          }
          if (hit) covered++;
        }
      }
    }
    expect([...seats].sort(), 'both seats used Grow').toEqual([0, 1]);
    expect(checked).toBeGreaterThan(0);
    expect(clashes.slice(0, 5), 'a pop starts on a wrestler').toEqual([]);
    // A wrestler can still dash into a word while it floats; that stays rare.
    console.log(`sumo power pop: ${covered}/${checked} frames touch a wrestler`);
    expect(covered / checked).toBeLessThan(0.1);
  });

  it('steps in from the rope spot when a wrestler stands on it (the case seen in a playtest)', () => {
    const players: [PlayerInfo, PlayerInfo] = [player({ power: power('sumo', 'grow') }), player({ power: power('sumo', 'grow') })];
    const view = GAMES.sumo.create({ seed: 1, rng: makeRng(1), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx: new Fx(), end() {} }) as unknown as { game: Sumo; powerPopY(p: 0 | 1, w: string, s: number, grow: boolean): number };
    const g = view.game;
    const word = 'Grow!!!!!!';
    // Both in the middle: the usual spot by each seat's rope.
    g.wrestlers[0].x = g.wrestlers[1].x = 180;
    g.wrestlers[0].y = 340;
    g.wrestlers[1].y = 300;
    expect(view.powerPopY(1, word, 24, true)).toBe(150);
    expect(view.powerPopY(0, word, 24, true)).toBe(490);
    // The top wrestler grew right by the top rope: the word must clear its body (r 36).
    g.wrestlers[1].y = 165;
    for (const p of [0, 1] as const) {
      const y = view.powerPopY(1, word, 24, true);
      const top = Math.min(y, y + 36) - 24 * 0.45;
      const bot = Math.max(y, y + 36) + 24 * 0.45;
      const near = Math.max(top, Math.min(bot, g.wrestlers[p].y));
      expect(Math.abs(g.wrestlers[p].y - near), `top seat's word vs wrestler ${p}`).toBeGreaterThan(p === 1 ? 36 : 25);
    }
  });
});
