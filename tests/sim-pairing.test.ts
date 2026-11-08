import { describe, expect, it } from 'vitest';
import { pairing, powersOf, SPECS } from '../scripts/simlib';

// F102: pairing() plays every seed both ways round, so a power pair read from either side
// adds up (the old alternate-seed swap let seed parity decide: Quick Draw rows summed past 100%).
describe('sim pairing plays each seed from both seats', () => {
  for (const id of ['quickdraw', 'sumo']) {
    it(`${id}: A vs B and B vs A add up to the decided matches`, () => {
      const spec = SPECS.find((s) => s.id === id)!;
      const [a, b] = powersOf(id);
      const ab = pairing(spec, ['normal', 'normal'], 8, true, [a, b]);
      const ba = pairing(spec, ['normal', 'normal'], 8, true, [b, a]);
      expect(ab.wins + ba.wins).toBeCloseTo(1 - ab.draws - ab.unfinished, 9);
      // Same seeds, so the seat split is a mirror too.
      expect(ab.draws).toBe(ba.draws);
    }, 60_000);
  }
});
