import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { RULES, type TankDuel } from '../src/games/tanks/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F192: two shells meeting popped "clink!" for each seat at the clash ± 13, and shells often
// meet right at a muzzle, so the word printed on that tank (bot match, 320x568).
describe('Tank Duel: "clink!" stays off the tanks', () => {
  it('in bot matches, both seats', () => {
    let frames = 0;
    let covered = 0;
    const seats = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'hard' }), player({ bot: 'normal' })];
      const fx = new Fx();
      const view = GAMES.tanks.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: TankDuel; update(dt: number, i: Input): void };
      const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
      const g = view.game;
      for (let i = 0; i < 60 * 180 && !g.over; i++) {
        view.update(DT, input);
        fx.update(DT);
        const pops = (fx as unknown as { floaters: Floater[] }).floaters.filter((f) => f.str === 'clink!' && f.life >= 0.45);
        for (const f of pops) {
          seats.add(f.player);
          frames++;
          const w = ([...f.str].length * f.size * 0.55) / 2;
          const hit = g.tanks.some((tk) => {
            const nx = Math.max(f.x - w, Math.min(f.x + w, tk.x));
            const ny = Math.max(f.y - f.size * 0.45, Math.min(f.y + f.size * 0.45, tk.y));
            return Math.hypot(tk.x - nx, tk.y - ny) < RULES.tankR + 8;
          });
          if (hit) covered++;
        }
      }
    }
    console.log(`tanks clink: ${covered}/${frames} readable frames on a tank`);
    expect([...seats].sort()).toEqual([0, 1]);
    expect(frames).toBeGreaterThan(100);
    expect(covered / frames).toBeLessThan(0.02);
  });
});
