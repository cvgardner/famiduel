import { describe, expect, it } from 'vitest';
import { H, MID } from '../src/engine/world';
import { TRUNK_FADED, treeFade } from '../src/games/chopchop/index';

const BASE_Y = H - 124; // the chopper's segment (index.ts L.baseY)
const SEG = 40;
const PILLS_BOTTOM = MID + 22 + 43; // the "/ 50" and "them: N" pills end here

// F209: the tree's segments above the next three ran under the timer bar and the count
// pills, and their leaves peeked out beside "/ 50" and the round pips.
describe('Chop Chop: the tree fades under the HUD', () => {
  it('draws the chopper segment and the next three branches fully', () => {
    for (let k = 0; k <= 3; k++) expect(treeFade(BASE_Y - k * SEG)).toBe(1);
  });
  it('hides branches on the segments under the count pills', () => {
    for (let k = 4; k <= 6; k++) {
      const y = BASE_Y - k * SEG;
      expect(y - 23).toBeLessThan(PILLS_BOTTOM); // its leaves reach the pills
      expect(treeFade(y)).toBe(0);
    }
    expect(TRUNK_FADED).toBeLessThan(0.5);
  });
  it('fades in smoothly as the trunk drops after a chop', () => {
    let last = -1;
    for (let s = 20; s >= 0; s--) {
      const d = s / 20;
      const f = treeFade(BASE_Y - 3 * SEG - d * SEG);
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
    expect(last).toBe(1);
  });
});
