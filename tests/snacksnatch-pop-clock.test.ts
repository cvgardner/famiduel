import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { clockSpots } from '../src/games/snacksnatch/index';
import type { SnackSnatch } from '../src/games/snacksnatch/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F191: a "Miss!" or "+1" by the pot started on a seconds-left label and rose across it (bot
// match, 320x568: "Miss!" over the top seat's "19", "+1" over the bottom seat's).
describe('Snack Snatch: catch and miss pops keep off the seconds-left', () => {
  it('in bot matches, both seats', () => {
    let frames = 0;
    let covered = 0;
    const seats = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'hard' }), player({ bot: 'normal' })];
      const fx = new Fx();
      const view = GAMES.snacksnatch.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: SnackSnatch; update(dt: number, i: Input): void };
      const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
      const g = view.game;
      for (let i = 0; i < 60 * 120 && !g.finished; i++) {
        view.update(DT, input);
        fx.update(DT);
        const pops = (fx as unknown as { floaters: Floater[] }).floaters.filter((f) => /^(Miss!|\+\d)/.test(f.str) && f.life >= 0.45);
        for (const f of pops) {
          seats.add(f.player);
          frames++;
          const w = ([...f.str].length * f.size * 0.55) / 2;
          const hit = clockSpots().some(([, lx, ly]) => Math.abs(f.x - lx) < w + 14 && Math.abs(f.y - ly) < f.size * 0.45 + 12);
          if (hit) covered++;
        }
      }
    }
    console.log(`snack snatch pops: ${covered}/${frames} readable frames on a seconds-left label`);
    expect([...seats].sort()).toEqual([0, 1]);
    expect(frames).toBeGreaterThan(500);
    expect(covered).toBe(0);
  }, 60_000); // whole bot matches: GitHub CI runs ~3x slower than a laptop
});
