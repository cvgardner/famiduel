import { describe, expect, it } from 'vitest';
import { botSeat, ladder, SPECS } from '../scripts/simlib';

// F342: `npm run sim -- --ladder` plays the easy bot with head start 0-3 against normal and
// hard, so handicap tuning starts from numbers (the knob is for a parent and a young kid).
describe('sim head-start ladder', () => {
  it('reads a bot seat with a head start', () => {
    expect(botSeat('easy')).toEqual(['easy', 0]);
    expect(botSeat('easy+3')).toEqual(['easy', 3]);
    expect(botSeat('hard+1')).toEqual(['hard', 1]);
  });

  it('a full head start helps the easy bot in Quick Draw', () => {
    const spec = SPECS.find((s) => s.id === 'quickdraw')!;
    const [a0, , , a3] = ladder(spec, 'normal', 20);
    // 2026-11-15 (n=30): 0 / 3 / 37 / 77%.
    expect(a3).toBeGreaterThan(a0 + 0.3);
  }, 60_000);

  it('the first head-start star counts in Chop Chop (F351)', () => {
    const spec = SPECS.find((s) => s.id === 'chopchop')!;
    const [a0, a1, , a3] = ladder(spec, 'normal', 60);
    // 2026-11-15 (n=100): 7 / 19 / 24 / 55% (was 7 / 10 / 11 / 55% with 4/9/13 chops).
    expect(a1).toBeGreaterThan(a0 + 0.05);
    expect(a3).toBeGreaterThan(a1);
  }, 60_000);
});
