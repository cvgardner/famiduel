import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { PingPong, PingPongBot, RULES } from '../src/games/pingpong/logic';
import { measureLevel } from '../src/games/pingpong/motion';
import { DT, player } from './helpers';

// Same check as the Air Hockey bot (Chris, Nov 2026: "super spazzy"). Measured before
// the hand, the Ping Pong bot's paddle went from still to full speed (or reversed) in
// one frame on 8-9% of moving frames, every time the ball changed direction, because
// it jumped straight to each new target. A finger can't do that. `npm run motion`.
describe('ping pong bot moves like a person', () => {
  for (const level of ['easy', 'normal', 'hard'] as BotLevel[]) {
    it(`${level}: smooth paddle path`, () => {
      const r = measureLevel(level, 4);
      expect(r.seconds).toBeGreaterThan(200);
      expect(r.flipsPerSec, 'direction flips / s').toBeLessThan(3);
      expect(r.twitchesPerSec, 'twitches / s').toBeLessThan(0.6);
      expect(r.harshShare, 'harsh snaps').toBeLessThan(0.05);
      expect(r.wobbleShare, 'wobble').toBeLessThan(0.25);
    });
  }

  it('the finger never moves faster than the paddle cap', () => {
    const rng = makeRng(9);
    const g = new PingPong([player({ bot: 'hard' }), player({ bot: 'hard' })], false, rng);
    const bots = [new PingPongBot(0, 'hard', rng), new PingPongBot(1, 'hard', rng)];
    let prev: { tx: number; ty?: number }[] | null = null;
    for (let i = 0; i < 60 * 60 && g.winner === null; i++) {
      const a = bots[0].think(g, DT);
      const b = bots[1].think(g, DT);
      // The intent is the bot's finger: frame to frame it moves no faster than a paddle may.
      if (prev && g.pointT <= 0) {
        for (const [p, it] of [a, b].entries()) {
          expect(Math.abs(it.tx - prev[p].tx) / DT).toBeLessThanOrEqual(RULES.paddleSpeed + 1);
          expect(Math.abs((it.ty ?? 0) - (prev[p].ty ?? 0)) / DT).toBeLessThanOrEqual(RULES.paddleSpeed + 1);
        }
      }
      prev = g.pointT > 0 ? null : [a, b];
      g.step(DT, [a, b]);
    }
  });
});
