import { describe, expect, it } from 'vitest';
import { pairing, SPECS } from '../scripts/simlib';

// Each bot level must be a real step up, not just hard vs easy. A rival 2-player app's
// store reviews say "the stronger bot doesn't seem more powerful"; a family that moves
// a kid from Easy to Normal should feel the difference. Every game's own test already
// checks hard beats easy; this checks the middle step both ways, in every action game,
// with the same matches as `npm run sim` (20 per row, seats swapped, powers off).
describe('bot levels feel different', () => {
  for (const spec of SPECS) {
    it(`${spec.id}: normal beats easy and hard beats normal`, () => {
      const ne = pairing(spec, ['normal', 'easy'], 20);
      const hn = pairing(spec, ['hard', 'normal'], 20);
      expect(ne.unfinished, 'normal v easy unfinished').toBe(0);
      expect(hn.unfinished, 'hard v normal unfinished').toBe(0);
      // 2026-11-07 (n=20): normal v easy 90-100%, hard v normal 70-100% (Sumo lowest).
      expect(ne.wins, 'normal v easy').toBeGreaterThanOrEqual(0.75);
      expect(hn.wins, 'hard v normal').toBeGreaterThanOrEqual(0.6);
    }, 60_000);
  }
});
