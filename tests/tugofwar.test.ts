import { describe, expect, it } from 'vitest';
import { HUMAN } from '../src/core/human';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerIndex } from '../src/core/types';
import { BOT, RULES, toward, TugOfWar, TugOfWarBot, type Intent } from '../src/games/tugofwar/logic';
import { DT, player, power } from './helpers';

const idle: Intent = { tap: false, power: false };

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: [string | null, string | null]; assist?: [number, number] } = {}) {
  const rng = makeRng(seed);
  const pw = (i: number) => (opts.powers?.[i] ? power('tugofwar', opts.powers[i]!) : null);
  const g = new TugOfWar(
    [player({ bot: levels[0], power: pw(0), assist: opts.assist?.[0] ?? 0 }), player({ bot: levels[1], power: pw(1), assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    rng,
  );
  const bots = [new TugOfWarBot(0, levels[0], rng), new TugOfWarBot(1, levels[1], rng)];
  let t = 0;
  let powersFired = 0;
  while (!g.done && t < 600) {
    g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
    powersFired += g.events.filter((e) => e.type === 'power').length;
    t += DT;
  }
  return { g, t, powersFired };
}

function fresh(opts: { assist?: [number, number]; powers?: [string | null, string | null] } = {}) {
  const pw = (i: number) => (opts.powers?.[i] ? power('tugofwar', opts.powers[i]!) : null);
  return new TugOfWar([player({ bot: null, assist: opts.assist?.[0] ?? 0, power: pw(0) }), player({ bot: null, assist: opts.assist?.[1] ?? 0, power: pw(1) })], !!opts.powers, makeRng(1));
}

/** A steady tapper: taps every `gap` seconds (0 = never). */
function tapper(gap: number) {
  let next = gap;
  return (): boolean => {
    if (!gap) return false;
    next -= DT;
    if (next > 1e-9) return false;
    next += gap;
    return true;
  };
}

/** Runs `secs` of play with each seat tapping steadily; returns the ribbon's position. */
function pullFor(g: TugOfWar, secs: number, gaps: [number, number], power: [boolean, boolean] = [false, false]): number {
  const taps = [tapper(gaps[0]), tapper(gaps[1])];
  for (let t = 0; t < secs && g.phase === 'pull'; t += DT) {
    g.step(DT, [{ tap: taps[0](), power: power[0] }, { tap: taps[1](), power: power[1] }]);
    power = [false, false];
  }
  return g.pos;
}

describe('tug of war', () => {
  it('bot vs bot finishes in sane time, at every pairing', () => {
    for (const levels of [['normal', 'normal'], ['easy', 'easy'], ['hard', 'hard'], ['easy', 'hard']] as [BotLevel, BotLevel][]) {
      for (const seed of [1, 2, 3, 4]) {
        const { g, t } = play(levels, seed);
        expect(g.done, `${levels} seed ${seed}`).toBe(true);
        if (g.winner !== null) expect(g.score[g.winner]).toBe(RULES.winRounds);
        // Three rounds at most, each capped by the time limit.
        expect(t).toBeLessThan(3 * (RULES.roundTime + RULES.ready + RULES.result) + 1);
      }
    }
  });

  it('same seed gives the same match', () => {
    const a = play(['normal', 'hard'], 9, { powers: ['heave', 'yank'] });
    const b = play(['normal', 'hard'], 9, { powers: ['heave', 'yank'] });
    expect(a.g.score).toEqual(b.g.score);
    expect(a.t).toBe(b.t);
    expect(a.g.history).toEqual(b.g.history);
  });

  it('hard beats easy, and either seat wins about as often (no seat bias)', () => {
    let hard = 0;
    for (let s = 1; s <= 20; s++) {
      if (play(['hard', 'easy'], s).g.winner === 0) hard++;
      if (play(['easy', 'hard'], s).g.winner === 1) hard++;
    }
    expect(hard).toBeGreaterThanOrEqual(36);
    let seat0 = 0;
    let decided = 0;
    for (let s = 1; s <= 60; s++) {
      const w = play(['normal', 'normal'], s).g.winner;
      if (w !== null) decided++;
      if (w === 0) seat0++;
    }
    expect(seat0 / decided).toBeGreaterThan(0.3);
    expect(seat0 / decided).toBeLessThan(0.7);
  });

  it('pulls the ribbon toward whoever taps faster, and a round is won past your line', () => {
    const g = fresh();
    pullFor(g, 1.5, [1 / 8, 1 / 4]);
    expect(g.pos).toBeGreaterThan(0.05);
    const h = fresh();
    pullFor(h, 1.5, [1 / 4, 1 / 8]);
    expect(h.pos).toBeLessThan(-0.05);
    // Keep going until someone wins.
    const w = fresh();
    pullFor(w, 30, [1 / 8, 1 / 4]);
    expect(w.phase).toBe('result');
    expect(w.last).toMatchObject({ winner: 0, reason: 'line' });
    expect(w.score).toEqual([1, 0]);
  });

  it('nobody tapping leaves the rope where it is', () => {
    const g = fresh();
    for (let i = 0; i < 120; i++) g.step(DT, [idle, idle]);
    expect(g.pos).toBe(0);
    expect(g.phase).toBe('pull');
  });

  it('tap spam and multi-touch: taps closer than minTapGap count once, and grip is capped', () => {
    const spam = fresh();
    const steady = fresh();
    // A finger landing every frame (60 a second, faster than any person) vs a steady 10 a second.
    for (let i = 0; i < 90; i++) {
      spam.step(DT, [{ tap: true, power: false }, idle]);
      steady.step(DT, [{ tap: i % 6 === 0, power: false }, idle]);
    }
    expect(spam.taps[0]).toBeLessThanOrEqual(Math.ceil(1.5 / RULES.minTapGap) + 1);
    expect(spam.force[0]).toBeLessThanOrEqual(RULES.maxForce + 1e-9);
    // Spamming pulls no harder than a fast, steady tapper.
    expect(spam.pos).toBeLessThanOrEqual(steady.pos * 1.25 + 1e-9);
    // One step's intent is a single tap however many fingers landed (the view sends one boolean);
    // two steps in a row (a bouncing touch) are one pull too.
    const g = fresh();
    g.step(DT, [{ tap: true, power: false }, idle]);
    g.step(DT, [{ tap: true, power: false }, idle]);
    expect(g.taps[0]).toBe(1);
    // Two thumbs drumming at 15 a second (every 4th frame) all count.
    const drum = fresh();
    for (let i = 0; i < 60; i++) drum.step(DT, [{ tap: i % 4 === 0, power: false }, idle]);
    expect(drum.taps[0]).toBe(15);
  });

  it('a long, even round ends: the lines close in, and the time limit picks the ribbon\'s side', () => {
    const g = fresh();
    expect(g.closing()).toBe(1);
    pullFor(g, RULES.closeAt + RULES.closeLen / 2, [0, 0]);
    expect(g.closing()).toBeLessThan(1);
    expect(g.lineNow(0)).toBeLessThan(g.line[0]);
    // Equal tappers, nudged a hair to player 1's side: they win when time is up.
    const h = fresh();
    h.pos = -0.01;
    pullFor(h, RULES.roundTime + 1, [1 / 6, 1 / 6]);
    expect(h.last?.winner).toBe(1);
    // Dead even at the whistle: a void round, nobody scores.
    const v = fresh();
    pullFor(v, RULES.roundTime + 1, [0, 0]);
    expect(v.last).toMatchObject({ winner: null, reason: 'void' });
    expect(v.score).toEqual([0, 0]);
  });

  it('the match is best of 3, with a ready phase between rounds where taps do nothing', () => {
    const g = fresh();
    pullFor(g, 30, [1 / 8, 0]);
    expect(g.score).toEqual([1, 0]);
    for (let t = 0; t < RULES.result + 0.05; t += DT) g.step(DT, [idle, idle]);
    expect(g.phase).toBe('ready');
    expect(g.round).toBe(2);
    expect(g.pos).toBe(0);
    for (let t = 0; t < RULES.ready - 0.1; t += DT) g.step(DT, [{ tap: true, power: false }, idle]);
    expect(g.taps[0]).toBe(0);
    for (let t = 0; t < 0.2; t += DT) g.step(DT, [idle, idle]);
    expect(g.phase).toBe('pull');
    pullFor(g, 30, [1 / 8, 0]);
    expect(g.done).toBe(true);
    expect(g.winner).toBe(0);
    expect(g.score).toEqual([2, 0]);
  });

  it('handicap: a stronger pull and a nearer line', () => {
    const plain = fresh();
    const helped = fresh({ assist: [3, 0] });
    expect(helped.line[0]).toBeCloseTo(RULES.lineAt3);
    expect(helped.line[1]).toBe(RULES.line);
    expect(helped.gain[0]).toBeCloseTo(RULES.gainByStar[3]);
    expect(helped.gain[1]).toBe(1);
    // In between stars the pull is interpolated (auto handicap can hand out part stars).
    expect(fresh({ assist: [1.5, 0] }).gain[0]).toBeCloseTo((RULES.gainByStar[1] + RULES.gainByStar[2]) / 2);
    // A kid tapping 5 a second against an adult's 7: plain they lose ground, helped they win it.
    expect(pullFor(plain, 3, [1 / 5, 1 / 7])).toBeLessThan(0);
    expect(pullFor(helped, 3, [1 / 5, 1 / 7])).toBeGreaterThan(0);
    // Gentle: at assist 1 the faster bot still usually wins.
    let normal = 0;
    for (let s = 1; s <= 10; s++) if (play(['easy', 'normal'], s, { assist: [1, 0] }).g.winner === 1) normal++;
    expect(normal).toBeGreaterThanOrEqual(8);
  });

  it('Mighty Heave: your pulls count extra for its duration', () => {
    const ready = (g: TugOfWar, p: PlayerIndex) => (g.energy[p].value = 1);
    const g = fresh({ powers: ['heave', null] });
    const h = fresh({ powers: ['heave', null] });
    ready(g, 0);
    pullFor(g, 2, [1 / 6, 1 / 6], [true, false]);
    pullFor(h, 2, [1 / 6, 1 / 6]);
    expect(g.pos).toBeGreaterThan(h.pos + 0.05);
    expect(g.energy[0].value).toBeLessThan(1);
    expect(power('tugofwar', 'heave').duration).toBe(3);
  });

  it('Butter Rope: the other player\'s pulls count half', () => {
    const g = fresh({ powers: [null, 'butter'] });
    g.energy[1].value = 1;
    g.step(DT, [idle, { tap: false, power: true }]);
    expect(g.active(1, 'butter')).toBe(true);
    expect(g.pullGain(0)).toBeCloseTo(RULES.butterGain);
    expect(g.pullGain(1)).toBe(1);
    // Equal tapping now drifts toward the butterer.
    pullFor(g, 2, [1 / 6, 1 / 6]);
    expect(g.pos).toBeLessThan(-0.05);
  });

  it('Big Yank: winds up where both can see it, then jumps the ribbon; bracing taps shrink it', () => {
    const run = (braceGap: number) => {
      const g = fresh({ powers: ['yank', null] });
      g.energy[0].value = 1;
      g.step(DT, [{ tap: false, power: true }, idle]);
      expect(g.yank[0]).not.toBeNull();
      expect(g.events.some((e) => e.type === 'power' && e.p === 0)).toBe(true);
      let jump = 0;
      const brace = tapper(braceGap);
      for (let t = 0; t < RULES.yankWindup + 0.1; t += DT) {
        g.step(DT, [idle, { tap: brace(), power: false }]);
        for (const e of g.events) if (e.type === 'yank') jump = e.jump;
      }
      return { g, jump };
    };
    const free = run(0);
    expect(free.jump).toBeCloseTo(RULES.yankJump);
    expect(free.g.pos).toBeGreaterThan(RULES.yankJump * 0.9);
    const braced = run(1 / 8);
    expect(braced.jump).toBeLessThan(free.jump * 0.8);
    expect(braced.jump).toBeGreaterThanOrEqual(RULES.yankJump * RULES.yankMin - 1e-9);
    // Hammering can't cancel it entirely.
    const hammered = run(RULES.minTapGap);
    expect(hammered.jump).toBeGreaterThanOrEqual(RULES.yankJump * RULES.yankMin - 1e-9);
  });

  it('powers need a full bar, fill from pulling, and the player losing ground fills faster', () => {
    const g = fresh({ powers: ['heave', 'heave'] });
    g.step(DT, [{ tap: false, power: true }, idle]);
    expect(g.events.some((e) => e.type === 'power')).toBe(false);
    g.pos = -0.3; // the ribbon on player 1's side: player 0 is losing ground
    const before = [g.energy[0].value, g.energy[1].value];
    pullFor(g, 1, [1 / 6, 1 / 6]);
    const gained = [g.energy[0].value - before[0], g.energy[1].value - before[1]];
    expect(gained[1]).toBeGreaterThan(0);
    expect(gained[0]).toBeGreaterThan(gained[1]);
    // Bots fire their powers in a match.
    expect(play(['normal', 'normal'], 3, { powers: ['heave', 'butter'] }).powersFired).toBeGreaterThan(0);
  });

  it('the toward() sign: player 0 pulls down (+), player 1 up (-)', () => {
    expect(toward(0)).toBe(1);
    expect(toward(1)).toBe(-1);
  });

  it('bots tap at a person\'s pace: never faster than HUMAN.tapGap, never before a reaction time', () => {
    for (const level of ['easy', 'normal', 'hard'] as BotLevel[]) {
      expect(1 / BOT[level].rate).toBeGreaterThan(HUMAN.tapGap);
      const rng = makeRng(5);
      const g = fresh();
      const bot = new TugOfWarBot(0, level, rng);
      let first = -1;
      for (let t = 0; t < 2; t += DT) {
        if (bot.think(g, DT).tap && first < 0) first = t;
        g.step(DT, [idle, idle]);
      }
      expect(first).toBeGreaterThanOrEqual(HUMAN.reaction - DT);
    }
  });
});
