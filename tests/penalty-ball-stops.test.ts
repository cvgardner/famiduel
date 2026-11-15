import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { H, W } from '../src/engine/world';
import { DIVE_R_BIG } from '../src/games/penalty/index';
import { Penalty, PenaltyBot, RULES } from '../src/games/penalty/logic';
import { player } from './helpers';

const DT = 1 / 60;
/** The keeper's dive buttons sit 52 units in from that keeper's end (DIVE_Y). */
const BUTTON_EDGE = 52 + DIVE_R_BIG;

// F267: a goal's ball rolled on through the back of the 30-deep net and stopped on the keeper's
// right arrow (solo-round-penalty.png). F268: a wide or over shot rolled ~130 units past the
// goal line, over the keeper's buttons. A goal now stops in the net, a miss short of the buttons.
describe('Penalty: where the ball stops after a kick', () => {
  const counts = { goal: 0, miss: 0 };
  for (const level of ['easy', 'normal', 'hard'] as BotLevel[]) {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      it(`${level} bots, seed ${seed}: the ball stays in the net or short of the buttons`, () => {
        const rng = makeRng(seed);
        const g = new Penalty([player({ bot: level }), player({ bot: level })], false, rng);
        const bots = [new PenaltyBot(0, level, rng), new PenaltyBot(1, level, rng)];
        let steps = 0;
        while (g.phase !== 'done' && steps++ < 60 * 400) {
          g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
          if (g.phase !== 'result') continue;
          const k = g.keeper;
          const line = RULES.goalY[k];
          const past = (g.ball.y - line) * (k === 0 ? 1 : -1);
          const end = k === 0 ? H - g.ball.y : g.ball.y;
          expect(end - RULES.ballR).toBeGreaterThan(BUTTON_EDGE);
          expect(g.ball.x).toBeGreaterThanOrEqual(8 + RULES.ballR);
          expect(g.ball.x).toBeLessThanOrEqual(W - 8 - RULES.ballR);
          if (g.lastResult === 'goal') {
            counts.goal++;
            expect(past).toBeLessThanOrEqual(RULES.netDepth - RULES.ballR + 1e-6);
            expect(Math.abs(g.ball.x - W / 2)).toBeLessThanOrEqual(g.goalW() / 2);
          } else if (past > 0) counts.miss++;
        }
        expect(g.phase).toBe('done');
      });
    }
  }
  it('saw goals and misses', () => {
    expect(counts.goal).toBeGreaterThan(0);
    expect(counts.miss).toBeGreaterThan(0);
  });
});
