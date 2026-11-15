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
    expect(play(['normal', 'normal'], 8, { powers: ['tall', 'hotaxe'] }).powersFired).toBeGreaterThan(0);
  });

  it('tall tree: the other tree grows 3 pieces taller, so they need 3 more chops this round', () => {
    const g = fresh({ powers: ['tall', 'tall'] });
    expect(power('chopchop', 'tall').count).toBe(3);
    g.energy[0].value = 1;
    g.step(DT, [{ chop: 0, power: true }, idle]);
    expect(g.choppers[1].extra).toBe(3);
    expect(g.goal(1)).toBe(RULES.goal + 3);
    expect(g.goal(0)).toBe(RULES.goal);
    // 50 chops are no longer enough for them...
    const c = g.choppers[1];
    let n = 0;
    while (c.chops < RULES.goal && n++ < 400) g.step(DT, [idle, { chop: safe(g, 1), power: false }]);
    expect(c.chops).toBe(RULES.goal);
    expect(g.phase).toBe('play');
    // ...53 are, and the next round is back to 50.
    while (g.phase === 'play' && n++ < 800) g.step(DT, [idle, { chop: safe(g, 1), power: false }]);
    expect(c.chops).toBe(RULES.goal + 3);
    expect(g.lastRound).toBe(1);
    while (g.phase !== 'play' && n++ < 2000) g.step(DT, [idle, idle]);
    expect(g.goal(1)).toBe(RULES.goal);
  });

  it('hot axe: your next chop burns through 4 pieces at once, branches and all', () => {
    const g = fresh({ powers: ['hotaxe', 'hotaxe'] });
    const c = g.choppers[0];
    expect(power('chopchop', 'hotaxe').count).toBe(4);
    g.energy[0].value = 1;
    g.step(DT, [{ chop: 0, power: true }, idle]);
    expect(c.hot).toBe(4);
    // A count, not seconds: waiting doesn't use it up.
    for (let i = 0; i < 120; i++) g.step(DT, [idle, idle]);
    expect(c.hot).toBe(4);
    // Walk up to a branch one piece above you, then chop on its side: it burns instead of bonking.
    let n = 0;
    c.hot = 0;
    while (g.branch(0, c.idx + 1) === 0 && n++ < 100) g.step(DT, [{ chop: safe(g, 0), power: false }, idle]);
    c.hot = 4;
    const bad = g.branch(0, c.idx + 1) as -1 | 1;
    const [idx, chops] = [c.idx, c.chops];
    g.step(DT, [{ chop: bad, power: false }, idle]);
    expect(c.out).toBe(false);
    expect(c.idx).toBe(idx + 4);
    expect(c.chops).toBe(chops + 4);
    expect(c.hot).toBe(0);
    expect(g.events.some((e) => e.type === 'hotChop' && e.count === 4)).toBe(true);
    // The piece it lands on is burned bare too (it was too high up to be seen).
    expect(g.branch(0, c.idx)).toBe(0);
    // Only one chop: after that a branch bonks again.
    n = 0;
    while (g.branch(0, c.idx + 1) === 0 && n++ < 100) g.step(DT, [{ chop: safe(g, 0), power: false }, idle]);
    g.step(DT, [{ chop: g.branch(0, c.idx + 1) as -1 | 1, power: false }, idle]);
    expect(c.out).toBe(true);
  });

  it("hot axe doesn't thaw a frozen tree: the ice cracks first, then the axe burns", () => {
    const g = fresh({ powers: ['hotaxe', 'freeze'] });
    const c = g.choppers[0];
    g.energy[0].value = 1;
    g.energy[1].value = 1;
    g.step(DT, [{ chop: 0, power: true }, { chop: 0, power: true }]);
    expect(c.hot).toBe(4);
    expect(c.frozen).toBe(3);
    for (let k = 0; k < 3; k++) {
      g.step(DT, [{ chop: safe(g, 0), power: false }, idle]);
      for (let i = 0; i < 10; i++) g.step(DT, [idle, idle]);
    }
    expect(c.hot).toBe(4);
    g.step(DT, [{ chop: c.side, power: false }, idle]);
    expect(c.chops).toBe(4);
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
