import { describe, expect, it } from 'vitest';
import { RULES } from '../src/games/pingpong/logic';
import { playMatch, SPECS } from '../scripts/simlib';

// F324: `npm run sim -- --idle` also plays both seats idle. An idle seat must play like a
// person who walked away: in Ping Pong that's a paddle resting on its own line (the app
// sends no lunge without a finger), not one dragged to the finger spot at H * 0.75, which
// missed every serve and made two idle players' matches end on their own in the sim while
// the app rallied forever (F322).
describe('sim: both seats idle', () => {
  it('Ping Pong idle paddles stay on their lines', () => {
    const spec = SPECS.find((s) => s.id === 'pingpong')!;
    let off = 0;
    playMatch(spec, ['idle', 'idle'], 1000, false, [null, null], (g) => {
      const paddles = (g as unknown as { paddles: { y: number }[] }).paddles;
      for (const p of [0, 1]) if (Math.abs(paddles[p].y - RULES.paddleY[p]) > 0.5) off++;
    });
    expect(off).toBe(0);
  }, 60_000);

  it('Air Hockey and Sumo still never end with nobody playing (the app pauses them)', () => {
    for (const id of ['airhockey', 'sumo']) {
      const r = playMatch(SPECS.find((s) => s.id === id)!, ['idle', 'idle'], 1000);
      expect(r.finished, id).toBe(false);
    }
  }, 60_000);
});
