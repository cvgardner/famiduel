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
});
