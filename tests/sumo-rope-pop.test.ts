import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import type { Sumo } from '../src/games/sumo/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F181: "Saved by the rope!" popped just inside the rope, and the rope bounces the wrestler
// back in, often straight into the words (seen in the head-start playtest, bottom seat).
describe('Sumo: the rope-save words stay off the wrestlers', () => {
  it('in bot matches with a head start (more rope saves), both seats', () => {
    let frames = 0;
    let covered = 0;
    const seats = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'easy', assist: 3 }), player({ bot: 'normal', assist: 3 })];
      const fx = new Fx();
      const view = GAMES.sumo.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: Sumo; update(dt: number, i: Input): void };
      const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false } as unknown as Input;
      const g = view.game;
      for (let i = 0; i < 60 * 120 && !g.finished; i++) {
        view.update(DT, input);
        fx.update(DT);
        for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
          if (!/rope save!|by the rope!/.test(f.str)) continue;
          // Only while the words are still easy to read (they fade over their last half).
          if (f.life < 0.45) continue;
          seats.add(f.player);
          frames++;
          const w = Math.min(344, [...f.str].length * f.size * 0.55) / 2;
          const hit = ([0, 1] as const).some((q) => {
            const wr = g.wrestlers[q];
            const nx = Math.max(f.x - w, Math.min(f.x + w, wr.x));
            const ny = Math.max(f.y - f.size * 0.45, Math.min(f.y + f.size * 0.45, wr.y));
            return Math.hypot(wr.x - nx, wr.y - ny) < g.radius(q);
          });
          if (hit) covered++;
        }
      }
    }
    console.log(`sumo rope pop: ${covered}/${frames} readable frames touch a wrestler`);
    expect([...seats].sort(), 'both seats were saved by the rope').toEqual([0, 1]);
    expect(frames).toBeGreaterThan(100);
    expect(covered / frames).toBeLessThan(0.05);
  });
});
