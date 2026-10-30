import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { ChopBot, ChopChop, RULES, type Intent } from '../src/games/chopchop/logic';
import { DT, player, power } from './helpers';

const idle: Intent = { chop: 0, power: false };

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: [string, string]; assist?: [number, number] } = {}) {
  const rng = makeRng(seed);
  const pw = (i: number) => (opts.powers ? power('chopchop', opts.powers[i]) : null);
  const g = new ChopChop(
    [player({ bot: levels[0], power: pw(0), assist: opts.assist?.[0] ?? 0 }), player({ bot: levels[1], power: pw(1), assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    rng,
  );
  const bots = [new ChopBot(0, levels[0], rng), new ChopBot(1, levels[1], rng)];
  let t = 0;
  let powersFired = 0;
  while (!g.done && t < 600) {
    g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
    powersFired += g.events.filter((e) => e.type === 'power').length;
    t += DT;
  }
  return { g, t, powersFired };
}

function fresh(opts: { assist?: [number, number]; powers?: [string, string] } = {}) {
  const pw = (i: number) => (opts.powers ? power('chopchop', opts.powers[i]) : null);
  const g = new ChopChop([player({ assist: opts.assist?.[0] ?? 0, power: pw(0) }), player({ assist: opts.assist?.[1] ?? 0, power: pw(1) })], !!opts.powers, makeRng(3));
  while (g.phase !== 'play') g.step(DT, [idle, idle]);
  return g;
}

/** A safe side to chop for player p right now. */
function safe(g: ChopChop, p: 0 | 1): -1 | 1 {
  const c = g.choppers[p];
  return g.branch(p, c.idx) !== -1 && g.branch(p, c.idx + 1) !== -1 ? -1 : 1;
}

describe('chop chop', () => {
  it('bot vs bot finishes in sane time', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { g, t } = play(['normal', 'normal'], seed);
      expect(g.done).toBe(true);
      if (g.winner !== null) expect(g.score[g.winner]).toBe(RULES.winRounds);
      expect(t).toBeLessThan(200);
    }
  });

  it('is deterministic for a seed', () => {
    const a = play(['hard', 'easy'], 5);
    const b = play(['hard', 'easy'], 5);
    expect(a.g.score).toEqual(b.g.score);
    expect(a.t).toBe(b.t);
  });

  it('a hard bot beats an easy bot most of the time', () => {
    let wins = 0;
    for (let s = 0; s < 10; s++) if (play(['hard', 'easy'], 40 + s).g.winner === 0) wins++;
    expect(wins).toBeGreaterThanOrEqual(8);
  });

  it('both trees share one branch pattern, and every pattern is survivable', () => {
    const g = fresh();
    expect(g.branch(0, 7)).toBe(g.branch(1, 7));
    for (let i = 0; i + 1 < g.pattern.length; i++) if (g.pattern[i] !== 0) expect(g.pattern[i + 1]).toBe(0);
  });

  it('a branch on your side when it reaches you bonks you, and the other player wins', () => {
    const g = fresh();
    const c = g.choppers[0];
    // Find the first segment with a branch, chop safely until it is one above, then chop on its side.
    let n = 0;
    while (g.branch(0, c.idx + 1) === 0 && n++ < 100) g.step(DT, [{ chop: safe(g, 0), power: false }, idle]);
    const bad = g.branch(0, c.idx + 1) as -1 | 1;
    g.step(DT, [{ chop: bad, power: false }, idle]);
    expect(c.out).toBe(true);
    expect(c.outReason).toBe('bonk');
    expect(g.lastRound).toBe(1);
  });

  it('timer runs out without chopping; assist slows the drain', () => {
    const g = fresh({ assist: [3, 0] });
    expect(g.drain(0)).toBeCloseTo(g.drain(1) * RULES.assistDrain);
    let n = 0;
    while (g.phase === 'play' && n++ < 2000) g.step(DT, [idle, idle]);
    expect(g.choppers[1].outReason).toBe('time');
    expect(g.lastRound).toBe(0); // the assisted player lasted longer
  });

  it('first to 50 chops wins the round', () => {
    const g = fresh();
    let n = 0;
    while (g.phase === 'play' && n++ < 400) g.step(DT, [{ chop: safe(g, 0), power: false }, idle]);
    expect(g.choppers[0].chops).toBe(RULES.goal);
    expect(g.lastRound).toBe(0);
  });

  it('branch shield breaks the next branch instead of bonking', () => {
    const g = fresh({ powers: ['shield', 'shield'] });
    const c = g.choppers[0];
    g.energy[0].value = 1;
    g.step(DT, [{ chop: 0, power: true }, idle]);
    expect(c.shield).toBe(true);
    let n = 0;
    while (g.branch(0, c.idx + 1) === 0 && n++ < 100) g.step(DT, [{ chop: safe(g, 0), power: false }, idle]);
    const bad = g.branch(0, c.idx + 1) as -1 | 1;
    g.step(DT, [{ chop: bad, power: false }, idle]);
    expect(c.out).toBe(false);
    expect(c.shield).toBe(false);
    expect(g.events.some((e) => e.type === 'shieldBreak')).toBe(true);
  });

  it('freeze tree stops the other player chopping for 1 s', () => {
    const g = fresh({ powers: ['freeze', 'freeze'] });
    g.energy[0].value = 1;
    g.step(DT, [{ chop: 0, power: true }, idle]);
    const c = g.choppers[1];
    expect(c.frozen).toBeGreaterThan(0.9);
    g.step(DT, [idle, { chop: safe(g, 1), power: false }]);
    expect(c.chops).toBe(0);
    for (let i = 0; i < 62; i++) g.step(DT, [idle, idle]);
    g.step(DT, [idle, { chop: safe(g, 1), power: false }]);
    expect(c.chops).toBe(1);
  });

  it('double chop counts each tap twice', () => {
    const g = fresh({ powers: ['double', 'double'] });
    g.energy[0].value = 1;
    g.step(DT, [{ chop: 0, power: true }, idle]);
    g.step(DT, [{ chop: safe(g, 0), power: false }, idle]);
    expect(g.choppers[0].chops).toBe(2);
    expect(g.choppers[0].idx).toBe(1);
  });

  it('bots use powers', () => {
    expect(play(['normal', 'normal'], 8, { powers: ['freeze', 'double'] }).powersFired).toBeGreaterThan(0);
  });
});
