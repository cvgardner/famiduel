import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { flood, RULES, SnakeBot, SnakeDuel, type Intent } from '../src/games/snake/logic';
import { DT, player, power } from './helpers';

const idle: Intent = { turn: 0, power: false };

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: [string, string]; assist?: [number, number] } = {}) {
  const rng = makeRng(seed);
  const pw = (i: number) => (opts.powers ? power('snake', opts.powers[i]) : null);
  const g = new SnakeDuel(
    [player({ bot: levels[0], power: pw(0), assist: opts.assist?.[0] ?? 0 }), player({ bot: levels[1], power: pw(1), assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    rng,
  );
  const bots = [new SnakeBot(0, levels[0], rng), new SnakeBot(1, levels[1], rng)];
  let t = 0;
  let powersFired = 0;
  while (!g.done && t < 900) {
    g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
    powersFired += g.events.filter((e) => e.type === 'power').length;
    t += DT;
  }
  return { g, t, powersFired };
}

function fresh(opts: { assist?: [number, number]; powers?: [string, string] } = {}) {
  const pw = (i: number) => (opts.powers ? power('snake', opts.powers[i]) : null);
  const g = new SnakeDuel([player({ assist: opts.assist?.[0] ?? 0, power: pw(0) }), player({ assist: opts.assist?.[1] ?? 0, power: pw(1) })], !!opts.powers, makeRng(5));
  while (g.phase !== 'play') g.step(DT, [idle, idle]);
  return g;
}

describe('snake duel', () => {
  it('bot vs bot finishes a best-of-5 in sane time', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { g, t } = play(['normal', 'normal'], seed);
      expect(g.done).toBe(true);
      expect(g.round).toBeLessThanOrEqual(RULES.maxRounds);
      if (g.winner !== null) expect(g.score[g.winner]).toBe(RULES.winRounds);
      expect(t).toBeLessThan(300);
    }
  });

  it('is deterministic for a seed', () => {
    const a = play(['hard', 'easy'], 9);
    const b = play(['hard', 'easy'], 9);
    expect(a.g.score).toEqual(b.g.score);
    expect(a.t).toBe(b.t);
  });

  it('a hard bot beats an easy bot most of the time', () => {
    let wins = 0;
    for (let s = 0; s < 8; s++) if (play(['hard', 'easy'], 200 + s).g.winner === 0) wins++;
    expect(wins).toBeGreaterThanOrEqual(6);
  });

  it('turning is relative to the snake', () => {
    const g = fresh();
    expect(g.snakes[0].dir).toBe(0); // up
    expect(g.snakes[1].dir).toBe(2); // down
    g.step(DT, [{ turn: -1, power: false }, { turn: -1, power: false }]);
    while (g.snakes[0].moves === 0) g.step(DT, [idle, idle]);
    expect(g.snakes[0].dir).toBe(3); // player 0's left is screen left
    expect(g.snakes[1].dir).toBe(1); // player 1 faces down, so their left is screen right
  });

  it('crashing into a wall loses the round; head-on is a draw round', () => {
    const g = fresh();
    g.snakes[1].x = 3; g.snakes[1].y = 3; g.snakes[1].dir = 2; // keep player 1 out of the way
    g.snakes[0].x = 0; g.snakes[0].dir = 3; // facing the left wall
    g.grid.fill(0);
    while (g.phase === 'play') g.step(DT, [idle, idle]);
    expect(g.lastRound).toBe(1);
    expect(g.score).toEqual([0, 1]);
    const h = fresh();
    h.grid.fill(0);
    Object.assign(h.snakes[0], { x: 10, y: 20, dir: 1, acc: 0 });
    Object.assign(h.snakes[1], { x: 12, y: 20, dir: 3, acc: 0 });
    while (h.phase === 'play') h.step(DT, [idle, idle]);
    expect(h.lastRound).toBeNull();
    expect(h.score).toEqual([0, 0]);
  });

  it('assist slows the snake and turns it away from walls at assist 3', () => {
    const g = fresh({ assist: [3, 0] });
    expect(g.speed(0)).toBeCloseTo(g.speed(1) * RULES.assistSpeed);
    g.snakes[0].y = 1; // two cells from the top wall, heading up
    for (let i = 0; i < 120 && g.phase === 'play'; i++) g.step(DT, [idle, idle]);
    expect(g.snakes[0].alive).toBe(true);
    expect([1, 3]).toContain(g.snakes[0].dir);
    const n = fresh({ assist: [1, 0] });
    n.snakes[0].y = 1;
    while (n.phase === 'play') n.step(DT, [idle, idle]);
    expect(n.snakes[0].alive).toBe(false);
  });

  it('speed boost makes the snake faster', () => {
    const g = fresh({ powers: ['boost', 'boost'] });
    const before = g.speed(0);
    g.energy[0].value = 1;
    g.step(DT, [{ turn: 0, power: true }, idle]);
    expect(g.speed(0)).toBeCloseTo(before * RULES.boostMult, 1);
  });

  it('phase passes through one trail, then wears off', () => {
    const g = fresh({ powers: ['phase', 'phase'] });
    g.grid.fill(0);
    Object.assign(g.snakes[1], { x: 2, y: 2, dir: 2 });
    Object.assign(g.snakes[0], { x: 10, y: 30, dir: 0, acc: 0 });
    for (let x = 0; x < RULES.cols; x++) {
      g.grid[g.idx(x, 27)] = 2;
      g.grid[g.idx(x, 24)] = 2;
    }
    g.energy[0].value = 1;
    g.step(DT, [{ turn: 0, power: true }, idle]);
    while (g.phase === 'play') g.step(DT, [idle, idle]);
    // Crossed the first wall of trail at row 27, crashed into the second at row 24.
    expect(g.lastRound).toBe(1);
    expect(g.snakes[0].y).toBe(25);
  });

  it('trail bomb clears trails around the head', () => {
    const g = fresh({ powers: ['bomb', 'bomb'] });
    const s = g.snakes[0];
    for (let y = s.y - 2; y <= s.y + 2; y++) for (let x = s.x - 2; x <= s.x + 2; x++) g.grid[g.idx(x, y)] = 2;
    g.energy[0].value = 1;
    g.step(DT, [{ turn: 0, power: true }, idle]);
    expect(g.events.some((e) => e.type === 'bomb')).toBe(true);
    expect(g.grid[g.idx(s.x, s.y - 1)]).toBe(0);
    expect(flood(g, s.x, s.y - 1, 100)).toBeGreaterThan(20);
  });

  it('bots use powers and still finish', () => {
    const { g, powersFired } = play(['normal', 'normal'], 11, { powers: ['bomb', 'phase'] });
    expect(g.done).toBe(true);
    expect(powersFired).toBeGreaterThan(0);
  });
});
