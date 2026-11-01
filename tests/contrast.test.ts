import { describe, expect, it } from 'vitest';
import { contrastNeeded, contrastRatio, inkOn, labelContrast, parseColor } from '../src/core/contrast';
import { PLAYER_COLORS } from '../src/core/colors';

const rgb = (hex: string) => parseColor(hex)!.slice(0, 3) as [number, number, number];

describe('text contrast', () => {
  it('parses the colour forms the games use', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('#3fa9ff')).toEqual([63, 169, 255, 1]);
    expect(parseColor('rgba(80,50,20,0.55)')).toEqual([80, 50, 20, 0.55]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('gold')).toBeNull();
  });

  it('matches the WCAG reference ratios', () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], rgb('#777777'))).toBeCloseTo(4.48, 2);
    expect(contrastRatio([0, 0, 0], [0, 0, 0])).toBe(1);
  });

  it('large bold text needs 3:1, small text 4.5:1', () => {
    expect(contrastNeeded(13, 800)).toBe(4.5);
    expect(contrastNeeded(18, 800)).toBe(4.5);
    expect(contrastNeeded(20, 800)).toBe(3);
    expect(contrastNeeded(20, 400)).toBe(4.5);
    expect(contrastNeeded(24, 400)).toBe(3);
  });

  it('a faded label counts its alpha, an outline counts as what it is read against', () => {
    const white = parseColor('#ffffff')!;
    const grass = rgb('#7cc96a');
    expect(labelContrast(white, grass)).toBeLessThan(3);
    expect(labelContrast(white, grass, 0.45)).toBeLessThan(labelContrast(white, grass));
    expect(labelContrast(white, grass, 1, parseColor('rgba(0,0,0,0.75)'))).toBeGreaterThan(4.5);
  });

  it('words on every player colour get an ink that reads at 4.5:1 (Purple: 4.4:1, its best)', () => {
    // Purple is mid-bright: white gives 4.37:1 and the dark ink less, so pill labels
    // are drawn large (19 px bold, needs 3:1) and only small badge text sits at 4.4.
    for (const c of PLAYER_COLORS) {
      const ink = inkOn(c.hex);
      expect(contrastRatio(rgb(ink), rgb(c.hex)), `${c.name} with ${ink}`).toBeGreaterThanOrEqual(c.name === 'Purple' ? 4.35 : 4.5);
    }
    // White on the light colours was the old default and fails.
    expect(contrastRatio([255, 255, 255], rgb('#15e5b4'))).toBeLessThan(3);
  });
});

describe('pop-up words', () => {
  // Every fx.pop in Sumo, read against the ring it lands on. The playtest only
  // sees a pop when the match happens to trigger it ("Last rope save!" is rare),
  // so this checks each one from the source, at its own size.
  it("Sumo's pops read on its pale sand", async () => {
    const fs = await import('node:fs');
    const { POP_OUTLINE } = await import('../src/engine/fx');
    const { COLORS } = await import('../src/engine/draw');
    const src = fs.readFileSync('src/games/sumo/index.ts', 'utf8');
    const consts = Object.fromEntries([...src.matchAll(/^const ([A-Z_]+) = '(#[0-9a-f]{3,6})'/gim)].map((m) => [m[1], m[2]]));
    const colour = (expr: string): string[] => {
      const lit = [...expr.matchAll(/'(#[0-9a-f]{3,6})'/gi)].map((m) => m[1]);
      const named = [...expr.matchAll(/COLORS\.(\w+)/g)].map((m) => (COLORS as Record<string, string>)[m[1]]);
      const own = [...expr.matchAll(/\b([A-Z_]{3,})\b/g)].map((m) => consts[m[1]]).filter(Boolean);
      const seats = /players\[/.test(expr) ? PLAYER_COLORS.map((c) => c.hex) : [];
      return [...lit, ...named, ...own, ...seats];
    };
    const pops = [...src.matchAll(/fx\.pop\(([^;]*)\);/g)].map((m) => m[1]);
    expect(pops.length).toBeGreaterThan(3);
    const outline = parseColor(POP_OUTLINE)!;
    const faint: string[] = [];
    for (const call of pops) {
      const args = call.split(/,(?![^(]*\))/);
      const size = Number(args[args.length - 1]) || 22;
      for (const fill of colour(args.slice(3).join(','))) {
        for (const bg of [consts.SAND, consts.SAND_DARK]) {
          const r = labelContrast(parseColor(fill)!, rgb(bg), 1, outline);
          if (r < contrastNeeded(size, 800)) faint.push(`${args[0].trim()} ${fill} on ${bg}: ${r.toFixed(1)}:1`);
        }
      }
    }
    expect(faint).toEqual([]);
  });
  it('the probe judges a label at rest; mid-fade samples only stand in until then', async () => {
    const { keepSample } = await import('../src/engine/draw');
    expect(keepSample(undefined, 2, false)).toBe(true);
    // A label first caught fading in (2.8:1) is replaced by its first at-rest sample, even a lower one.
    expect(keepSample({ best: 2.8, rest: false }, 2.0, true)).toBe(true);
    // Once seen at rest, a fade frame never changes the verdict, a better rest frame does.
    expect(keepSample({ best: 2.0, rest: true }, 9, false)).toBe(false);
    expect(keepSample({ best: 2.0, rest: true }, 3, true)).toBe(true);
    expect(keepSample({ best: 4.0, rest: true }, 3, true)).toBe(false);
  });

  it("minigolf's hole card and shot banner fade their words with their dark card", async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/games/minigolf/index.ts', 'utf8');
    for (const fn of ['drawIntro', 'drawBanner']) {
      const body = src.slice(src.indexOf(`private ${fn}(`), src.indexOf('\n  }\n', src.indexOf(`private ${fn}(`)));
      const calls = body.match(/text\(gx,[^;]*\);/g) ?? [];
      expect(calls.length, fn).toBeGreaterThan(0);
      for (const c of calls) expect(c, fn).toContain('alpha: fade');
    }
  });
});
