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

  it('each head-start star helps the easy bot in Snake (F349)', () => {
    const spec = SPECS.find((s) => s.id === 'snake')!;
    const [a0, , , a3] = ladder(spec, 'normal', 60);
    // 2026-11-15 (n=200): 9 / 15 / 22 / 61% (was 13 / 5 / 14 / 15% with walls-only at three stars).
    expect(a3).toBeGreaterThan(a0 + 0.25);
    expect(a3).toBeGreaterThan(0.4);
  }, 60_000);
});
