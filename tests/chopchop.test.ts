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
  it('F153: round 1 starts at GO (the runner counted down) and a chop on the first step counts; later rounds keep the card', () => {
    const g = new ChopChop([player(), player()], false, makeRng(3));
    const c = g.choppers[0];
    const side = g.branch(0, 0) !== -1 && g.branch(0, 1) !== -1 ? -1 : 1;
    g.step(DT, [{ chop: side, power: false }, idle]);
    expect(g.phase).toBe('play');
    expect(c.chops).toBe(1);
    expect(g.events.some((e) => e.type === 'roundStart')).toBe(true);
    // Round 2 still opens with its "Round 2" card for RULES.intro seconds.
    let n = 0;
    while (g.round === 1 && n++ < 20000) g.step(DT, [idle, idle]);
    expect(g.round).toBe(2);
    expect(g.phase).toBe('intro');
    expect(g.phaseT).toBeGreaterThan(RULES.intro - 2 * DT);
  });

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

  // F343: the head start only slowed the timer, but rounds end on a bonk or the race to 50,
  // so easy+3 v normal stayed 3% and a mashing kid+3 never beat easy. It now also starts the
  // count ahead and forgives a few branches a round.
  it('head start: a few chops ahead and a branch per star forgiven each round', () => {
    const g = fresh({ assist: [3, 1] });
    expect(g.choppers[0].chops).toBe(RULES.assistChops[3]);
    expect(g.choppers[1].chops).toBe(RULES.assistChops[1]);
    expect(RULES.assistChops[1]).toBeGreaterThan(0);
    expect([g.spareFor(0), g.spareFor(1)]).toEqual([RULES.assistSpare, 1]);
    const c = g.choppers[0];
    const saves: boolean[] = [];
    for (let k = 0; k < RULES.assistSpare; k++) {
      let n = 0;
      while (g.branch(0, c.idx + 1) === 0 && n++ < 100) g.step(DT, [{ chop: safe(g, 0), power: false }, idle]);
      g.step(DT, [{ chop: g.branch(0, c.idx + 1) as -1 | 1, power: false }, idle]);
      saves.push(g.events.some((e) => e.type === 'shieldBreak' && e.spare));
      expect(c.out).toBe(false);
    }
    expect(saves).toEqual([true, true, true]);
    expect(c.spare).toBe(0);
    let n = 0;
    while (g.branch(0, c.idx + 1) === 0 && n++ < 100) g.step(DT, [{ chop: safe(g, 0), power: false }, idle]);
    g.step(DT, [{ chop: g.branch(0, c.idx + 1) as -1 | 1, power: false }, idle]);
    expect(c.outReason).toBe('bonk');
  });

  it('no head start: no spare branches, count starts at 0', () => {
    const g = fresh();
    expect(g.choppers[0].chops).toBe(0);
    expect(g.choppers[0].spare).toBe(0);
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

  it('branch shield breaks branches instead of bonking, for its next 12 chops', () => {
    const g = fresh({ powers: ['shield', 'shield'] });
    const c = g.choppers[0];
    g.energy[0].value = 1;
    g.step(DT, [{ chop: 0, power: true }, idle]);
    expect(RULES.shield).toBe(12);
    expect(c.shield).toBe(12);
    // A count, not seconds: standing still (or frozen) doesn't use it up.
    for (let i = 0; i < 120; i++) g.step(DT, [idle, idle]);
    expect(c.shield).toBe(12);
    let n = 0;
    while (g.branch(0, c.idx + 1) === 0 && n++ < 100) g.step(DT, [{ chop: safe(g, 0), power: false }, idle]);
    const left = c.shield;
    const bad = g.branch(0, c.idx + 1) as -1 | 1;
    g.step(DT, [{ chop: bad, power: false }, idle]);
    expect(c.out).toBe(false);
    expect(g.events.some((e) => e.type === 'shieldBreak')).toBe(true);
    expect(c.shield).toBe(left - 1);
    // Still shielded: mashing one side breaks every branch on it until the chops run out.
    const side = c.side;
    let breaks = 0;
    let chops = 0;
    while (c.shield > 0 && !c.out) {
      g.step(DT, [{ chop: side, power: false }, idle]);
      if (g.events.some((e) => e.type === 'chop')) chops++;
      if (g.events.some((e) => e.type === 'shieldBreak')) breaks++;
    }
    expect(c.out).toBe(false);
    expect(chops).toBe(left - 1);
    expect(breaks).toBeGreaterThan(0);
    // Once it's gone, a branch bonks again.
    n = 0;
    while (g.branch(0, c.idx + 1) === 0 && n++ < 100) g.step(DT, [{ chop: safe(g, 0), power: false }, idle]);
    g.step(DT, [{ chop: g.branch(0, c.idx + 1) as -1 | 1, power: false }, idle]);
    expect(c.out).toBe(true);
  });

  it("freeze tree: the other player's next 3 taps only crack the ice", () => {
    const g = fresh({ powers: ['freeze', 'freeze'] });
    g.energy[0].value = 1;
    g.step(DT, [{ chop: 0, power: true }, idle]);
    const c = g.choppers[1];
    expect(RULES.freeze).toBe(3);
    expect(c.frozen).toBe(3);
    // A count, not seconds: waiting doesn't thaw it.
    for (let i = 0; i < 120; i++) g.step(DT, [idle, idle]);
    expect(c.frozen).toBe(3);
    for (let k = 0; k < 3; k++) {
      g.step(DT, [idle, { chop: safe(g, 1), power: false }]);
      expect(g.events.some((e) => e.type === 'frozenTap')).toBe(true);
      expect(c.chops).toBe(0);
      for (let i = 0; i < 10; i++) g.step(DT, [idle, idle]);
    }
    expect(c.frozen).toBe(0);
    g.step(DT, [idle, { chop: safe(g, 1), power: false }]);
    expect(c.chops).toBe(1);
  });

  it('double chop counts the next 4 chops twice, then stops', () => {
    const g = fresh({ powers: ['double', 'double'] });
    g.energy[0].value = 1;
    g.step(DT, [{ chop: 0, power: true }, idle]);
    for (let i = 0; i < 6; i++) {
      for (let k = 0; k < 20; k++) g.step(DT, [idle, idle]);
      g.step(DT, [{ chop: safe(g, 0), power: false }, idle]);
    }
    expect(g.choppers[0].idx).toBe(6);
    expect(g.choppers[0].chops).toBe(4 * 2 + 2);
  });

  it("double chop's bonus chops don't speed up your own timer (F130)", () => {
    // Both seats make the same 6 chops; seat 0's count twice for 4 of them. The timer
    // drains by the chops you've made, so both bars drain alike.
    const g = fresh({ powers: ['double', 'double'] });
    g.energy[0].value = 1;
    g.step(DT, [{ chop: 0, power: true }, idle]);
    for (let i = 0; i < 6; i++) {
      for (let k = 0; k < 20; k++) g.step(DT, [idle, idle]);
      g.step(DT, [{ chop: safe(g, 0), power: false }, { chop: safe(g, 1), power: false }]);
    }
    expect(g.choppers[0].chops).toBeGreaterThan(g.choppers[1].chops);
    expect(g.drain(0)).toBeCloseTo(g.drain(1), 9);
  });

  it('bots use powers', () => {
    expect(play(['normal', 'normal'], 8, { powers: ['freeze', 'double'] }).powersFired).toBeGreaterThan(0);
  });
});

describe('round card (F155)', () => {
  it('round 1 has no card (it starts at GO, so the card only sat under the countdown digit); later rounds keep theirs', async () => {
    const { roundCard } = await import('../src/games/chopchop/index');
    expect(roundCard(1)).toBeNull();
    expect(roundCard(2)).toBe('Round 2');
    expect(roundCard(3)).toBe('Round 3');
  });
});
