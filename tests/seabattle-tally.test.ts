import { describe, expect, it } from 'vitest';
import { N } from '../src/games/seabattle/logic';
import { TALLY_GAP, tallyLayout } from '../src/games/seabattle/index';

// Layout in src/games/seabattle/index.ts: big grid at GX, cells of C.
const C = 27;
const GX = (360 - N * C) / 2;
const FLEET = [5, 4, 3, 3, 2];

// F313: with Bigger text on a 320 px phone the "Their ships" label (~86 units at 15.6 px)
// ran into the first ship of the tally, which started at a fixed GX + 86.
describe('Sea Battle fleet tally keeps clear of its label', () => {
  // Label widths: usual text, Bigger text, and Bigger text with a wider (Linux CI) font.
  for (const labelW of [72, 86, 100]) {
    it(`label ${labelW} units wide`, () => {
      const t = tallyLayout(labelW, FLEET);
      expect(t[0].x, 'first ship clear of the label').toBeGreaterThanOrEqual(GX + labelW + TALLY_GAP);
      const end = t[t.length - 1].x + t[t.length - 1].w;
      expect(end, 'tally ends inside the grid').toBeLessThanOrEqual(GX + N * C + 0.001);
      for (let i = 1; i < t.length; i++) expect(t[i].x - (t[i - 1].x + t[i - 1].w), 'ships apart').toBeGreaterThanOrEqual(6);
      // Longer ships still read longer.
      expect(t[0].w).toBeGreaterThan(t[1].w);
      expect(t[4].w).toBeGreaterThanOrEqual(12);
    });
  }
  it('usual text keeps the old tally (within a unit: it used to end 1 past the grid)', () => {
    const t = tallyLayout(72, FLEET);
    expect(t[0].x).toBe(GX + 86);
    expect(t[0].w).toBeCloseTo(45, 0);
    expect(t[1].x).toBeCloseTo(GX + 86 + 45 + 8, 0);
  });
});
