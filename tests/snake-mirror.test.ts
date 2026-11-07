import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { DX, DY, RULES, SnakeBot, SnakeDuel, type Intent } from '../src/games/snake/logic';
import { DT, player } from './helpers';

// Store reviews of 2-player apps complain that hard bots "copy your moves" in Snake.
// Ours plans its own space (flood fill + territory), so it shouldn't: play a person with
// a fixed steering habit against the hard bot and check the bot's head almost never sits
// where the person's would be on a mirrored board.

// A person's scripted path: a turn plan per cell moved (by move count), dodging walls.
function run(seed: number, plan: (move: number) => -1 | 0 | 1) {
  const rng = makeRng(seed);
  const g = new SnakeDuel([player({}), player({ bot: 'hard' })], false, rng);
  const bot = new SnakeBot(1, 'hard', rng);
  let planned = -1;
  let t = 0;
  let mirrored = 0;
  let cells = 0;
  let round = g.round;
  while (!g.done && t < 300) {
    if (g.round !== round) { round = g.round; planned = -1; }
    const s = g.snakes[0];
    let pi: Intent = { turn: 0, power: false };
    if (g.phase === 'play' && s.alive && s.moves !== planned) {
      planned = s.moves;
      // Like a person: follow the habit, but don't steer into a wall or a trail.
      const free = (turn: number) => {
        const d = (s.dir + (turn === 1 ? 1 : turn === -1 ? 3 : 0)) % 4;
        const x = s.x + DX[d];
        const y = s.y + DY[d];
        return g.inside(x, y) && g.grid[g.idx(x, y)] === 0;
      };
      const want = plan(s.moves);
      const turn = ([want, 0, -1, 1] as const).find((k) => free(k)) ?? want;
      pi = { turn, power: false };
    }
    const bi = bot.think(g, DT);
    const moved = g.snakes[0].moves;
    g.step(DT, [pi, bi]);
    t += DT;
    const [me, it] = g.snakes;
    // Once per cell moved, after the opening run: is the bot's head where the person's
    // would be in a mirror (turned board, or flipped top to bottom)?
    if (g.phase === 'play' && me.alive && it.alive && me.moves !== moved && me.moves > 6) {
      cells++;
      const near = (x: number, y: number) => Math.abs(it.x - x) + Math.abs(it.y - y) <= 1;
      if (near(RULES.cols - 1 - me.x, RULES.rows - 1 - me.y) || near(me.x, RULES.rows - 1 - me.y)) mirrored++;
    }
  }
  return { mirrored, cells };
}

describe('hard snake does not copy the person', () => {
  it('keeps its head off the mirror of the person\'s head (turned or flipped board)', () => {
    const plans: ((m: number) => -1 | 0 | 1)[] = [
      (m) => (m % 6 === 5 ? -1 : 0),
      (m) => (m % 4 === 3 ? (m % 8 === 7 ? 1 : -1) : 0),
      (m) => (m % 5 === 4 ? 1 : 0),
    ];
    let mirrored = 0;
    let cells = 0;
    for (const [i, plan] of plans.entries()) for (const seed of [1, 2, 3, 4, 5]) {
      const r = run(100 * i + seed, plan);
      mirrored += r.mirrored;
      cells += r.cells;
    }
    expect(cells).toBeGreaterThan(200);
    // Measured 2026-11-07: 18 of 4311 cells (0.4%), all chance meetings in the middle.
    expect(mirrored / cells).toBeLessThan(0.05);
  });
});
