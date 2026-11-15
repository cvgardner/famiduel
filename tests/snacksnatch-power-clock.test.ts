import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { clockSpots, powerLines } from '../src/games/snacksnatch/index';
import type { SnackSnatch } from '../src/games/snacksnatch/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

/** Half the seconds-left label at its biggest (as the view sizes it). */
const CLOCK_HALF_W = 22;
const CLOCK_HALF_H = 17;

// F272: a power's name pops in two lines just short of the pot (F238) and rises 36 units, right
// through the seconds-left clock beside the pot ("🧲 Magnet" printed on the "18" in a bot match).
// Readable frames on a clock before: Double 1410/1851, Sticky 1372/1922, Magnet 1512/1970 (73-77%).
// The few left (about 1%) are a power used while a crowd of "+N" pops fills every line out to
// the frogs, so fx.pop stacks the name back into the field.
describe('Snack Snatch: power names stay off the seconds-left clock', () => {
  it('in bot matches at every level with powers, both seats', () => {
    const total: Record<string, number> = {};
    const covered: Record<string, number> = {};
    const list = (powers.games as Record<string, PowerDef[]>).snacksnatch;
    const names = new Set(list.flatMap((pw) => powerLines(`${pw.icon} ${pw.name}!`).filter((l): l is string => !!l)));
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: list[seed % list.length] }), player({ bot: level, power: list[(seed + 1) % list.length] })];
        const fx = new Fx();
        const view = GAMES.snacksnatch.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: SnackSnatch; update(dt: number, i: Input): void };
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        const g = view.game;
        for (let i = 0; i < 60 * 120 && !g.finished; i++) {
          view.update(DT, input);
          fx.update(DT);
          if (g.timeLeft <= 0) continue;
          for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
            if (f.life < 0.45 || !names.has(f.str)) continue;
            total[f.str] = (total[f.str] ?? 0) + 1;
            const w = ([...f.str].length * f.size * 0.55) / 2;
            const h = f.size * 0.45;
            const hit = clockSpots().some(([, lx, ly]) => Math.abs(f.x - lx) < w + CLOCK_HALF_W && Math.abs(f.y - ly) < h + CLOCK_HALF_H);
            if (hit) covered[f.str] = (covered[f.str] ?? 0) + 1;
          }
        }
      }
    }
    for (const k of Object.keys(total)) console.log(`snacksnatch ${k}: ${covered[k] ?? 0}/${total[k]} readable frames on the clock`);
    for (const k of names) {
      expect(total[k], k).toBeGreaterThan(100);
      expect((covered[k] ?? 0) / total[k], k).toBeLessThan(0.02);
    }
  }, 120_000); // whole bot matches: GitHub CI runs ~3x slower than a laptop
});
