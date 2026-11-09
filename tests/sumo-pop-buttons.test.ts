import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import type { Button, PowerButton } from '../src/engine/widgets';
import { W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import type { Sumo } from '../src/games/sumo/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F200: a clash by the top rope sent the bottom player's KA-BOOM! (rising up the screen) over
// the top player's HOLD button: 189 of 676 readable KA-BOOM! frames, normal bots, 2 seeds.
describe('Sumo: pops start clear of the HOLD and power buttons', () => {
  it('in bot matches with every power pair, both seats', () => {
    const list = (powers.games as Record<string, PowerDef[]>).sumo;
    const tally: Record<string, [number, number]> = {};
    const seats = new Set<number>();
    for (const seed of [1, 2, 3, 4]) {
      for (const a of list) {
        for (const b of list) {
          const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal', power: a }), player({ bot: 'normal', power: b })];
          const fx = new Fx();
          const view = GAMES.sumo.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as {
            game: Sumo;
            buttons: Button[];
            powerBtns: (PowerButton | null)[];
            update(dt: number, i: Input): void;
          };
          const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
          const btns = [...view.buttons, ...view.powerBtns.flatMap((pb) => (pb ? [pb.button] : []))];
          expect(btns.length).toBe(4);
          for (let i = 0; i < 60 * 200 && view.game.winner === null; i++) {
            view.update(DT, input);
            fx.update(DT);
            for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
              if (f.life < 0.45) continue;
              seats.add(f.player);
              const t = (tally[f.str] ??= [0, 0]);
              t[1]++;
              const w = Math.min(W - 16, [...f.str].length * f.size * 0.55) / 2;
              const on = btns.some((bt) => {
                const nx = Math.max(f.x - w, Math.min(f.x + w, bt.x));
                const ny = Math.max(f.y - f.size * 0.45, Math.min(f.y + f.size * 0.45, bt.y));
                return Math.hypot(bt.x - nx, bt.y - ny) < bt.r;
              });
              if (on) t[0]++;
            }
          }
        }
      }
    }
    console.log('sumo pops on a button [frames on, readable frames]', JSON.stringify(tally));
    expect([...seats].sort()).toEqual([0, 1]);
    expect(tally['KA-BOOM!'][1]).toBeGreaterThan(500);
    const all = Object.values(tally).reduce((s, [on, n]) => [s[0] + on, s[1] + n], [0, 0]);
    expect(all[0] / all[1], JSON.stringify(tally)).toBeLessThan(0.005);
  }, 180_000);
});
