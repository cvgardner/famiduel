import { describe, expect, it } from 'vitest';
import { poolPairing } from '../scripts/poollib';

// F355: Mini Pool is a turn game, so it isn't in `npm run sim` / tests/bot-levels.test.ts.
// The same bar as the action games, from `npm run pool`'s matches (seats and break swapped,
// powers off): moving a kid from Easy to Normal (or Normal to Hard) must feel like a step up.
describe('Mini Pool bot levels feel different', () => {
  it('normal beats easy and hard beats normal, and every match ends', () => {
    const ne = poolPairing('normal', 'easy', 20);
    const hn = poolPairing('hard', 'normal', 20);
    // 2026-11-21 (n=40): normal v easy 83%, hard v normal 78%, hard v easy 95%.
    expect(ne.unfinished).toBe(0);
    expect(hn.unfinished).toBe(0);
    expect(ne.wins, 'normal v easy').toBeGreaterThanOrEqual(0.75);
    expect(hn.wins, 'hard v normal').toBeGreaterThanOrEqual(0.6);
  }, 120_000);

  it('each head-start star helps the easy bot against normal (F358)', () => {
    const [a0, a1, a2, a3] = [0, 1, 2, 3].map((a) => poolPairing('easy', 'normal', 30, a).wins);
    // 2026-11-21 (n=30): easy+0..3 v normal 7 / 17 / 27 / 50%, v hard 7 / 20 / 27 / 27% with a
    // forgiven miss per star (was 8 / 15 / 23 / 23% and 5 / 3 / 0 / 10% with pockets alone).
    expect(a1).toBeGreaterThan(a0);
    expect(a2).toBeGreaterThan(a1);
    expect(a3).toBeGreaterThan(a2);
    expect(a3).toBeGreaterThanOrEqual(0.4);
  }, 180_000);

  it('two easy players finish the rack on the 8, not at the shot cap (F357)', () => {
    const r = poolPairing('easy', 'easy', 20);
    const racks = r.ends.eight + r.ends.early8 + r.ends.scratch8 + r.ends.cap;
    // 2026-11-21 (n=40): cap 40 -> 30% of easy racks ended at the cap; cap 80 -> 3%.
    expect(r.ends.cap / racks).toBeLessThanOrEqual(0.1);
  }, 120_000);

  it('a hard player rarely loses a rack by sinking the 8 early (F435)', () => {
    const r = poolPairing('hard', 'hard', 40);
    const racks = r.ends.eight + r.ends.early8 + r.ends.scratch8 + r.ends.cap;
    // 2026-11-22 (n=80): hard v hard lost 5% of racks to an early 8 (10% at n=40), every one a
    // safe plan that the hand-shake turned into a loss; shake-testing its best lines: 0%.
    expect(r.unfinished).toBe(0);
    expect((r.ends.early8 + r.ends.scratch8) / racks).toBeLessThan(0.03);
  }, 180_000);
});
