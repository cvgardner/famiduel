import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { MID } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { BANNER_OFF } from '../src/games/sumo/index';
import { DT, player } from './helpers';

type Floater = { str: string; y: number; life: number; max: number; size: number };

// F237: a ring-out clash's "BONK!"/"KA-BOOM!" was still rising across the middle when the
// boxed round-end banner ("Bot 1 wins the round!", MID ± BANNER_OFF) appeared, so it printed
// over the banner. Pops in that band now fade as the banner shows.
describe('Sumo: no readable pop over the round-end banner', () => {
  it('in bot matches at every level', () => {
    let frames = 0;
    let over = 0;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: level }), player({ bot: level })];
        const fx = new Fx();
        let ended = false;
        const view = GAMES.sumo.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as { update(dt: number, i: Input): void; banner: number; bannerBoxed: boolean };
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        for (let i = 0; i < 60 * 300 && !ended; i++) {
          view.update(DT, input);
          fx.update(DT);
          if (!(view.banner > 0 && view.bannerBoxed)) continue;
          frames++;
          for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
            const readable = Math.min(1, (f.life / f.max) * 1.6) >= 0.5;
            const half = f.size * 0.45;
            if (readable && f.y + half > MID - BANNER_OFF * 2 && f.y - half < MID + BANNER_OFF * 2) over++;
          }
        }
        expect(ended).toBe(true);
      }
    }
    console.log(`sumo banner: ${over} readable pops over ${frames} banner frames`);
    expect(frames).toBeGreaterThan(1000);
    expect(over).toBe(0);
  }, 120_000);
});
