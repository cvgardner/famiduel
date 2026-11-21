import { afterEach, describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { ARENA, type TankDuel } from '../src/games/tanks/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; max: number; size: number; player: 0 | 1 };

// F381: a hit's "Oops! Own shot" / "Bonked!" / "+1" could end up past the arena's edge, printed
// over that seat's hearts and ammo dots (readable frames outside: Bonked! 1,592 of 4,394, Oops!
// 782 of 1,760, +1 807 of 5,434). Their lines now keep the whole rise inside the arena; what's
// left is where no clear line inside exists and fx.pop stacks the word off it. (BONK!, POOF! and
// clink! are born on a tank, often at the edge, and still may cross it.)
describe('Tank Duel: a hit\'s words stay inside the arena', () => {
  afterEach(() => setTextScale(1));
  // F385: and again with Bigger text, where words are drawn up to 1.2x and need more room.
  for (const scale of [1, BIG_TEXT]) {
    it(`in bot matches at every level with powers${scale === 1 ? '' : ' (Bigger text)'}`, () => {
      setTextScale(scale);
      const total: Record<string, number> = {};
      const out: Record<string, number> = {};
      const list = (powers.games as Record<string, PowerDef[]>).tanks;
      for (const level of ['easy', 'normal', 'hard'] as const) {
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
          const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: list[seed % list.length] }), player({ bot: level, power: list[(seed + 1) % list.length] })];
          const fx = new Fx();
          const view = GAMES.tanks.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: TankDuel; update(dt: number, i: Input): void };
          const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
          const g = view.game;
          for (let i = 0; i < 60 * 180 && !g.over; i++) {
            view.update(DT, input);
            fx.update(DT);
            for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
              if (Math.min(1, (f.life / f.max) * 1.6) < 0.5 || f.str === 'Time!') continue;
              total[f.str] = (total[f.str] ?? 0) + 1;
              const half = scaledSize(f.size) * 0.45;
              if (f.y - half < ARENA.y || f.y + half > ARENA.y + ARENA.h) out[f.str] = (out[f.str] ?? 0) + 1;
            }
          }
        }
      }
      console.log(`tanks: readable pop frames crossing the arena edge ${JSON.stringify(out)} of ${JSON.stringify(total)}`);
      for (const k of ['Bonked!', 'Oops! Own shot', '+1']) {
        expect(total[k], k).toBeGreaterThan(1000);
        expect((out[k] ?? 0) / total[k], k).toBeLessThan(0.05);
      }
    }, 120_000);
  }
});
