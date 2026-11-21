import { afterEach, describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { H } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { powerLines } from '../src/games/snacksnatch/index';
import { RULES, type SnackSnatch } from '../src/games/snacksnatch/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

/** Is the box [x0,x1]×[y0,y1] within r of the point (px, py)? */
function nearBox(x0: number, x1: number, y0: number, y1: number, px: number, py: number, r: number): boolean {
  const nx = Math.max(x0, Math.min(x1, px));
  const ny = Math.max(y0, Math.min(y1, py));
  return Math.hypot(px - nx, py - ny) < r;
}

/** Does a pop's box cross any frog (body, stretched neck or head) as the view draws it? */
export function onFrog(g: SnackSnatch, f: Floater): boolean {
  const w = ([...f.str].length * scaledSize(f.size) * 0.55) / 2;
  const x0 = f.x - w;
  const x1 = f.x + w;
  const y0 = f.y - scaledSize(f.size) * 0.45;
  const y1 = f.y + scaledSize(f.size) * 0.45;
  for (const p of [0, 1] as const) {
    const bodyY = p === 0 ? H - 62 : 62;
    for (const c of g.critters[p]) {
      const hy = g.headY(c);
      if (nearBox(x0, x1, y0, y1, c.x, hy, RULES.headR)) return true;
      if (nearBox(x0, x1, y0, y1, c.x, bodyY, 40)) return true;
      if (g.extension(c) > 2) {
        // The neck: a 24-wide stroke from the body to the head.
        const lo = Math.min(bodyY, hy);
        const hi = Math.max(bodyY, hy);
        if (x1 > c.x - 12 && x0 < c.x + 12 && y1 > lo && y0 < hi) return true;
      }
    }
  }
  return false;
}

// F238: power-name pops and catch pops started on a frog's head or its stretched neck (a bot
// match showed "Double Grab!" across the blue frog's head). Readable frames on a frog before:
// "+N" 13,006/52,616 (it started on the gulped snack, with the head still stretching through it),
// "+N ×k!" 937/8,139, Double Grab 573/1,852, Magnet Mouth 262/1,972, Sticky Snacks 168/1,923.
// Catch pops now start beside the neck; power names pop in two lines between the frog lanes.
describe('Snack Snatch: power and catch pops start clear of the frogs', () => {
  afterEach(() => setTextScale(1));
  // F385: and again with Bigger text, where words are drawn up to 1.2x and need more room.
  for (const scale of [1, BIG_TEXT]) {
    it(`in bot matches at every level with powers, both seats${scale === 1 ? '' : ' (Bigger text)'}`, () => {
      setTextScale(scale);
      const total: Record<string, number> = {};
      const covered: Record<string, number> = {};
      const seats = new Set<number>();
      const list = (powers.games as Record<string, PowerDef[]>).snacksnatch;
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
            for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
              if (f.life < 0.45) continue;
              const key = /^\+\d/.test(f.str) ? (f.str.includes('×') ? '+N ×k!' : '+N') : f.str;
              seats.add(f.player);
              total[key] = (total[key] ?? 0) + 1;
              if (onFrog(g, f)) covered[key] = (covered[key] ?? 0) + 1;
            }
          }
        }
      }
      for (const k of Object.keys(total)) console.log(`snacksnatch ${k}: ${covered[k] ?? 0}/${total[k]} readable frames on a frog`);
      expect([...seats].sort()).toEqual([0, 1]);
      const names = list.flatMap((pw) => powerLines(`${pw.icon} ${pw.name}!`).filter((l): l is string => !!l));
      expect(names.length).toBe(list.length * 2);
      for (const k of [...names, '+N']) {
        expect(total[k], k).toBeGreaterThan(100);
        expect((covered[k] ?? 0) / total[k], k).toBeLessThan(0.01);
      }
    }, 120_000); // whole bot matches: GitHub CI runs ~3x slower than a laptop
  }
});
