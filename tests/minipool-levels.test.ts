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

  it('a full head start helps the easy bot against normal', () => {
    const a0 = poolPairing('easy', 'normal', 20, 0).wins;
    const a3 = poolPairing('easy', 'normal', 20, 3).wins;
    // 2026-11-21 (n=40): easy+0..3 v normal 8 / 15 / 23 / 23%.
    expect(a3).toBeGreaterThan(a0);
  }, 120_000);

  it('two easy players finish the rack on the 8, not at the shot cap (F357)', () => {
    const r = poolPairing('easy', 'easy', 20);
    const racks = r.ends.eight + r.ends.early8 + r.ends.scratch8 + r.ends.cap;
    // 2026-11-21 (n=40): cap 40 -> 30% of easy racks ended at the cap; cap 80 -> 3%.
    expect(r.ends.cap / racks).toBeLessThanOrEqual(0.1);
  }, 120_000);
});
