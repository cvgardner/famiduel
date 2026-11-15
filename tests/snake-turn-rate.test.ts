import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { SnakeBot, SnakeDuel } from '../src/games/snake/logic';
import { DT, player } from './helpers';

/** Turns a second by `level` (bottom seat) against a normal bot, over 20 matches, while alive in play. */
function turnRate(level: BotLevel): number {
  let turns = 0;
  let t = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const rng = makeRng(seed);
    const g = new SnakeDuel([player({ bot: level }), player({ bot: 'normal' })], false, rng);
    const bots = [new SnakeBot(0, level, rng), new SnakeBot(1, 'normal', rng)];
    for (let tt = 0; !g.done && tt < 300; tt += DT) {
      const i0 = bots[0].think(g, DT);
      const i1 = bots[1].think(g, DT);
      if (g.phase === 'play' && g.snakes[0].alive) {
        t += DT;
        if (i0.turn !== 0) turns++;
      }
      g.step(DT, [i0, i1]);
    }
  }
  return turns / t;
}

// F281: the 2026-11-01 backlog worried the hard bot (it re-plans territory every cell) turns
// about 3x as often as easy/normal and could look twitchy. Measured: easy 0.41, normal 0.50,
// hard 0.77 turns a second (snakes move ~9 cells a second), so hard turns more but calmly.
// Guard it: a bot that turned 2+ times a second would read as jittery to a kid.
describe('Snake bots turn at a calm pace', () => {
  it('hard turns more than easy, but under 1.5 turns a second', () => {
    const easy = turnRate('easy');
    const hard = turnRate('hard');
    expect(hard).toBeGreaterThan(easy);
    expect(hard).toBeLessThan(1.5);
  }, 120_000);
});
