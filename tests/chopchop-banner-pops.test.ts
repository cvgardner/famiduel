import { afterEach, describe, expect, it } from 'vitest';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { bannerBands } from '../src/games/chopchop/index';
import { GAMES } from '../src/games/registry';
import { DT, player, power } from './helpers';

type Floater = { str: string; y: number; life: number; max: number; size: number };

// F248: when a Chop Chop round ended, the winning chop's "50!" started right on the boxed
// round-end card ("You win the round!" / "They got to 50!") and late "+2"s rose into it.
// Pops reaching either card now fade as the cards appear.
describe('Chop Chop: no readable pop over the round-end card', () => {
  afterEach(() => setTextScale(1));
  for (const scale of [1, BIG_TEXT]) it(`in bot matches at every level, with and without powers${scale === 1 ? '' : ' (Bigger text)'}`, () => {
    setTextScale(scale);
    let frames = 0;
    let over = 0;
    const bands = bannerBands();
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const powersOn = seed % 2 === 0;
        const ids = ['shield', 'double', 'freeze'];
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: level }), player({ bot: level })];
        if (powersOn) {
          players[0].power = power('chopchop', ids[seed % 3]);
          players[1].power = power('chopchop', ids[(seed + 1) % 3]);
        }
        const fx = new Fx();
        let ended = false;
        const view = GAMES.chopchop.create({ seed, rng: makeRng(seed), players, powersOn, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as { update(dt: number, i: Input): void; game: { phase: string; done: boolean } };
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        for (let i = 0; i < 60 * 300 && !ended; i++) {
          view.update(DT, input);
          fx.update(DT);
          if (!(view.game.phase === 'over' && !view.game.done)) continue;
          frames++;
          for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
            const readable = Math.min(1, (f.life / f.max) * 1.6) >= 0.5;
            const half = scaledSize(f.size) * 0.45;
            if (readable && bands.some(([y0, y1]) => f.y + half > y0 && f.y - half < y1)) over++;
          }
        }
        expect(ended).toBe(true);
      }
    }
    console.log(`chopchop card: ${over} readable pops over ${frames} card frames`);
    expect(frames).toBeGreaterThan(1000);
    expect(over).toBe(0);
  }, 120_000);
});
