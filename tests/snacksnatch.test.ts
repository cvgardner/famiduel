import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PowerDef } from '../src/core/types';
import { RULES, SnackSnatch, SnackSnatchBot, type Intent, type Snack } from '../src/games/snacksnatch/logic';
import { DT, player, power } from './helpers';

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: [PowerDef, PowerDef]; assist?: [number, number] } = {}) {
  const rng = makeRng(seed);
  const g = new SnackSnatch(
    [
      player({ bot: levels[0], power: opts.powers?.[0] ?? null, assist: opts.assist?.[0] ?? 0 }),
      player({ bot: levels[1], power: opts.powers?.[1] ?? null, assist: opts.assist?.[1] ?? 0 }),
    ],
    !!opts.powers,
    rng,
  );
  const bots = [new SnackSnatchBot(0, levels[0], rng), new SnackSnatchBot(1, levels[1], rng)];
  let t = 0;
  while (!g.finished && t < 600) {
    g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
    t += DT;
  }
  return { g, t };
}

const idle: Intent = { snap: [false, false], power: false };

function game(opts: { powers?: [PowerDef | null, PowerDef | null]; assist?: [number, number] } = {}) {
  return new SnackSnatch(
    [player({ power: opts.powers?.[0] ?? null, assist: opts.assist?.[0] ?? 0 }), player({ power: opts.powers?.[1] ?? null, assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    makeRng(9),
  );
}

/** Put one snack on the blanket by hand (and stop the pot from adding more). */
function only(g: SnackSnatch, s: Partial<Snack>): Snack {
  const sn: Snack = { id: 999, x: 180, y: 400, vx: 0, vy: 0, gold: false, r: RULES.snackR, alive: true, kind: 0, ...s };
  g.snacks = [sn];
  (g as unknown as { spawnIn: number }).spawnIn = 99;
  return sn;
}

describe('snack snatch', () => {
  it('bot vs bot ends after 30 seconds (or a short sudden snack)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { g, t } = play(['normal', 'normal'], seed);
      expect(g.finished).toBe(true);
      expect(t).toBeLessThanOrEqual(RULES.matchTime + RULES.suddenTime + 0.1);
      expect(g.score[0] + g.score[1]).toBeGreaterThan(10);
      if (g.winner !== null) expect(g.score[g.winner]).toBeGreaterThanOrEqual(g.score[g.winner === 0 ? 1 : 0]);
    }
  });

  it('bot vs bot with powers also finishes', () => {
    const P = ['magnet', 'sticky', 'double'];
    P.forEach((a, i) => {
      const { g } = play(['normal', 'hard'], 60 + i, { powers: [power('snacksnatch', a), power('snacksnatch', P[(i + 1) % 3])] });
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
      if (s % 2 === 0) hardWins += play(['hard', 'easy'], 200 + s).g.winner === 0 ? 1 : 0;
      else hardWins += play(['easy', 'hard'], 200 + s).g.winner === 1 ? 1 : 0;
    }
    expect(hardWins).toBeGreaterThanOrEqual(7);
  });

  it('a snap gulps a snack in reach; golden snacks are worth 3', () => {
    const g = game();
    const c = g.critters[0][0];
    only(g, { x: c.x, y: c.restY - 60, gold: true, r: RULES.goldR });
    g.step(DT, [{ snap: [true, false], power: false }, idle]);
    for (let i = 0; i < 12; i++) g.step(DT, [idle, idle]);
    expect(g.score).toEqual([RULES.goldValue, 0]);
    expect(g.snacks).toHaveLength(0);
  });

  it('a snack out of reach is not gulped, and a miss leaves the critter dizzy', () => {
    const g = game();
    const c = g.critters[0][0];
    only(g, { x: c.x, y: c.restY - RULES.reach - RULES.headR - RULES.snackR - 8 });
    g.step(DT, [{ snap: [true, false], power: false }, idle]);
    for (let i = 0; i < 15; i++) g.step(DT, [idle, idle]);
    expect(g.score).toEqual([0, 0]);
    expect(c.dizzy).toBe(true);
    expect(c.cooldown).toBeGreaterThan(RULES.cooldown);
    // While cooling down another tap does nothing.
    g.step(DT, [{ snap: [true, false], power: false }, idle]);
    expect(g.events.some((e) => e.type === 'snap')).toBe(false);
  });

  it('the top player snaps downward', () => {
    const g = game();
    const c = g.critters[1][1];
    only(g, { x: c.x, y: c.restY + 70 });
    g.step(DT, [idle, { snap: [false, true], power: false }]);
    for (let i = 0; i < 12; i++) g.step(DT, [idle, idle]);
    expect(g.score).toEqual([0, 1]);
  });

  it('the handicap gives a longer reach', () => {
    const g = game({ assist: [3, 0] });
    expect(g.reach[0]).toBe(RULES.reachMax);
    expect(g.reach[1]).toBe(RULES.reach);
    // A snack just past normal reach is caught with the assist.
    const c = g.critters[0][0];
    only(g, { x: c.x, y: c.restY - RULES.reach - RULES.headR - 4 });
    g.step(DT, [{ snap: [true, false], power: false }, idle]);
    for (let i = 0; i < 12; i++) g.step(DT, [idle, idle]);
    expect(g.score[0]).toBe(1);
  });

  it('a tie goes to a sudden snack, and the first gulp wins', () => {
    const g = game();
    g.score = [5, 5];
    g.timeLeft = DT / 2;
    g.snacks = [];
    g.step(DT, [idle, idle]);
    expect(g.sudden).toBe(true);
    expect(g.finished).toBe(false);
    expect(g.snacks).toHaveLength(2);
    expect(g.snacks.every((s) => s.gold)).toBe(true);
    expect(g.snacks[0].vy).toBeCloseTo(-g.snacks[1].vy);
    const c = g.critters[0][1];
    only(g, { x: c.x, y: c.restY - 50, gold: true, r: RULES.goldR });
    g.step(DT, [{ snap: [false, true], power: false }, idle]);
    for (let i = 0; i < 10 && !g.finished; i++) g.step(DT, [idle, idle]);
    expect(g.finished).toBe(true);
    expect(g.winner).toBe(0);
  });

  it('both players gulping in the same instant of a sudden snack goes again', () => {
    const g = game();
    g.score = [4, 4];
    g.timeLeft = DT / 2;
    g.step(DT, [idle, idle]);
    expect(g.sudden).toBe(true);
    const [a, b] = [g.critters[0][1], g.critters[1][1]];
    g.snacks = [
      { id: 900, x: a.x, y: a.restY - 50, vx: 0, vy: 0, gold: true, r: RULES.goldR, alive: true, kind: 0 },
      { id: 901, x: b.x, y: b.restY + 50, vx: 0, vy: 0, gold: true, r: RULES.goldR, alive: true, kind: 0 },
    ];
    g.step(DT, [{ snap: [false, true], power: false }, { snap: [false, true], power: false }]);
    for (let i = 0; i < 10; i++) g.step(DT, [idle, idle]);
    expect(g.score[0]).toBe(g.score[1]);
    expect(g.finished).toBe(false);
    expect(g.snacks.filter((s) => s.gold)).toHaveLength(2);
  });

  it('the pot deals both players the same snacks: mirrored pairs, gold together', () => {
    for (const seed of [1, 2, 3]) {
      const g = new SnackSnatch([player(), player()], false, makeRng(seed));
      const seen = new Map<number, Snack>();
      for (let i = 0; i < RULES.matchTime / DT && !g.finished; i++) {
        g.step(DT, [idle, idle]);
        for (const s of g.snacks) if (!seen.has(s.id)) seen.set(s.id, { ...s });
      }
      const all = [...seen.values()].sort((p, q) => p.id - q.id);
      expect(all.length).toBeGreaterThanOrEqual(RULES.maxSnacks);
      expect(all.length % 2).toBe(0);
      for (let i = 0; i < all.length; i += 2) {
        const [p, q] = [all[i], all[i + 1]];
        expect(q.id).toBe(p.id + 1);
        expect(q.gold).toBe(p.gold);
        expect(q.kind).toBe(p.kind);
        expect(q.x).toBeCloseTo(p.x);
        expect(q.vx).toBeCloseTo(p.vx);
        expect(q.vy).toBeCloseTo(-p.vy);
        expect(q.y - 320).toBeCloseTo(-(p.y - 320));
      }
    }
  });

  it('assist shortens the dizzy time after a miss, and lets a weaker bot catch up', () => {
    const g = game({ assist: [3, 0] });
    expect(g.missCooldown[0]).toBeCloseTo(RULES.missCooldownMin);
    expect(g.missCooldown[1]).toBeCloseTo(RULES.missCooldown);
    const wins = (assist: number) => {
      let w = 0;
      for (let i = 0; i < 40; i++) if (play(['easy', 'normal'], 500 + i, { assist: [assist, 0] }).g.winner === 0) w++;
      return w;
    };
    expect(wins(3)).toBeGreaterThan(wins(0) + 10);
  });

  it('equal bots split wins evenly between the seats', () => {
    let bottom = 0;
    const N = 120;
    for (let i = 0; i < N; i++) if (play(['normal', 'normal'], 3000 + i).g.winner === 0) bottom++;
    expect(bottom / N).toBeGreaterThan(0.35);
    expect(bottom / N).toBeLessThan(0.65);
  });

  it('a sudden snack nobody gulps ends in a draw', () => {
    const g = game();
    g.score = [3, 3];
    g.timeLeft = DT / 2;
    for (let i = 0; i < (RULES.suddenTime + 1) / DT && !g.finished; i++) g.step(DT, [idle, idle]);
    expect(g.finished).toBe(true);
    expect(g.winner).toBeNull();
  });

  it('magnet mouth pulls snacks toward your critters', () => {
    const g = game({ powers: [power('snacksnatch', 'magnet'), null] });
    g.energy[0].value = 1;
    const sn = only(g, { x: 180, y: 360, vx: 120, vy: 0 });
    g.step(DT, [{ snap: [false, false], power: true }, idle]);
    expect(g.magnetOn(0)).toBe(true);
    for (let i = 0; i < 30; i++) g.step(DT, [idle, idle]);
    expect(sn.vy).toBeGreaterThan(20); // drifting down toward player 0
  });

  it('sticky snacks slow down near you', () => {
    const run = (sticky: boolean) => {
      const g = game({ powers: [power('snacksnatch', 'sticky'), null] });
      const sn = only(g, { x: 30, y: 420, vx: 0, vy: -200 });
      if (sticky) {
        g.energy[0].value = 1;
        g.step(DT, [{ snap: [false, false], power: true }, idle]);
        expect(g.stickyOn(0)).toBe(true);
      }
      for (let i = 0; i < 30; i++) g.step(DT, [idle, idle]);
      return { speed: Math.hypot(sn.vx, sn.vy), y: sn.y };
    };
    const plain = run(false);
    const honey = run(true);
    expect(honey.speed).toBeLessThan(plain.speed / 2);
    expect(honey.y).toBeGreaterThan(plain.y + 40); // it stayed on player 0's side
  });

  it('double grab doubles the reach of the next 3 snaps', () => {
    const g = game({ powers: [power('snacksnatch', 'double'), null] });
    g.energy[0].value = 1;
    g.step(DT, [{ snap: [false, false], power: true }, idle]);
    expect(g.doubleLeft[0]).toBe(RULES.doubleSnaps);
    expect(g.nextReach(0)).toBe(RULES.reach * RULES.doubleScale);
    const c = g.critters[0][0];
    only(g, { x: c.x, y: c.restY - RULES.reach * 1.7 });
    g.step(DT, [{ snap: [true, false], power: false }, idle]);
    for (let i = 0; i < 15; i++) g.step(DT, [idle, idle]);
    expect(g.score[0]).toBe(1);
    expect(g.doubleLeft[0]).toBe(RULES.doubleSnaps - 1);
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < RULES.missCooldown / DT + 2; i++) g.step(DT, [idle, idle]);
      g.step(DT, [{ snap: [true, false], power: false }, idle]);
    }
    expect(g.doubleLeft[0]).toBe(0);
    expect(g.nextReach(0)).toBe(RULES.reach);
  });
});
