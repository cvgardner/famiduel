// F378: Mini Pool pops ("Go again!", "2 to go!", "Another go!") printed over balls on the
// table, hiding a ball the player was lining up on. A pop is now born on a line clear of them.
import { afterEach, describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { MID, W } from '../src/engine/world';
import { PHYS, type Ball } from '../src/games/minipool/physics';
import { GAMES } from '../src/games/registry';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; max: number; size: number; player: 0 | 1 };

describe('Mini Pool pops', () => {
  afterEach(() => setTextScale(1));
  // F384: and again with Bigger text, where words are drawn up to 1.2x and need more room.
  for (const scale of [1, BIG_TEXT]) {
    it(`are born off every ball on the table${scale === 1 ? '' : ' (Bigger text)'}`, () => {
      setTextScale(scale);
      const list = (powers.games as Record<string, PowerDef[]>).minipool;
      let born = 0;
      const hits: Record<string, number> = {};
      // F438: every pop born on its own seat's half; a forgiven miss pops "Another go!" alone.
      const offHalf: Record<string, number> = {};
      let doubled = 0;
      let retries = 0;
      for (const seed of [1, 2, 3, 4]) {
        for (const pw of [null, ...list]) {
          // F438: and a three-star player in the bottom seat against the hard bot.
          const players: [PlayerInfo, PlayerInfo] = seed > 2
            ? [player({ bot: 'easy', power: pw, assist: 3 }), player({ bot: 'hard', power: pw })]
            : [player({ bot: 'normal', power: pw }), player({ bot: 'easy', power: pw, assist: 3 })];
          const fx = new Fx();
          let ended = false;
          const view = GAMES.minipool.create({ seed, rng: makeRng(seed), players, powersOn: !!pw, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as { game: { winner?: number | null; balls: Ball[] }; update(dt: number, i: Input): void };
          const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
          const seen = new Set<Floater>();
          for (let i = 0; i < 60 * 400 && !ended && (view.game.winner ?? null) === null; i++) {
            view.update(DT, input);
            const fresh: Floater[] = [];
            for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
              if (seen.has(f)) continue;
              seen.add(f);
              fresh.push(f);
              born++;
              const s = scaledSize(f.size) * 0.45;
              if (f.player === 0 ? f.y - s < MID : f.y + s > MID) offHalf[f.str] = (offHalf[f.str] ?? 0) + 1;
              const half = Math.min(W - 16, [...f.str].length * scaledSize(f.size) * 0.55) / 2;
              const top = f.y - scaledSize(f.size) * 0.45;
              const bot = f.y + scaledSize(f.size) * 0.45;
              const on = view.game.balls.some((b) => b.on && Math.hypot(b.x - Math.max(f.x - half, Math.min(f.x + half, b.x)), b.y - Math.max(top, Math.min(bot, b.y))) < PHYS.r);
              if (on) hits[f.str] = (hits[f.str] ?? 0) + 1;
            }
            for (const f of fresh) {
              if (!f.str.startsWith('Another go!')) continue;
              retries++;
              if (fresh.some((o) => o.player === f.player && o.str === 'Go again!')) doubled++;
            }
            fx.update(DT);
          }
        }
      }
      expect(born).toBeGreaterThan(100);
      expect(Object.values(hits).reduce((s, v) => s + v, 0), JSON.stringify(hits)).toBe(0);
      expect(retries).toBeGreaterThan(10);
      expect(doubled).toBe(0);
      expect(Object.values(offHalf).reduce((s, v) => s + v, 0), JSON.stringify(offHalf)).toBe(0);
    }, 120_000);
  }
});
