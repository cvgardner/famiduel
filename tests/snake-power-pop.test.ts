import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { RULES, type SnakeDuel } from '../src/games/snake/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F195: a power's name popped at a fixed line (MID ± 70) for both seats, so it printed on a
// snake head in 871 of 14,560 readable frames (6%), right where that player was steering.
describe('Snake: power names start clear of the heads', () => {
  it('in bot matches with every power pair, both seats', () => {
    const list = (powers.games as Record<string, PowerDef[]>).snake;
    let frames = 0;
    let covered = 0;
    const seats = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const a of list) {
        for (const b of list) {
          const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal', power: a }), player({ bot: 'normal', power: b })];
          const fx = new Fx();
          const view = GAMES.snake.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: SnakeDuel; update(dt: number, i: Input): void };
          const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
          const g = view.game;
          for (let i = 0; i < 60 * 200 && !g.done; i++) {
            view.update(DT, input);
            fx.update(DT);
            for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
              if (f.x !== W / 2 || !f.str.endsWith('!') || f.life < 0.45) continue;
              seats.add(f.player);
              frames++;
              const w = ([...f.str].length * f.size * 0.55) / 2;
              const onHead = g.snakes.some((s) => {
                const hx = RULES.ox + s.x * RULES.cell + RULES.cell / 2;
                const hy = RULES.oy + s.y * RULES.cell + RULES.cell / 2;
                return Math.abs(hx - f.x) < w + RULES.cell / 2 && Math.abs(hy - f.y) < f.size * 0.45 + RULES.cell / 2;
              });
              if (onHead) covered++;
            }
          }
        }
      }
    }
    console.log(`snake power names: ${covered}/${frames} readable frames on a head`);
    expect([...seats].sort()).toEqual([0, 1]);
    expect(frames).toBeGreaterThan(1000);
    expect(covered / frames).toBeLessThan(0.01);
  }, 120_000);
});
