import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../src/core/colors';
import { contrastRatio, over, parseColor, type RGBA } from '../src/core/contrast';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { MISS_INK } from '../src/games/snacksnatch/index';
import { RULES } from '../src/games/snacksnatch/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; max: number; color: string; size: number; player: 0 | 1 };
type RGB = [number, number, number];

// F211: "Miss!" was white on the near-white blanket (1.1:1); only the thin pop outline showed
// it, so it read pale grey. Its ink must read on everything a "Miss!" lands on by itself,
// without counting the outline.
describe('Snack Snatch: "Miss!" reads on the blanket', () => {
  const blanket = parseColor('#fff6ec')!.slice(0, 3) as RGB;
  const ging = parseColor('rgba(255,110,110,0.22)')!;
  const once = over(ging, blanket, 1) as RGB;
  const twice = over(ging, once, 1) as RGB;
  const bands = PLAYER_COLORS.map((c) => {
    const [r, g, b] = parseColor(c.hex)!;
    return over([r, g, b, 0.35] as RGBA, twice, 1) as RGB;
  });
  const surfaces = [blanket, once, twice, ...bands];

  it('its ink holds 3:1 on the blanket, its gingham and every home band, outline not counted', () => {
    const ink = parseColor(MISS_INK)!.slice(0, 3) as RGB;
    // While still bright (life >= 0.45 of the pop, drawn at 80% or more).
    const worst = Math.min(...surfaces.map((bg) => contrastRatio(over([...ink, 0.8] as RGBA, bg, 1) as RGB, bg)));
    expect(worst).toBeGreaterThanOrEqual(3);
  });

  it('in bot matches every "Miss!" is drawn in that ink, on the blanket, for both seats', () => {
    const seats = new Set<number>();
    const off: string[] = [];
    let checked = 0;
    for (const seed of [3, 11]) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'easy' }), player({ bot: 'easy' })];
      const sfx = { play() {} } as unknown as Sfx;
      const fx = new Fx();
      const view = GAMES.snacksnatch.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx, fx, end() {} }) as unknown as { update(dt: number, i: Input): void };
      const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined } as unknown as Input;
      const top = RULES.gum[1] - 6;
      const bot = RULES.gum[0] + 6;
      for (let i = 0; i < 60 * 40; i++) {
        view.update(DT, input);
        fx.update(DT);
        for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
          if (f.str !== 'Miss!' || f.life < 0.45 * f.max) continue;
          seats.add(f.player);
          checked++;
          if (f.color !== MISS_INK) off.push(`seed ${seed} step ${i}: colour ${f.color}`);
          const half = f.size / 2;
          if (f.y - half < top || f.y + half > bot || f.x < 4 || f.x > W - 4) off.push(`seed ${seed} step ${i}: off the blanket at ${f.x.toFixed(0)},${f.y.toFixed(0)}`);
        }
      }
    }
    expect([...seats].sort(), 'both seats missed').toEqual([0, 1]);
    expect(checked).toBeGreaterThan(0);
    expect(off.slice(0, 5)).toEqual([]);
  });
});
