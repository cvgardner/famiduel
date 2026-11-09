import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { RULES, type SnakeDuel } from '../src/games/snake/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F203: "CRASH!" popped at the crash cell; at a wall (where most crashes happen) crashPopY kept
// it in the arena, which put it straight up the crashed snake's own trail.
// 4,981 of 5,127 readable frames sat on a trail; now ~3.6%.
describe('Snake: CRASH! starts clear of the trails', () => {
  it('in bot matches at every level, both seats', () => {
    let frames = 0;
    let covered = 0;
    const seats = new Set<number>();
    const C = RULES.cell;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: level }), player({ bot: level })];
        const fx = new Fx();
        const view = GAMES.snake.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: SnakeDuel; update(dt: number, i: Input): void };
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        const g = view.game;
        for (let i = 0; i < 60 * 300 && !g.done; i++) {
          view.update(DT, input);
          fx.update(DT);
          for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
            if (f.str !== 'CRASH!' || f.life < 0.45) continue;
            seats.add(f.player);
            frames++;
            const w = ([...f.str].length * f.size * 0.55) / 2;
            let on = false;
            for (let y = 0; y < RULES.rows && !on; y++) {
              for (let x = 0; x < RULES.cols && !on; x++) {
                if (!g.grid[g.idx(x, y)]) continue;
                const px = RULES.ox + x * C + C / 2;
                const py = RULES.oy + y * C + C / 2;
                on = Math.abs(px - f.x) < w + C / 2 && Math.abs(py - f.y) < f.size * 0.45 + C / 2;
              }
            }
            if (on) covered++;
          }
        }
      }
    }
    console.log(`snake CRASH!: ${covered}/${frames} readable frames on a trail`);
    expect([...seats].sort()).toEqual([0, 1]);
    expect(frames).toBeGreaterThan(500);
    expect(covered / frames).toBeLessThan(0.05); // was 97%; the rest likely two pops stacking or a packed arena
  }, 120_000);
});
