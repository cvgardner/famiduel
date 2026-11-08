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

// F188: a big hit's "BONK!" / "KA-BOOM!" popped at the impact point ± 30, across both
// wrestlers' faces (bot match, 320x568).
describe('Sumo: BONK! / KA-BOOM! stay off the wrestlers', () => {
  it('in bot matches, both seats, and the two copies keep apart', () => {
    let frames = 0;
    let covered = 0;
    let stacked = 0;
    const seats = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'hard' }), player({ bot: 'normal' })];
      const fx = new Fx();
      const view = GAMES.sumo.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: Sumo; update(dt: number, i: Input): void };
      const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false } as unknown as Input;
      const g = view.game;
      for (let i = 0; i < 60 * 120 && !g.finished; i++) {
        view.update(DT, input);
        fx.update(DT);
        const clash = (fx as unknown as { floaters: Floater[] }).floaters.filter((f) => /^(BONK|KA-BOOM)!$/.test(f.str) && f.life >= 0.45);
        for (const f of clash) {
          seats.add(f.player);
          frames++;
          const w = ([...f.str].length * f.size * 0.55) / 2;
          const hit = ([0, 1] as const).some((q) => {
            const wr = g.wrestlers[q];
            const nx = Math.max(f.x - w, Math.min(f.x + w, wr.x));
            const ny = Math.max(f.y - f.size * 0.45, Math.min(f.y + f.size * 0.45, wr.y));
            return Math.hypot(wr.x - nx, wr.y - ny) < g.radius(q);
          });
          if (hit) covered++;
        }
        const [a, b] = [clash.find((f) => f.player === 0), clash.find((f) => f.player === 1)];
        if (a && b && Math.abs(a.y - b.y) < a.size * 0.9) stacked++;
      }
    }
    console.log(`sumo clash pop: ${covered}/${frames} readable frames touch a wrestler, ${stacked} frames the copies overlap`);
    expect([...seats].sort()).toEqual([0, 1]);
    expect(frames).toBeGreaterThan(100);
    expect(covered / frames).toBeLessThan(0.05);
    expect(stacked).toBe(0);
  });
});
