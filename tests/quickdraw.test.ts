import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { QuickDraw, QuickDrawBot, RULES, type Intent } from '../src/games/quickdraw/logic';
import { DT, player, power } from './helpers';

const idle: Intent = { tap: false, power: false };
const tap: Intent = { tap: true, power: false };

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: [string, string]; assist?: [number, number] } = {}) {
  const rng = makeRng(seed);
  const pw = (i: number) => (opts.powers ? power('quickdraw', opts.powers[i]) : null);
  const g = new QuickDraw(
    [player({ bot: levels[0], power: pw(0), assist: opts.assist?.[0] ?? 0 }), player({ bot: levels[1], power: pw(1), assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    rng,
  );
  const bots = [new QuickDrawBot(0, levels[0], rng), new QuickDrawBot(1, levels[1], rng)];
  let t = 0;
  let powersFired = 0;
  let earlyBeforeSignal = 0;
  while (!g.done && t < 600) {
    const i = [bots[0].think(g, DT), bots[1].think(g, DT)] as [Intent, Intent];
    if (g.phase === 'wait' && !g.fake && (i[0].tap || i[1].tap)) earlyBeforeSignal++;
    g.step(DT, i);
    powersFired += g.events.filter((e) => e.type === 'power').length;
    t += DT;
  }
  return { g, t, powersFired, earlyBeforeSignal };
}

function fresh(opts: { assist?: [number, number]; powers?: [string, string] } = {}, seed = 4) {
  const pw = (i: number) => (opts.powers ? power('quickdraw', opts.powers[i]) : null);
  return new QuickDraw([player({ assist: opts.assist?.[0] ?? 0, power: pw(0) }), player({ assist: opts.assist?.[1] ?? 0, power: pw(1) })], !!opts.powers, makeRng(seed));
}

function until(g: QuickDraw, phase: string, intents: [Intent, Intent] = [idle, idle]) {
  let n = 0;
  while (g.phase !== phase && n++ < 2000) g.step(DT, intents);
}

describe('quick draw', () => {
  it('bot vs bot finishes in sane time', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { g, t } = play(['normal', 'normal'], seed);
      expect(g.done).toBe(true);
      if (g.winner !== null) expect(g.score[g.winner]).toBe(RULES.winRounds);
      expect(t).toBeLessThan(120);
    }
  });

  it('is deterministic for a seed', () => {
    const a = play(['hard', 'easy'], 5);
    const b = play(['hard', 'easy'], 5);
    expect(a.g.score).toEqual(b.g.score);
    expect(a.g.history).toEqual(b.g.history);
  });

  it('a hard bot beats an easy bot most of the time', () => {
    let wins = 0;
    for (let s = 0; s < 10; s++) if (play(['hard', 'easy'], 50 + s).g.winner === 0) wins++;
    expect(wins).toBeGreaterThanOrEqual(8);
  });

  it('bots never tap before a signal is on screen', () => {
    for (const lvl of ['easy', 'normal', 'hard'] as BotLevel[]) {
      for (let s = 0; s < 6; s++) expect(play([lvl, lvl], 300 + s, { powers: ['slowtime', 'double'] }).earlyBeforeSignal).toBe(0);
    }
  });

  it('first tap after DRAW! wins and reaction times are recorded', () => {
    const g = fresh();
    until(g, 'draw');
    for (let i = 0; i < 15; i++) g.step(DT, [idle, idle]);
    g.step(DT, [tap, idle]);
    for (let i = 0; i < 5; i++) g.step(DT, [idle, tap]);
    expect(g.last?.winner).toBe(0);
    expect(g.last?.reason).toBe('faster');
    expect(g.last?.times[0]).toBeGreaterThan(0.2);
  });

  it('tapping before DRAW! loses the round', () => {
    const g = fresh();
    until(g, 'wait');
    g.step(DT, [idle, tap]);
    expect(g.last?.winner).toBe(0);
    expect(['early', 'fooled']).toContain(g.last?.reason);
    expect(g.score).toEqual([1, 0]);
  });

  it('tapping on a fake-out loses the round as "fooled"', () => {
    for (let seed = 1; seed < 40; seed++) {
      const g = fresh({}, seed);
      until(g, 'wait');
      let n = 0;
      while (!g.fake && g.phase === 'wait' && n++ < 1000) g.step(DT, [idle, idle]);
      if (!g.fake) continue;
      g.step(DT, [tap, idle]);
      expect(g.last?.reason).toBe('fooled');
      expect(g.last?.winner).toBe(1);
      return;
    }
    throw new Error('no seed produced a fake-out');
  });

  it('handicap: the opponent of an assisted player has their tap counted later', () => {
    const g = fresh({ assist: [3, 0] });
    expect(g.penalty).toEqual([0, RULES.maxPenalty]);
    until(g, 'draw');
    for (let i = 0; i < 6; i++) g.step(DT, [idle, idle]);
    g.step(DT, [idle, tap]); // player 1 taps first...
    for (let i = 0; i < 5; i++) g.step(DT, [i === 2 ? tap : idle, idle]); // ...player 0 three frames later
    expect(g.last?.winner).toBe(0);
  });

  it('fake-out power shows a fake made by that player', () => {
    const g = fresh({ powers: ['fakeout', 'fakeout'] }, 77);
    until(g, 'wait');
    g.energy[0].value = 1;
    g.step(DT, [{ tap: false, power: true }, idle]);
    let saw = false;
    for (let i = 0; i < 60 && g.phase === 'wait'; i++) {
      g.step(DT, [idle, idle]);
      if (g.fake?.by === 0) saw = true;
    }
    expect(saw).toBe(true);
  });

  it('slow time pulses only right before the real DRAW!', () => {
    const g = fresh({ powers: ['slowtime', 'slowtime'] });
    g.energy[0].value = 1;
    g.step(DT, [{ tap: false, power: true }, idle]);
    expect(g.focus[0]).toBe(true);
    let firstPulse = -1;
    let n = 0;
    while (g.phase !== 'draw' && n++ < 2000) {
      g.step(DT, [idle, idle]);
      if (g.pulse(0) && firstPulse < 0) firstPulse = g.t;
      expect(g.pulse(1)).toBe(false);
    }
    expect(firstPulse).toBeGreaterThan(0);
    expect(g.t - firstPulse).toBeLessThanOrEqual(RULES.pulseLead + DT);
    expect(g.focus[0]).toBe(false); // used up
  });

  it('double shot forgives one early tap', () => {
    const g = fresh({ powers: ['double', 'double'] });
    g.energy[0].value = 1;
    g.step(DT, [{ tap: false, power: true }, idle]);
    until(g, 'wait');
    g.step(DT, [tap, idle]);
    expect(g.events.some((e) => e.type === 'forgiven')).toBe(true);
    expect(g.phase).toBe('wait');
    for (let i = 0; i < 30; i++) g.step(DT, [idle, idle]);
    if (g.phase === 'wait') {
      g.step(DT, [tap, idle]);
      expect(g.last?.winner).toBe(1);
    }
  });

  it('bots use powers', () => {
    expect(play(['normal', 'normal'], 8, { powers: ['fakeout', 'double'] }).powersFired).toBeGreaterThan(0);
  });
});
