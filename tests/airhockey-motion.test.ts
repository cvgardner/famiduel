import { describe, expect, it } from 'vitest';
import { MotionTrace } from '../src/core/motion';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { AirHockey, AirHockeyBot, RULES } from '../src/games/airhockey/logic';
import { measureLevel } from '../src/games/airhockey/motion';
import { DT, player } from './helpers';

// Chris (Nov 2026): the Air Hockey bot looked "super spazzy". Measured before the fix,
// every level flipped direction ~9 times a second, twitched (undid a move within
// 0.18 s) ~7 times a second, snapped harder than a finger can on ~30% of frames and
// wobbled on the spot ~45% of the time. These limits fail that bot. `npm run motion`
// prints the numbers.
describe('air hockey bot moves like a person', () => {
  for (const level of ['easy', 'normal', 'hard'] as BotLevel[]) {
    it(`${level}: smooth paddle path`, () => {
      const r = measureLevel(level, 4);
      expect(r.seconds).toBeGreaterThan(300);
      expect(r.flipsPerSec, 'direction flips / s').toBeLessThan(3);
      expect(r.twitchesPerSec, 'twitches / s').toBeLessThan(0.6);
      expect(r.harshShare, 'harsh snaps').toBeLessThan(0.05);
      expect(r.wobbleShare, 'wobble').toBeLessThan(0.25);
    });
  }

  it('the hand is never faster than a person may move the paddle', () => {
    const rng = makeRng(5);
    const g = new AirHockey([player({ bot: 'hard' }), player({ bot: 'hard' })], false, rng);
    const bots = [new AirHockeyBot(0, 'hard', rng), new AirHockeyBot(1, 'hard', rng)];
    let prev = [0, 1].map((p) => ({ x: g.paddles[p].x, y: g.paddles[p].y }));
    for (let i = 0; i < 60 * 60 && g.winner === null; i++) {
      const a = bots[0].think(g, DT);
      const b = bots[1].think(g, DT);
      // The intent itself (the bot's finger) moves no faster than the paddle cap.
      for (const [p, it] of [a, b].entries()) {
        expect(Math.hypot(it.tx - prev[p].x, it.ty - prev[p].y) / DT).toBeLessThanOrEqual(RULES.maxPaddleSpeed + 1);
      }
      g.step(DT, [a, b]);
      prev = [0, 1].map((p) => ({ x: g.paddles[p].x, y: g.paddles[p].y }));
    }
  });

  it('the motion check catches a twitchy paddle and passes a smooth one', () => {
    const twitchy = new MotionTrace();
    const smooth = new MotionTrace();
    for (let i = 0; i < 600; i++) {
      twitchy.record(180 + (i % 6 < 3 ? 1 : -1) * 20, 500, DT); // shakes left-right 10x a second
      smooth.record(180 + 100 * Math.sin(i * DT * 2), 500 + 40 * Math.cos(i * DT * 2), DT);
    }
    const t = twitchy.report();
    const s = smooth.report();
    expect(t.flipsPerSec).toBeGreaterThan(10);
    expect(t.twitchesPerSec).toBeGreaterThan(5);
    expect(t.wobbleShare).toBeGreaterThan(0.9);
    expect(s.flipsPerSec).toBeLessThan(1);
    expect(s.twitchesPerSec).toBe(0);
    expect(s.wobbleShare).toBe(0);
    expect(s.harshShare).toBe(0);
  });
});
