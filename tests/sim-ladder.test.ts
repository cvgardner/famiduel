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

  it('each head-start star helps the easy bot in Sumo (F345)', () => {
    const spec = SPECS.find((s) => s.id === 'sumo')!;
    const [a0, a1, a2, a3] = ladder(spec, 'normal', 80);
    // 2026-11-15 (n=160): 7 / 20 / 35 / 54% (was 7 / 14 / 18 / 33% at mass 1.3).
    expect(a1).toBeGreaterThan(a0);
    expect(a2).toBeGreaterThan(a1);
    expect(a3).toBeGreaterThan(a2);
    expect(a3).toBeGreaterThan(0.4);
  }, 60_000);

  it('each head-start star helps the easy bot in Snake (F349)', () => {
    const spec = SPECS.find((s) => s.id === 'snake')!;
    const [a0, , , a3] = ladder(spec, 'normal', 60);
    // 2026-11-15 (n=200): 9 / 15 / 22 / 61% (was 13 / 5 / 14 / 15% with walls-only at three stars).
    expect(a3).toBeGreaterThan(a0 + 0.25);
    expect(a3).toBeGreaterThan(0.4);
  }, 60_000);

  it('the first head-start stars count in Snack Snatch (F350)', () => {
    const spec = SPECS.find((s) => s.id === 'snacksnatch')!;
    const [a0, a1, a2, a3] = ladder(spec, 'normal', 60);
    // 2026-11-15 (n=100): 1 / 16 / 28 / 63% (was 1 / 3 / 17 / 63% with a straight line).
    expect(a1).toBeGreaterThan(a0 + 0.05);
    expect(a2).toBeGreaterThan(a1);
    expect(a3).toBeGreaterThan(a2);
  }, 60_000);

  it('the first head-start star counts in Chop Chop (F351)', () => {
    const spec = SPECS.find((s) => s.id === 'chopchop')!;
    const [a0, a1, , a3] = ladder(spec, 'normal', 60);
    // 2026-11-15 (n=100): 7 / 19 / 24 / 55% (was 7 / 10 / 11 / 55% with 4/9/13 chops).
    expect(a1).toBeGreaterThan(a0 + 0.05);
    expect(a3).toBeGreaterThan(a1);
  }, 60_000);
});
