import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { H, W } from '../src/engine/world';
import { CARD_Y } from '../src/games/chopchop/index';
import type { ChopChop } from '../src/games/chopchop/logic';
import { GAMES } from '../src/games/registry';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F180: a bonk ends the round and its "Bonked!" card comes up at once; the BONK! pop over the
// chopper's head rose into the card's top edge (seen for the top seat in a bot match).
describe('Chop Chop: BONK! stays clear of the round card', () => {
  it('for both seats, for the whole time the pop shows', () => {
    const clashes: string[] = [];
    const seats = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'easy' }), player({ bot: 'easy' })];
      const fx = new Fx();
      const view = GAMES.chopchop.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: ChopChop; update(dt: number, i: Input): void };
      const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false } as unknown as Input;
      for (let i = 0; i < 60 * 120 && !view.game.done; i++) {
        view.update(DT, input);
        fx.update(DT);
        for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
          if (f.str !== 'BONK!') continue;
          seats.add(f.player);
          // Back to the seat's own frame (the top seat is turned).
          const x = f.player === 0 ? f.x : W - f.x;
          const y = f.player === 0 ? f.y : H - f.y;
          const half = ([...f.str].length * f.size * 0.55) / 2;
          const inX = x - half < W / 2 + 130 && W / 2 - 130 < x + half;
          const inY = y - f.size * 0.45 < CARD_Y + 24 && CARD_Y - 24 < y + f.size * 0.45;
          if (inX && inY) clashes.push(`seed ${seed} step ${i} seat ${f.player}: BONK! at y ${y.toFixed(0)} on the card`);
          expect(x - half, 'on screen').toBeGreaterThanOrEqual(0);
          expect(x + half, 'on screen').toBeLessThanOrEqual(W);
        }
      }
    }
    expect([...seats].sort(), 'both seats got bonked').toEqual([0, 1]);
    expect(clashes.slice(0, 5)).toEqual([]);
  });
});
