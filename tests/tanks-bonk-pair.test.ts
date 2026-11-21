import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import type { TankDuel } from '../src/games/tanks/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

const box = (f: Floater) => {
  const w = [...f.str].length * f.size * 0.55;
  return [f.x - w / 2, f.y - f.size * 0.45, f.x + w / 2, f.y + f.size * 0.45];
};

// F361: a bonk pops "BONK!" for each seat (one each side of the tank, rising apart), but each
// seat's word was moved off the tanks on its own, so both could land on one line: the bottom
// seat's "BONK!" and the top seat's upside-down one printed on top of each other (320 px).
describe('Tank Duel: the two seats\' "BONK!" / "POOF!" never sit on each other', () => {
  it('in bot matches with powers, both seats', () => {
    let frames = 0;
    let overlap = 0;
    const pairs: [BotLevel, BotLevel, number][] = [['easy', 'normal', 3], ['hard', 'normal', 0], ['normal', 'normal', 0]];
    for (const [a, b, assist] of pairs) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: a, assist }), player({ bot: b })];
        const fx = new Fx();
        const view = GAMES.tanks.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: TankDuel; update(dt: number, i: Input): void };
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        const g = view.game;
        for (let i = 0; i < 60 * 180 && !g.over; i++) {
          view.update(DT, input);
          fx.update(DT);
          const fl = (fx as unknown as { floaters: Floater[] }).floaters.filter((f) => (f.str === 'BONK!' || f.str === 'POOF!') && f.life >= 0.45);
          const s0 = fl.filter((f) => f.player === 0);
          const s1 = fl.filter((f) => f.player === 1);
          if (s0.length && s1.length) frames++;
          if (s0.some((p) => s1.some((q) => { const A = box(p), B = box(q); return A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]; }))) overlap++;
        }
      }
    }
    console.log(`tanks BONK/POOF pairs: ${overlap}/${frames} readable frames overlapping`);
    expect(frames).toBeGreaterThan(200);
    expect(overlap).toBe(0);
  }, 120_000);
});
