import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };
const box = (f: Floater) => {
  const w = Math.min(W - 16, [...f.str].length * f.size * 0.55);
  return [f.x - w / 2, f.y - f.size * 0.45, f.x + w / 2, f.y + f.size * 0.45];
};

// F198: pops stacked only against their own seat's, so the two seats' words printed over each
// other: Tank Duel's "Bonked!" / "Oops! Own shot" on the shooter's BONK! (644 of 7,280 readable
// BONK! frames), POOF! on BONK!, Sumo's "💥 Ground Pound!" on KA-BOOM!.
describe('pops never print over a pop of the other seat', () => {
  for (const id of ['tanks', 'sumo', 'snacksnatch', 'airhockey', 'pingpong', 'snake', 'chopchop', 'penalty', 'quickdraw', 'minigolf']) {
    it(id, () => {
      const list = (powers.games as Record<string, PowerDef[]>)[id];
      let readable = 0;
      const hits: Record<string, number> = {};
      for (const seed of [1, 2]) {
        for (const a of list) {
          for (const b of list) {
            const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal', power: a }), player({ bot: 'normal', power: b })];
            const fx = new Fx();
            let ended = false;
            const view = GAMES[id].create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as { game: { winner?: number | null }; update(dt: number, i: Input): void };
            const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
            for (let i = 0; i < 60 * 240 && !ended && (view.game.winner ?? null) === null; i++) {
              view.update(DT, input);
              fx.update(DT);
              const bright = (fx as unknown as { floaters: Floater[] }).floaters.filter((f) => f.life >= 0.45);
              for (const f of bright) {
                readable++;
                const fb = box(f);
                const o = bright.find((g) => g.player !== f.player && g.str !== f.str && (() => { const gb = box(g); return fb[0] < gb[2] && gb[0] < fb[2] && fb[1] < gb[3] && gb[1] < fb[3]; })());
                if (o) hits[`${f.str} | ${o.str}`] = (hits[`${f.str} | ${o.str}`] ?? 0) + 1;
              }
            }
          }
        }
      }
      const n = Object.values(hits).reduce((s, v) => s + v, 0);
      expect(readable).toBeGreaterThan(500);
      expect(n, JSON.stringify(hits)).toBe(0);
    }, 120_000);
  }
});
