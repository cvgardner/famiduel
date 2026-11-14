import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { H, W } from '../src/engine/world';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { N } from '../src/games/seabattle/logic';
import { SUNK_Y } from '../src/games/seabattle/index';
import { DT, player, power } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; max: number; size: number; player: 0 | 1 };

// Layout in the viewer's frame (src/games/seabattle/index.ts): big grid at GY with cells of C,
// its "Your/Their ships" label and sunk tally on the row under it, the small grid's label at SY - 12.
const C = 27;
const GY = 82;
const SY = 456;
const TALLY: [number, number, number, number] = [0, GY + N * C + 12, W, GY + N * C + 28];
const SMALL_LABEL: [number, number, number, number] = [0, SY - 12 - 7, W / 2, SY - 12 + 7];

const box = (f: Floater): [number, number, number, number] => {
  const y = f.player === 1 ? H - f.y : f.y; // back into the viewer's frame
  const x = f.player === 1 ? W - f.x : f.x;
  const w = Math.min(W - 16, [...f.str].length * f.size * 0.55);
  return [x - w / 2, y - f.size * 0.45, x + w / 2, y + f.size * 0.45];
};
const hit = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

// F253: "<ship> sunk!" started under the board and rose across the "Their ships" tally row
// while still bright, printing over the very ship it named being crossed out (and a sink
// on your own fleet started on the "Your fleet" label). It now starts in the gap between.
describe('Sea Battle: "<ship> sunk!" stays off the fleet tally and the small grid label', () => {
  it('in bot matches with every power', () => {
    let sunk = 0;
    let onTally = 0;
    let onLabel = 0;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const pw of ['radar', 'airstrike', 'mine', null] as const) {
        for (const seed of [1, 2, 3, 4]) {
          const p = pw ? power('seabattle', pw) : null;
          const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: p }), player({ bot: level, power: p })];
          const fx = new Fx();
          let ended = false;
          const view = GAMES.seabattle.create({ seed, rng: makeRng(seed), players, powersOn: !!p, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as { update(dt: number, i: Input): void };
          const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
          const seen = new Set<Floater>();
          for (let i = 0; i < 60 * 600 && !ended; i++) {
            view.update(DT, input);
            fx.update(DT);
            for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
              if (!f.str.endsWith(' sunk!')) continue;
              if (!seen.has(f)) { seen.add(f); sunk++; }
              if (f.life / f.max < 0.3125) continue; // drawn under half alpha from here on
              if (hit(box(f), TALLY)) onTally++;
              if (hit(box(f), SMALL_LABEL)) onLabel++;
            }
          }
          expect(ended).toBe(true);
        }
      }
    }
    console.log(`seabattle sunk pops: ${sunk}, bright frames on the tally ${onTally}, on the small grid label ${onLabel}`);
    expect(sunk).toBeGreaterThan(100);
    // Its whole bright rise (0.62 s at 40 units/s) fits in the gap, whichever sea was hit.
    expect(SUNK_Y - 26 * 0.45 - 0.62 * 40).toBeGreaterThanOrEqual(TALLY[3]);
    expect(SUNK_Y + 26 * 0.45).toBeLessThanOrEqual(SMALL_LABEL[1]);
    expect(onTally).toBe(0);
    expect(onLabel).toBe(0);
  }, 180_000);
});
