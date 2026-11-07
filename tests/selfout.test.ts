import { describe, expect, it } from 'vitest';
import { playMatch, SPECS } from '../scripts/simlib';
import { selfOutCounter, SUMO_FREE } from '../scripts/selfout';

describe('self-out counter (npm run sim -- --selfout)', () => {
  it('Snake: a wall or your own trail is a self-out, the other snake\'s trail is not', () => {
    const c = selfOutCounter('snake')!;
    const grid = new Uint8Array(4);
    grid[1] = 1; // seat 0's trail
    grid[2] = 2; // seat 1's trail
    const g = { grid, idx: (x: number) => x } as never;
    c.observe(g, [{ type: 'crash', p: 0, wall: true, x: 0, y: 0 }]);
    c.observe(g, [{ type: 'crash', p: 0, wall: false, x: 1, y: 0 }]);
    c.observe(g, [{ type: 'crash', p: 0, wall: false, x: 2, y: 0 }]);
    expect(c.tally).toEqual({ lost: [3, 0], self: [2, 0] });
  });

  it('Sumo: off the ring untouched for over a second is a self-out, pushed out is not', () => {
    const c = selfOutCounter('sumo')!;
    const w = [{ freeT: SUMO_FREE + 0.5 }, { freeT: 0.2 }];
    c.observe({ wrestlers: w } as never, [{ type: 'out', p: 0 }, { type: 'out', p: 1 }]);
    expect(c.tally).toEqual({ lost: [1, 1], self: [1, 0] });
    expect(selfOutCounter('pingpong')).toBeNull();
  });

  it('reads the real games\' events: every lost round is counted', () => {
    for (const id of ['snake', 'sumo']) {
      const spec = SPECS.find((s) => s.id === id)!;
      const c = selfOutCounter(id)!;
      const r = playMatch(spec, ['easy', 'easy'], 1001, false, [null, null], c.observe as never);
      expect(r.finished, id).toBe(true);
      const lost = c.tally.lost[0] + c.tally.lost[1];
      expect(lost, `${id}: rounds lost`).toBeGreaterThan(0);
      for (const p of [0, 1]) expect(c.tally.self[p]).toBeLessThanOrEqual(c.tally.lost[p]);
    }
  });

  it('a mashing kid in Sumo mostly walks off by themselves (the reason for the head start)', () => {
    const spec = SPECS.find((s) => s.id === 'sumo')!;
    let lost = 0, self = 0;
    for (let i = 0; i < 4; i++) {
      const c = selfOutCounter('sumo')!;
      playMatch(spec, ['kid', 'easy'], 1000 + i, false, [null, null], c.observe as never);
      lost += c.tally.lost[0];
      self += c.tally.self[0];
    }
    expect(lost).toBeGreaterThan(0);
    expect(self / lost).toBeGreaterThan(0.5);
  });
});
