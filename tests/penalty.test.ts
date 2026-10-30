import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerIndex } from '../src/core/types';
import { IDLE, Penalty, PenaltyBot, RULES, shotFromSwipe, type Dive, type Intent, type Shot } from '../src/games/penalty/logic';
import { DT, player, power } from './helpers';

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: [string, string] } = {}) {
  const rng = makeRng(seed);
  const pw = (i: 0 | 1) => (opts.powers ? power('penalty', opts.powers[i]) : null);
  const g = new Penalty([player({ bot: levels[0], power: pw(0) }), player({ bot: levels[1], power: pw(1) })], !!opts.powers, rng);
  const bots = [new PenaltyBot(0, levels[0], rng), new PenaltyBot(1, levels[1], rng)];
  let t = 0;
  let powersFired = 0;
  while (!g.over && t < 900) {
    g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
    powersFired += g.events.filter((e) => e.type === 'power').length;
    t += DT;
  }
  return { g, t, powersFired };
}

/** Drive one kick by hand: wait for aim, optional early dive, then shoot. */
function kick(g: Penalty, shot: Shot, dive: Dive | null = null, diveEarly = false) {
  const s = g.shooter;
  const k = g.keeper;
  const intents = (sh: Shot | null, dv: Dive | null): [Intent, Intent] => {
    const out: [Intent, Intent] = [{ ...IDLE }, { ...IDLE }];
    out[s] = { ...IDLE, shot: sh };
    out[k] = { ...IDLE, dive: dv };
    return out;
  };
  while (g.phase === 'ready') g.step(DT, intents(null, null));
  if (diveEarly) g.step(DT, intents(null, dive));
  g.step(DT, intents(shot, null));
  if (!diveEarly && dive !== null) g.step(DT, intents(null, dive));
  while (g.phase === 'flight') g.step(DT, intents(null, null));
  const ev = g.events.find((e) => e.type === 'result');
  while (g.phase === 'result') g.step(DT, intents(null, null));
  return ev && ev.type === 'result' ? ev : null;
}

const fresh = (assist: [number, number] = [0, 0], powers: [string | null, string | null] = [null, null], seed = 1) =>
  new Penalty(
    [player({ assist: assist[0], power: powers[0] ? power('penalty', powers[0]) : null }), player({ assist: assist[1], power: powers[1] ? power('penalty', powers[1]) : null })],
    powers.some(Boolean),
    makeRng(seed),
  );

describe('penalty shootout', () => {
  it('bot vs bot always finishes', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { g, t } = play(['normal', 'normal'], seed);
      expect(g.over).toBe(true);
      expect(t).toBeLessThan(300);
      if (g.winner !== null) expect(g.score[g.winner]).toBeGreaterThan(g.score[1 - g.winner]);
    }
  });

  it('bots use their powers and still finish', () => {
    for (const seed of [7, 8]) {
      const a = play(['normal', 'hard'], seed, { powers: ['decoy', 'widekeeper'] });
      expect(a.g.over).toBe(true);
      const b = play(['hard', 'normal'], seed, { powers: ['curveshot', 'decoy'] });
      expect(b.g.over).toBe(true);
      expect(a.powersFired + b.powersFired).toBeGreaterThan(0);
    }
  });

  it('is deterministic for a seed', () => {
    const a = play(['hard', 'easy'], 9);
    const b = play(['hard', 'easy'], 9);
    expect(a.g.kicks).toEqual(b.g.kicks);
    expect(a.t).toBe(b.t);
  });

  it('a hard bot beats an easy bot most of the time', () => {
    let wins = 0;
    for (let s = 0; s < 10; s++) if (play(['hard', 'easy'], 200 + s).g.winner === 0) wins++;
    expect(wins).toBeGreaterThanOrEqual(7);
  });

  it('roles swap every kick and the tracker records each result', () => {
    const g = fresh();
    const first = g.shooter;
    kick(g, { aimX: 180 + 60, power: 0.8, bow: 0 }); // goal: keeper never dives
    expect(g.shooter).toBe(1 - first);
    kick(g, { aimX: 180, power: 0.5, bow: 0 }, 0, true); // saved: keeper stays tall in the middle
    kick(g, { aimX: 180 + 200, power: 0.5, bow: 0 }); // wide
    expect(g.kicks.map((k) => k.result)).toEqual(['goal', 'saved', 'miss']);
    expect(g.kicks.map((k) => k.shooter)).toEqual([first, 1 - first, first]);
  });

  it('too much power sails over the bar', () => {
    const g = fresh();
    const r = kick(g, { aimX: 200, power: 0.99, bow: 0 });
    expect(r?.why).toBe('over');
  });

  it('five kicks each, early finish when one side cannot catch up, then sudden death', () => {
    const g = fresh();
    const a = g.shooter;
    // a scores 3, b misses 3: after a's 3rd and b's 3rd, b can make at most 2 more: decided.
    for (let i = 0; i < 3; i++) {
      kick(g, { aimX: 240, power: 0.8, bow: 0 });
      kick(g, { aimX: 400, power: 0.5, bow: 0 });
    }
    expect(g.over).toBe(true);
    expect(g.winner).toBe(a);
    // Level after 5 each → sudden death until a pair differs.
    const h = fresh([0, 0], [null, null], 2);
    const s = h.shooter;
    for (let i = 0; i < 5; i++) {
      kick(h, { aimX: 240, power: 0.8, bow: 0 });
      kick(h, { aimX: 240, power: 0.8, bow: 0 });
    }
    expect(h.over).toBe(false);
    expect(h.suddenDeath).toBe(true);
    kick(h, { aimX: 240, power: 0.8, bow: 0 });
    expect(h.over).toBe(false);
    kick(h, { aimX: 400, power: 0.5, bow: 0 });
    expect(h.over).toBe(true);
    expect(h.winner).toBe(s);
  });

  it('handicap: bigger goal and more aim time when shooting, bigger keeper when keeping', () => {
    const g = fresh([3, 0]);
    expect(g.goalW(0)).toBe(RULES.goalWMax);
    expect(g.goalW(1)).toBe(RULES.goalW);
    expect(g.aimTime(0)).toBe(RULES.aimTimeMax);
    expect(g.aimTime(1)).toBe(RULES.aimTime);
    // Make player 0 the keeper and compare with an unassisted keeper.
    if (g.keeper !== 0) kick(g, { aimX: 400, power: 0.5, bow: 0 });
    expect(g.keeper).toBe(0);
    expect(g.keeperBox().half).toBe(RULES.keeperHalfMax);
    const h = fresh([0, 0]);
    expect(h.keeperBox().half).toBe(RULES.keeperHalf);
  });

  it('the shot clock kicks a soft ball down the middle', () => {
    const g = fresh();
    while (g.phase !== 'flight') g.step(DT, [IDLE, IDLE]);
    expect(g.phaseT).toBeLessThan(0.1);
    expect(g.flight!.power).toBeCloseTo(0.2);
    expect(Math.abs(g.flight!.aimX - 180)).toBeLessThanOrEqual(20);
  });

  it('a keeper who dives early is seen during the aim', () => {
    const g = fresh();
    while (g.phase === 'ready') g.step(DT, [IDLE, IDLE]);
    const k = g.keeper;
    const it: [Intent, Intent] = [{ ...IDLE }, { ...IDLE }];
    it[k] = { ...IDLE, dive: -1 };
    g.step(DT, it);
    expect(g.dive).toBe(-1);
    expect(g.divedEarly).toBe(true);
    // One dive per kick.
    it[k] = { ...IDLE, dive: 1 };
    g.step(DT, it);
    expect(g.dive).toBe(-1);
  });

  it('swipe: direction aims, speed is power, a sideways bulge bends', () => {
    const straight = shotFromSwipe([{ x: 180, y: 500, t: 0 }, { x: 180, y: 440, t: 0.05 }, { x: 180, y: 380, t: 0.1 }], -1)!;
    expect(straight.aimX).toBeCloseTo(180);
    expect(straight.bow).toBe(0);
    const right = shotFromSwipe([{ x: 180, y: 500, t: 0 }, { x: 220, y: 380, t: 0.2 }], -1)!;
    expect(right.aimX).toBeGreaterThan(180 + 40);
    expect(right.power).toBeLessThan(straight.power);
    const bent = shotFromSwipe([{ x: 180, y: 500, t: 0 }, { x: 215, y: 440, t: 0.06 }, { x: 180, y: 380, t: 0.12 }], -1)!;
    expect(bent.bow).toBeGreaterThan(0);
    expect(shotFromSwipe([{ x: 180, y: 500, t: 0 }, { x: 180, y: 560, t: 0.1 }], -1)).toBeNull();
    // Player 1 shoots down the screen.
    expect(shotFromSwipe([{ x: 180, y: 140, t: 0 }, { x: 180, y: 260, t: 0.1 }], 1)).not.toBeNull();
  });

  it('Curve Shot bends the ball toward the middle, then back to the aim', () => {
    const g = fresh([0, 0], ['curveshot', 'curveshot']);
    while (g.phase === 'ready') g.step(DT, [IDLE, IDLE]);
    const s = g.shooter;
    g.energy[s].value = 1;
    const it: [Intent, Intent] = [{ ...IDLE }, { ...IDLE }];
    it[s] = { ...IDLE, power: true };
    g.step(DT, it);
    expect(g.armed[s]).toBe(true);
    it[s] = { ...IDLE, shot: { aimX: 240, power: 0.7, bow: 0 } };
    g.step(DT, it);
    const f = g.flight!;
    expect(f.bow).toBeLessThan(-RULES.bow); // big bend toward the middle
    expect(Penalty.at(f, f.T / 2).x).toBeLessThan(180 + 30);
    expect(Penalty.at(f, f.T).x).toBeCloseTo(240);
  });

  it('Wide Keeper makes the keeper wider for one save', () => {
    const g = fresh([0, 0], ['widekeeper', 'widekeeper']);
    while (g.phase === 'ready') g.step(DT, [IDLE, IDLE]);
    const k = g.keeper;
    const before = g.keeperBox().half;
    g.energy[k].value = 1;
    // A shooter can't fire a keeper power.
    expect(g.canFire(g.shooter)).toBe(false);
    const it: [Intent, Intent] = [{ ...IDLE }, { ...IDLE }];
    it[k] = { ...IDLE, power: true };
    g.step(DT, it);
    expect(g.keeperBox().half).toBeCloseTo(before * RULES.wideKeeper);
    const r = kick(g, { aimX: 180 + 26, power: 0.6, bow: 0 });
    expect(r?.result).toBe('saved');
    expect(g.armed[k]).toBe(false);
  });

  it('Decoy Ball sends a mirrored fake; only the real one counts', () => {
    const g = fresh([0, 0], ['decoy', 'decoy']);
    while (g.phase === 'ready') g.step(DT, [IDLE, IDLE]);
    const s: PlayerIndex = g.shooter;
    g.energy[s].value = 1;
    const it: [Intent, Intent] = [{ ...IDLE }, { ...IDLE }];
    it[s] = { ...IDLE, power: true };
    g.step(DT, it);
    it[s] = { ...IDLE, shot: { aimX: 240, power: 0.7, bow: 0 } };
    g.step(DT, it);
    expect(g.decoy).not.toBeNull();
    expect(g.decoy!.aimX).toBeCloseTo(120);
    // Keeper picks the decoy side: the real ball goes in.
    const k = g.keeper;
    const kd: [Intent, Intent] = [{ ...IDLE }, { ...IDLE }];
    kd[k] = { ...IDLE, dive: -1 };
    g.step(DT, kd);
    let res = null;
    while (g.phase === 'flight') {
      g.step(DT, [IDLE, IDLE]);
      res = g.events.find((e) => e.type === 'result') ?? res;
    }
    expect(res && res.type === 'result' && res.result).toBe('goal');
  });
});
