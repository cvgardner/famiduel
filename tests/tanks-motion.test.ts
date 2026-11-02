import { describe, expect, it } from 'vitest';
import type { BotLevel } from '../src/core/types';
import { measureSteerLevel } from '../src/games/tanks/motion';

// The motion check for the stick game (backlog: "run the motion check on the other
// real-time bots"). Before this fix the bot wagged its tank, turning one way and
// straight back within 0.35 s, 0.4 (easy) to 1.1 (hard) times a second: it re-rolled
// its aim wobble on every look while lining up, and after each shot it turned away to
// drive, then turned back for the next. Now it's 0.2-0.3 / s. `npm run motion`.
describe('tank bot steers like a thumb on a stick', () => {
  for (const level of ['easy', 'normal', 'hard'] as BotLevel[]) {
    it(`${level}: few wags`, () => {
      const r = measureSteerLevel(level, 6);
      expect(r.seconds).toBeGreaterThan(100);
      expect(r.wagsPerSec, 'wags / s').toBeLessThan(0.45);
      expect(r.reversalsPerSec, 'turn reversals / s').toBeLessThan(1.8);
    }, 60_000);
  }
});
