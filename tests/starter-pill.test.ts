import { afterEach, describe, expect, it } from 'vitest';
import { DIGIT_REACH, PILL_EDGE, PILL_W, STARTER_DY, starterLines, starterPill, starterPillDy } from '../src/app/starter';
import { COUNT_DY } from '../src/app/demo';
import { BIG_TEXT, MIN_TEXT, setTextScale, type G } from '../src/engine/draw';
import { W } from '../src/engine/world';

// A canvas whose words measure like a bold system font: ~0.62 em a letter, a wide W ~0.95 em.
function fakeG(): G {
  const g = { font: '' } as Record<string, unknown>;
  g.measureText = (s: string) => {
    const px = Number(/(\d+(\.\d+)?)px/.exec(g.font as string)![1]);
    return { width: [...s].reduce((w, c) => w + (c === 'W' ? 0.95 : c === ' ' ? 0.3 : 0.62) * px, 0) };
  };
  return g as unknown as G;
}

describe('F318: the countdown pill fits a long name', () => {
  afterEach(() => setTextScale(1));
  for (const scale of [1, BIG_TEXT]) {
    it(`"<12 letters> goes first" stays inside the screen (text scale ${scale})`, () => {
      setTextScale(scale);
      const g = fakeG();
      const [, top] = starterLines(0, ['WWWWWWWWWWWW', 'Grandma Jose']);
      const pill = starterPill(g, top!, false);
      expect(pill.w).toBeLessThanOrEqual(W - 2 * PILL_EDGE);
      expect(pill.size).toBeGreaterThanOrEqual(MIN_TEXT);
      const textW = (g as unknown as { measureText(s: string): { width: number } }).measureText(top!).width;
      expect(textW, 'words inside the pill').toBeLessThanOrEqual(pill.w - 16);
    });
  }
  it('short names keep the usual pill and sizes', () => {
    setTextScale(1);
    const g = fakeG();
    expect(starterPill(g, 'You go first!', true)).toEqual({ size: 26, w: PILL_W });
    expect(starterPill(g, 'Mia goes first', false)).toEqual({ size: 20, w: PILL_W });
  });
});

describe('the starter pill clears the countdown digit (F356)', () => {
  it('stays at its usual spot for the usual digit, and moves to the middle side of a digit moved out', () => {
    expect(starterPillDy(COUNT_DY)).toBe(STARTER_DY);
    // Mini Pool's digit sits at 190: a size-110 digit's reach (F400: measured, see below)
    // plus half the pill (22) clear.
    for (const dy of [150, 190]) expect(dy - starterPillDy(dy)).toBeGreaterThan(DIGIT_REACH + 22);
    // And it stays in that person's half, off the middle line (pill 44 tall).
    for (const dy of [150, 190]) expect(starterPillDy(dy) - 22).toBeGreaterThan(30);
  });
});

describe('F400: the digit reach the pill clears is what a canvas draws', () => {
  it('a size-110 bold "3" (ascent above its middle + half its stroke) fits in DIGIT_REACH', () => {
    // Chromium's measureText for '800 110px system-ui' with textBaseline middle: "1" 47.9,
    // "2" 48.9, "3" 48.9 above the middle; text() strokes at size / 6, half of it outside.
    const ascent = 48.9;
    expect(ascent + 110 / 6 / 2).toBeLessThanOrEqual(DIGIT_REACH);
  });
});
