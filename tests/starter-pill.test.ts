import { afterEach, describe, expect, it } from 'vitest';
import { PILL_EDGE, PILL_W, starterLines, starterPill } from '../src/app/starter';
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
