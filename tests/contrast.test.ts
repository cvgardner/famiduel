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
  it("Chop Chop's tap hints stay readable on the grass during play, not just on the intro", async () => {
    // The probe keeps a label's best at-rest sample, so hints that faded to 45% once play
    // started (about 1.6:1 on the grass) still passed on the intro. Now they sit on a dark
    // pill at full opacity the whole match, and this reads them on the lightest grass.
    const fs = await import('node:fs');
    const { over } = await import('../src/core/contrast');
    const src = fs.readFileSync('src/games/chopchop/index.ts', 'utf8');
    const hint = src.match(/text\(gx, label, hx, H - 34, \{([^}]*)\}\);/);
    expect(hint, 'hint label call').not.toBeNull();
    expect(hint![1]).not.toMatch(/alpha/);
    const pill = src.match(/rrect\(gx, hx - \d+, H - \d+, \d+, \d+, \d+, '(rgba\([^']*\))'\);/);
    expect(pill, 'dark pill behind each hint').not.toBeNull();
    const pillFill = parseColor(pill![1])!;
    for (const grass of ['#7cc96b', '#4f9e45', '#a9dca0']) {
      const bg = over(pillFill, rgb(grass));
      const r = labelContrast(parseColor('#ffffff')!, bg, 1, parseColor('rgba(0,0,0,0.35)'));
      expect(r, `hint on ${grass}`).toBeGreaterThanOrEqual(contrastNeeded(16, 800));
    }
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
      // text() multiplies the canvas's alpha (tests/alpha.test.ts), so every word must be
      // drawn after the card's fade is set and before it is put back to 1.
      const calls = body.match(/text\(gx,[^;]*\);/g) ?? [];
      expect(calls.length, fn).toBeGreaterThan(0);
      const fadeOn = body.search(/gx\.globalAlpha = (?!1;)/);
      const fadeOff = body.lastIndexOf('gx.globalAlpha = 1;');
      expect(fadeOn, fn).toBeGreaterThan(-1);
      for (const c of calls) {
        const at = body.indexOf(c);
        expect(at > fadeOn && at < fadeOff, `${fn}: ${c}`).toBe(true);
      }
    }
  });
});

describe('pops in a player colour', () => {
  it('read at 4.5:1 on the dark floor for every seat colour', async () => {
    const { popColor } = await import('../src/engine/fx');
    const floor = rgb('#14112b');
    for (const c of PLAYER_COLORS) {
      const out = parseColor(popColor(c.hex))!.slice(0, 3) as [number, number, number];
      expect(contrastRatio(out, floor), c.name).toBeGreaterThanOrEqual(4.5);
    }
    // Colours that already read keep their exact hue.
    expect(popColor('#15e5b4')).toBe('#15e5b4');
    expect(popColor('#7a5cff')).not.toBe('#7a5cff');
  });
});

describe('home game cards', () => {
  it('every card name reads at 4.5:1 on the shade behind it', async () => {
    const { cardInk, NAME_SHADE } = await import('../src/app/cardink');
    const { default: games } = await import('../content/games.json');
    for (const g of games.games) {
      const c = rgb(g.color).map((v) => Math.round(v * NAME_SHADE)) as [number, number, number];
      expect(contrastRatio(rgb(cardInk(g.color)), c), g.id).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('minigolf words in a player colour on its dark cards', () => {
  it('"<name> tees off first" and "<name>\'s shot" read at 4.5:1 for every seat colour, even on white', async () => {
    const { liftOn, popColor } = await import('../src/engine/fx');
    const { INTRO_CARD, BANNER_CARD, STRIP_CARD } = await import('../src/games/minigolf/index');
    const { over } = await import('../src/core/contrast');
    for (const card of [INTRO_CARD, BANNER_CARD, STRIP_CARD]) {
      for (const behind of ['#ffffff', '#4caf50', '#14112b']) {
        const floor = over(parseColor(card)!, rgb(behind));
        for (const c of PLAYER_COLORS) {
          expect(contrastRatio(parseColor(liftOn(c.hex, card))!.slice(0, 3) as [number, number, number], floor), `${c.name} on ${card} over ${behind}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    // Purple needed it (about 3.5:1 before); colours that read keep their exact hue.
    const purple = PLAYER_COLORS.find((c) => c.name === 'Purple')!.hex;
    const mint = PLAYER_COLORS.find((c) => c.name === 'Mint')!.hex;
    expect(liftOn(purple, INTRO_CARD)).not.toBe(purple);
    expect(liftOn(mint, INTRO_CARD)).toBe(mint);
    // popColor is liftOn against the opaque floor, unchanged.
    expect(popColor('#15e5b4')).toBe('#15e5b4');
    const src = (await import('node:fs')).readFileSync('src/games/minigolf/index.ts', 'utf8');
    expect(src).toMatch(/tees off first`;\n\s*text\(gx, who,[^;]*liftOn\(/);
    expect(src).toMatch(/'s shot`, W \/ 2, y, \{[^}]*liftOn\(c, BANNER_CARD\)/);
    expect(src).toMatch(/text\(gx, name, x0, y0 \+ 19, \{[^}]*liftOn\(c, STRIP_CARD\)/);
  });
});


describe('Ping Pong SERVE hint', () => {
  it('reads at 4.5:1 for every seat colour on the green table', async () => {
    const { liftOn } = await import('../src/engine/fx');
    const { TABLE_GREEN, SERVE_OUTLINE } = await import('../src/games/pingpong/index');
    for (const c of PLAYER_COLORS) {
      const ink = parseColor(liftOn(c.hex, SERVE_OUTLINE, TABLE_GREEN))!;
      expect(labelContrast(ink, rgb(TABLE_GREEN), 1, parseColor(SERVE_OUTLINE)), c.name).toBeGreaterThanOrEqual(4.5);
    }
    // Purple was 4.0:1 before.
    const purple = PLAYER_COLORS.find((c) => c.name === 'Purple')!.hex;
    expect(labelContrast(parseColor(purple)!, rgb(TABLE_GREEN), 1, parseColor(SERVE_OUTLINE))).toBeLessThan(4.5);
    const src = (await import('node:fs')).readFileSync('src/games/pingpong/index.ts', 'utf8');
    expect(src).toMatch(/'SERVE'[^;]*liftOn\(c\[p\], SERVE_OUTLINE, TABLE_GREEN\)/);
  });
});

describe('pop-up words in every action game', () => {
  // Same source check as Sumo's, for every action game against the colours its
  // own play area is painted in (each view exports SURFACES). The playtest only
  // judges the pops a match happens to trigger, so rare ones are covered here.
  const GAMES = ['airhockey', 'chopchop', 'minigolf', 'penalty', 'pingpong', 'quickdraw', 'snacksnatch', 'snake', 'sumo', 'tanks'];
  it.each(GAMES)('%s pops read on its own surfaces', async (id) => {
    const fs = await import('node:fs');
    const { POP_OUTLINE, popColor } = await import('../src/engine/fx');
    const { COLORS } = await import('../src/engine/draw');
    const view = (await import(`../src/games/${id}/index.ts`)) as { SURFACES?: readonly string[]; seatPop?: (c: string) => string };
    expect(view.SURFACES?.length, `${id} exports SURFACES`).toBeGreaterThan(0);
    const src = fs.readFileSync(`src/games/${id}/index.ts`, 'utf8');
    const consts = Object.fromEntries([...src.matchAll(/^(?:export )?const ([A-Z_]+) = '(#[0-9a-f]{3,6})'/gim)].map((m) => [m[1], m[2]]));
    const colour = (expr: string): string[] => {
      const lit = [...expr.matchAll(/'(#[0-9a-f]{3,6}|rgba?\([^']*\))'/gi)].map((m) => m[1]);
      const named = [...expr.matchAll(/COLORS\.(\w+)/g)].map((m) => (COLORS as Record<string, string>)[m[1]]);
      const own = [...expr.matchAll(/\b([A-Z_]{3,})\b/g)].map((m) => consts[m[1]]).filter(Boolean);
      const seats = /players\[|\bcol\(|\bc\[/.test(expr) ? PLAYER_COLORS.map((c) => (/seatPop\(/.test(expr) && view.seatPop ? view.seatPop(c.hex) : /popColor\(/.test(expr) ? popColor(c.hex) : c.hex)) : [];
      return [...lit, ...named, ...own, ...seats];
    };
    const pops = [...src.matchAll(/fx\.pop\(([^;]*)\);/g)].map((m) => m[1]);
    expect(pops.length, `${id} has pops`).toBeGreaterThan(0);
    const outline = parseColor(POP_OUTLINE)!;
    const faint: string[] = [];
    for (const call of pops) {
      const args = call.split(/,(?![^(]*\))/);
      const size = Number(args[args.length - 1]) || 22;
      // A helper passing its own `color` argument on is checked at its callers.
      if (/^\s*color\s*$/.test(args[3] ?? '')) continue;
      for (const fill of colour(args.slice(3).join(','))) {
        for (const bg of view.SURFACES!) {
          const r = labelContrast(parseColor(fill)!, rgb(bg), 1, outline);
          if (r < contrastNeeded(size, 800)) faint.push(`${args[0].trim()} ${fill} on ${bg}: ${r.toFixed(1)}:1`);
        }
      }
    }
    expect(faint).toEqual([]);
  });
});
