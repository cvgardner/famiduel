import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { MID, W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { RULES, type AirHockey } from '../src/games/airhockey/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F196: a goal serves the puck at MID ± 70 toward the player who let it in, and that player's
// "GOAL!" (born at MID ± 80, rising to the middle) sat on it for the whole serve wait: 6,162 of
// 14,144 readable GOAL! frames. Power names and "Your shot!" landed on a puck too.
describe('Air Hockey: centre pops start clear of the puck', () => {
  it('in bot matches with every power pair, both seats, each pop in its own half', () => {
    const list = (powers.games as Record<string, PowerDef[]>).airhockey;
    const tally: Record<string, [number, number]> = {};
    const seats = new Set<number>();
    for (const seed of [1, 2, 3, 4]) {
      for (const a of list) {
        for (const b of list) {
          const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal', power: a }), player({ bot: 'normal', power: b })];
          const fx = new Fx();
          const view = GAMES.airhockey.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: AirHockey; update(dt: number, i: Input): void };
          const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
          const g = view.game;
          for (let i = 0; i < 60 * 200 && g.winner === null; i++) {
            view.update(DT, input);
            fx.update(DT);
            for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
              if (f.x !== W / 2 || f.life < 0.45) continue;
              seats.add(f.player);
              expect(f.player === 0 ? f.y > MID : f.y < MID, `${f.str} in its seat's half`).toBe(true);
              const t = (tally[f.str.startsWith('GOAL') ? 'GOAL!' : f.str] ??= [0, 0]);
              t[1]++;
              const w = ([...f.str].length * f.size * 0.55) / 2;
              const onPuck = g.pucks.some((pk) => {
                const nx = Math.max(f.x - w, Math.min(f.x + w, pk.x));
                const ny = Math.max(f.y - f.size * 0.45, Math.min(f.y + f.size * 0.45, pk.y));
                return Math.hypot(pk.x - nx, pk.y - ny) < RULES.puckR;
              });
              if (onPuck) t[0]++;
            }
          }
        }
      }
    }
    console.log('air hockey pops on a puck [frames on, readable frames]', JSON.stringify(tally));
    expect([...seats].sort()).toEqual([0, 1]);
    expect(tally['GOAL!'][1]).toBeGreaterThan(1000);
    expect(tally['GOAL!'][0] / tally['GOAL!'][1]).toBeLessThan(0.01);
    const all = Object.values(tally).reduce((s, [on, n]) => [s[0] + on, s[1] + n], [0, 0]);
    expect(all[0] / all[1]).toBeLessThan(0.03);
  }, 180_000);
});
