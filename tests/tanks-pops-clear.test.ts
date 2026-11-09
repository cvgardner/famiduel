import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { RULES, type TankDuel } from '../src/games/tanks/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F205: the hit and power pops printed on a tank: "Oops! Own shot" 624/1,118 readable frames,
// BONK! 57%, power names 16-32%, blocked! 22%, "Bonked!" / "+1" 14-18% (they start where the
// tanks respawn, or where fx.pop stacked them off a clear line). Now every pop starts on a line
// whose rise misses both tanks and where they drive in the next half second: 0-0.3%.
describe('Tank Duel: hit and power pops start clear of the tanks', () => {
  it('in bot matches at every level with powers, both seats', () => {
    const total: Record<string, number> = {};
    const covered: Record<string, number> = {};
    const seats = new Set<number>();
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
            if (f.life < 0.45 || f.str === 'Time!') continue;
            seats.add(f.player);
            total[f.str] = (total[f.str] ?? 0) + 1;
            const w = ([...f.str].length * f.size * 0.55) / 2;
            const hit = g.tanks.some((tk) => {
              const nx = Math.max(f.x - w, Math.min(f.x + w, tk.x));
              const ny = Math.max(f.y - f.size * 0.45, Math.min(f.y + f.size * 0.45, tk.y));
              return Math.hypot(tk.x - nx, tk.y - ny) < RULES.tankR + 8;
            });
            if (hit) covered[f.str] = (covered[f.str] ?? 0) + 1;
          }
        }
      }
    }
    for (const k of Object.keys(total)) console.log(`tanks ${k}: ${covered[k] ?? 0}/${total[k]} readable frames on a tank`);
    expect([...seats].sort()).toEqual([0, 1]);
    for (const k of ['BONK!', 'Bonked!', '+1', 'Oops! Own shot', 'blocked!', '🫧 Shield!', '💣 Mine!', '💫 Bouncing Shot!']) {
      expect(total[k], k).toBeGreaterThan(200);
      expect((covered[k] ?? 0) / total[k], k).toBeLessThan(0.03);
    }
  }, 120_000); // whole bot matches: GitHub CI runs ~3x slower than a laptop
});
