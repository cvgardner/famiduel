import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import type { Penalty } from '../src/games/penalty/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

const KICK = ['Your kick!', 'Sudden death! Your kick'];
const SAVE = ['Save it!', 'Sudden death! Save it'];

// F296: both kick-off words rise toward the centre line, and the shooter's "Your kick!" (from
// 66 past the ball) ended its rise on the keeper's "Save it!" (lefty-penalty.png): one seat's
// words printed over the other's. Their boxes now never meet while either is readable.
describe("Penalty: the two seats' kick-off words never meet", () => {
  it('in bot matches at every level with powers, both seats shooting', () => {
    let both = 0;
    let touching = 0;
    const list = (powers.games as Record<string, PowerDef[]>).penalty;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: list[seed % list.length] }), player({ bot: level, power: list[(seed + 1) % list.length] })];
        const fx = new Fx();
        const view = GAMES.penalty.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: Penalty; update(dt: number, i: Input): void };
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        const g = view.game;
        for (let i = 0; i < 60 * 300 && !g.over; i++) {
          view.update(DT, input);
          fx.update(DT);
          const fl = (fx as unknown as { floaters: Floater[] }).floaters.filter((f) => f.life > 0.1);
          const k = fl.find((f) => KICK.includes(f.str));
          const s = fl.find((f) => SAVE.includes(f.str));
          if (!k || !s) continue;
          both++;
          const box = (f: Floater) => ({ w: ([...f.str].length * f.size * 0.55) / 2, h: f.size * 0.45 });
          const a = box(k);
          const b = box(s);
          if (Math.abs(k.x - s.x) < a.w + b.w && Math.abs(k.y - s.y) < a.h + b.h + 2) touching++;
        }
      }
    }
    console.log(`penalty kick-off words: ${touching}/${both} frames touching`);
    expect(both).toBeGreaterThan(500);
    expect(touching).toBe(0);
  }, 120_000);
});
