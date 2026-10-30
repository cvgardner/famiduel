import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PowerDef } from '../src/core/types';
import { RULES, Sumo, SumoBot, type Intent } from '../src/games/sumo/logic';
import { DT, player, power } from './helpers';

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: [PowerDef, PowerDef]; assist?: [number, number] } = {}) {
  const rng = makeRng(seed);
  const g = new Sumo(
    [
      player({ bot: levels[0], power: opts.powers?.[0] ?? null, assist: opts.assist?.[0] ?? 0 }),
      player({ bot: levels[1], power: opts.powers?.[1] ?? null, assist: opts.assist?.[1] ?? 0 }),
    ],
    !!opts.powers,
    rng,
  );
  const bots = [new SumoBot(0, levels[0], rng), new SumoBot(1, levels[1], rng)];
  let t = 0;
  while (!g.finished && t < 600) {
    g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
    t += DT;
  }
  return { g, t };
}

const idle: Intent = { hold: false, power: false };

/** A fresh game already in the fight phase. */
function fight(opts: { powers?: [PowerDef | null, PowerDef | null]; assist?: [number, number] } = {}) {
  const g = new Sumo(
    [player({ power: opts.powers?.[0] ?? null, assist: opts.assist?.[0] ?? 0 }), player({ power: opts.powers?.[1] ?? null, assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    makeRng(5),
  );
  while (g.phase !== 'fight') g.step(DT, [idle, idle]);
  return g;
}

describe('sumo', () => {
  it('bot vs bot finishes a best of 3 in a sane time', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { g, t } = play(['normal', 'normal'], seed);
      expect(g.finished).toBe(true);
      expect(g.winner).not.toBeNull();
      expect(Math.max(...g.score)).toBe(RULES.roundsToWin);
      expect(t).toBeLessThan(200);
    }
  });

  it('bot vs bot with powers also finishes', () => {
    const pw: [PowerDef, PowerDef][] = [
      [power('sumo', 'pound'), power('sumo', 'grow')],
      [power('sumo', 'slip'), power('sumo', 'pound')],
      [power('sumo', 'grow'), power('sumo', 'slip')],
    ];
    pw.forEach((powers, i) => {
      const { g } = play(['normal', 'hard'], 40 + i, { powers });
      expect(g.finished).toBe(true);
    });
  });

  it('is deterministic for a seed', () => {
    const a = play(['hard', 'easy'], 7);
    const b = play(['hard', 'easy'], 7);
    expect(a.g.score).toEqual(b.g.score);
    expect(a.t).toBe(b.t);
  });

  it('a hard bot beats an easy bot most of the time', () => {
    let hardWins = 0;
    for (let s = 0; s < 10; s++) {
      // Alternate seats so the result is not about the side.
      if (s % 2 === 0) hardWins += play(['hard', 'easy'], 100 + s).g.winner === 0 ? 1 : 0;
      else hardWins += play(['easy', 'hard'], 100 + s).g.winner === 1 ? 1 : 0;
    }
    expect(hardWins).toBeGreaterThanOrEqual(7);
  });

  it('holding stops the turn and charges; letting go dashes', () => {
    const g = fight();
    const w = g.wrestlers[0];
    const a0 = w.angle;
    for (let i = 0; i < 30; i++) g.step(DT, [{ hold: true, power: false }, idle]);
    expect(w.charging).toBe(true);
    expect(w.charge).toBeGreaterThan(0.5);
    expect(w.angle).toBe(a0);
    g.step(DT, [idle, idle]);
    expect(w.charging).toBe(false);
    expect(Math.hypot(w.vx, w.vy)).toBeGreaterThan(RULES.dashMin);
    expect(g.events.some((e) => e.type === 'dash')).toBe(true);
  });

  it('a dash into the other wrestler pushes them; leaving the ring loses the round', () => {
    const g = fight();
    const [a, b] = g.wrestlers;
    // Player 1 stands near the rope; aim player 0 straight up at them.
    b.y = RULES.cy - 105;
    a.y = RULES.cy - 30;
    a.angle = -Math.PI / 2;
    for (let i = 0; i < Math.ceil(RULES.chargeTime / DT) + 1; i++) g.step(DT, [{ hold: true, power: false }, idle]);
    a.angle = -Math.PI / 2;
    let rounds = 0;
    let pushed = false;
    for (let i = 0; i < 240 && g.phase === 'fight'; i++) {
      g.step(DT, [idle, idle]);
      if (b.vy < -100) pushed = true;
      rounds += g.events.filter((e) => e.type === 'round').length;
    }
    expect(pushed).toBe(true);
    expect(rounds).toBe(1);
    expect(g.score).toEqual([1, 0]);
    expect(b.out).toBe(true);
  });

  it('the handicap makes the wrestler heavier and gives a little more room', () => {
    const g = new Sumo([player({ assist: 3 }), player()], false, makeRng(1));
    expect(g.mass(0)).toBe(RULES.massMax);
    expect(g.mass(1)).toBe(RULES.mass);
    expect(g.outR(0)).toBeGreaterThan(g.outR(1));
    // A heavier wrestler is pushed less by the same hit.
    const push = (assist: number) => {
      const s = fight({ assist: [0, assist] });
      const [a, b] = s.wrestlers;
      a.x = RULES.cx;
      a.y = RULES.cy + 40;
      b.x = RULES.cx;
      b.y = RULES.cy - 12;
      a.vx = 0;
      a.vy = -500;
      s.step(DT, [idle, idle]);
      return -b.vy;
    };
    expect(push(3)).toBeLessThan(push(0) * 0.9);
  });

  it('ground pound shoves the other wrestler away after a short windup', () => {
    const g = fight({ powers: [power('sumo', 'pound'), null] });
    const [a, b] = g.wrestlers;
    g.energy[0].value = 1;
    g.step(DT, [{ hold: false, power: true }, idle]);
    expect(a.pound).toBeGreaterThan(0);
    expect(Math.abs(b.vy)).toBe(0);
    for (let i = 0; i < 30; i++) g.step(DT, [idle, idle]);
    // Player 1 starts above player 0, so it is pushed up (negative y).
    expect(b.y).toBeLessThan(RULES.cy - 72 - 20);
  });

  it('grow makes you bigger and heavier for 3 seconds', () => {
    const g = fight({ powers: [power('sumo', 'grow'), null] });
    g.energy[0].value = 1;
    g.step(DT, [{ hold: false, power: true }, idle]);
    expect(g.radius(0)).toBeCloseTo(RULES.bodyR * RULES.growScale);
    expect(g.mass(0)).toBeCloseTo(RULES.mass * RULES.growMass);
    for (let i = 0; i < 3.1 / DT; i++) g.step(DT, [idle, idle]);
    expect(g.radius(0)).toBe(RULES.bodyR);
  });

  it('slippery floor lowers the other wrestler\'s friction', () => {
    const g = fight({ powers: [power('sumo', 'slip'), null] });
    g.energy[0].value = 1;
    expect(g.friction(1)).toBe(RULES.friction);
    g.step(DT, [{ hold: false, power: true }, idle]);
    expect(g.friction(1)).toBe(RULES.slipFriction);
    expect(g.friction(0)).toBe(RULES.friction);
    // The same shove carries much further on the slippery floor.
    const slide = (slip: boolean) => {
      const s = fight();
      const b = s.wrestlers[1];
      s.wrestlers[0].x = 40; // out of the way
      s.wrestlers[0].y = RULES.cy;
      b.x = RULES.cx;
      b.y = RULES.cy;
      b.vx = 200;
      if (slip) b.slip = 5;
      for (let i = 0; i < 30; i++) s.step(DT, [idle, idle]);
      return b.x - RULES.cx;
    };
    expect(slide(true)).toBeGreaterThan(slide(false) * 1.5);
  });

  it('the ring shrinks in a long round so rounds always end', () => {
    const g = fight();
    const r0 = g.ringR();
    for (let i = 0; i < (RULES.shrinkAfter + RULES.shrinkTime) / DT; i++) g.step(DT, [idle, idle]);
    expect(g.ringR()).toBeCloseTo(r0 * RULES.ringMinFrac);
  });
});
