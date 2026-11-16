import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { SnakeBot, SnakeDuel } from '../src/games/snake/logic';
import { DT, player } from './helpers';

/** Rounds, drawn rounds and head-ons over 20 mirror matches at `level`, powers off. */
function mirror(level: BotLevel) {
  let rounds = 0;
  let draws = 0;
  let headons = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const rng = makeRng(seed);
    const g = new SnakeDuel([player({ bot: level }), player({ bot: level })], false, rng);
    const bots = [new SnakeBot(0, level, rng), new SnakeBot(1, level, rng)];
    for (let t = 0; !g.done && t < 400; t += DT) {
      g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
      for (const e of g.events) {
        if (e.type === 'headon') headons++;
        if (e.type === 'roundEnd') {
          rounds++;
          if (e.winner === null) draws++;
        }
      }
    }
  }
  return { rounds, draws: draws / rounds, headons: headons / rounds };
}

// F327: two hard snakes charged the middle for territory and met head-on in ~40% of
// rounds (half of all rounds drawn, matches ran to the 9-round cap), and a rival app's
// review says its hard snake "makes it impossible to win or lose". The hard bot now
// shies away from a head-on, including the cell a turn locks it into.
describe('snake: hard bots settle rounds', () => {
  it('two hard bots rarely draw a round and never meet head-on', () => {
    const r = mirror('hard');
    // 2026-11-15 (40 matches): head-ons 0, drawn rounds 7.7% (both trapped the same tick); was 40% / 52%.
    expect(r.headons, 'head-on share of rounds').toBeLessThan(0.03);
    expect(r.draws, 'drawn share of rounds').toBeLessThan(0.15);
  }, 60_000);
});
