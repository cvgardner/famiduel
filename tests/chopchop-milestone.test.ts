import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { H, MID, W } from '../src/engine/world';
import type { ChopChop } from '../src/games/chopchop/logic';
import { GAMES } from '../src/games/registry';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; max: number; size: number; player: 0 | 1 };

// F189: the "10!" / "20!" pop started on the chopper's own "N / 50" count (barY + 40, the count
// sits at barY + 30) and rose over it (seen in a bot match, 320x568).
describe('Chop Chop: the milestone pop stays off the chop count', () => {
  it('for both seats, while the pop is bright', () => {
    const clashes: string[] = [];
    const seen = new Set<number>();
    const countY = MID + 22 + 30;
    for (const seed of [1, 2, 3, 4]) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'hard' }), player({ bot: 'hard' })];
      const fx = new Fx();
      const view = GAMES.chopchop.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: ChopChop; update(dt: number, i: Input): void };
      const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false } as unknown as Input;
      for (let i = 0; i < 60 * 120 && !view.game.done; i++) {
        view.update(DT, input);
        fx.update(DT);
        for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
          if (!/^\d+!$/.test(f.str) || f.max - f.life > 0.55) continue;
          seen.add(f.player);
          const y = f.player === 0 ? f.y : H - f.y; // the seat's own frame
          const x = f.player === 0 ? f.x : W - f.x;
          // The count: 28-unit digits centred at W / 2 (up to "50", ~2 x 17 wide).
          const half = ([...f.str].length * f.size * 0.55) / 2;
          const inX = x - half < W / 2 + 20 && W / 2 - 20 < x + half;
          const inY = y - f.size * 0.45 < countY + 14 && countY - 14 < y + f.size * 0.45;
          if (inX && inY) clashes.push(`seed ${seed} step ${i} seat ${f.player}: ${f.str} at y ${y.toFixed(0)}`);
        }
      }
    }
    expect([...seen].sort(), 'both seats reached a milestone').toEqual([0, 1]);
    expect(clashes.slice(0, 5)).toEqual([]);
  });
});
