import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerInfo } from '../src/core/types';
import { HOLES, Minigolf, MinigolfBot, NO_INTENT, RULES, type Intent } from '../src/games/minigolf/logic';
import { compileCourse, inZone, NO_MODS, PHYS, pointInPoly, rollFrame, simulate, startRoll } from '../src/games/minigolf/physics';
import { DT, player, power } from './helpers';

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: [string, string]; assist?: [number, number]; holes?: string[] } = {}) {
  const rng = makeRng(seed);
  const pw = (i: 0 | 1) => (opts.powers ? power('minigolf', opts.powers[i]) : null);
  const g = new Minigolf(
    [player({ bot: levels[0], power: pw(0), assist: opts.assist?.[0] ?? 0 }), player({ bot: levels[1], power: pw(1), assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    rng,
    opts.holes,
  );
  const bots = [new MinigolfBot(0, levels[0], rng), new MinigolfBot(1, levels[1], rng)];
  let t = 0;
  const fired: string[] = [];
  while (!g.finished && t < 900) {
    g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
    for (const e of g.events) if (e.type === 'power') fired.push(e.id);
    t += DT;
  }
  return { g, t, fired };
}

/** A game with no bots, already at player `p`'s aim phase on the given hole. */
function atAim(holeId: string, players: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: null })], powersOn = false) {
  const g = new Minigolf(players, powersOn, makeRng(1), [holeId]);
  let n = 0;
  while (g.phase !== 'aim' && n++ < 1000) g.step(DT, [NO_INTENT, NO_INTENT]);
  return g;
}

function shoot(g: Minigolf, angle: number, power: number): void {
  const intents: [Intent, Intent] = [NO_INTENT, NO_INTENT];
  intents[g.shooter] = { shot: { angle, power }, power: false };
  g.step(DT, intents);
  let n = 0;
  while (g.phase === 'roll' && n++ < 2000) g.step(DT, [NO_INTENT, NO_INTENT]);
}

describe('minigolf holes', { timeout: 60_000 }, () => {
  it('has at least 6 hand-made holes with tee and cup on dry grass inside the walls', () => {
    expect(HOLES.length).toBeGreaterThanOrEqual(6);
    for (const h of HOLES) {
      const c = compileCourse(h);
      for (const [x, y] of [h.tee, h.cup]) {
        expect(pointInPoly(x, y, c.border), h.id).toBe(true);
        expect(c.zones.some((z) => z.type === 'water' && inZone(z, x, y)), h.id).toBe(false);
        // inside the on-screen course area, symmetric so the 180° view turn keeps it visible
        expect(y).toBeGreaterThan(72);
        expect(y).toBeLessThan(568);
      }
      for (const w of h.walls) for (const [x, y] of w.pts) expect(y >= 70 && y <= 570 && x >= 20 && x <= 340, h.id).toBe(true);
    }
  });

  it('a match plays 3 different holes picked by the seed, easier first', () => {
    const a = new Minigolf([player(), player()], false, makeRng(5));
    const b = new Minigolf([player(), player()], false, makeRng(5));
    expect(a.holes.map((h) => h.id)).toEqual(b.holes.map((h) => h.id));
    expect(new Set(a.holes.map((h) => h.id)).size).toBe(3);
    const idx = a.holes.map((h) => HOLES.indexOf(h));
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
    const seen = new Set<string>();
    for (let s = 0; s < 20; s++) for (const h of new Minigolf([player(), player()], false, makeRng(s)).holes) seen.add(h.id);
    expect(seen.size).toBe(HOLES.length);
  });

  it('every hole is playable: a hard bot holes out under the stroke cap', () => {
    for (const h of HOLES) {
      const { g } = play(['hard', 'hard'], 3, { holes: [h.id] });
      expect(g.card[0].strokes[0], h.id).toBeLessThan(RULES.strokeCap);
    }
  });
});

describe('minigolf match', { timeout: 60_000 }, () => {
  it('bot vs bot finishes 3 holes in a sane time', () => {
    for (const seed of [1, 2, 3]) {
      const { g, t } = play(['normal', 'normal'], seed);
      expect(g.finished).toBe(true);
      expect(g.card).toHaveLength(3);
      expect(t).toBeLessThan(300);
      expect(g.score).toEqual([0, 1].map((p) => g.card.reduce((s, h) => s + h.net[p], 0)));
      if (g.score[0] !== g.score[1]) expect(g.winner).toBe(g.score[0] < g.score[1] ? 0 : 1);
      else expect(g.winner).toBeNull();
    }
  });

  it('is deterministic for a seed', () => {
    const a = play(['hard', 'easy'], 7, { powers: ['wind', 'ghost'] });
    const b = play(['hard', 'easy'], 7, { powers: ['wind', 'ghost'] });
    expect(a.g.card.map((h) => h.strokes)).toEqual(b.g.card.map((h) => h.strokes));
    expect(a.t).toBe(b.t);
  });

  it('a hard bot beats an easy bot most of the time', () => {
    let hardWins = 0;
    for (let s = 0; s < 8; s++) if (play(['hard', 'easy'], 200 + s).g.winner === 0) hardWins++;
    expect(hardWins).toBeGreaterThanOrEqual(6);
  });

  it('an easy bot plays over par, like a young kid, and a normal bot about par', () => {
    // Strokes over par per hole, both seats, every hole, 2 seeds each.
    const overPar = (level: BotLevel) => {
      let over = 0;
      let n = 0;
      for (const h of HOLES) {
        for (let s = 0; s < 2; s++) {
          const { g } = play([level, level], 500 + s, { holes: [h.id] });
          for (const st of g.card[0].strokes) {
            over += st - h.par;
            n++;
          }
        }
      }
      return over / n;
    };
    // Measured (10 seeds): easy +0.8 over par, normal -0.5. Before this change easy was
    // -0.0 (under par on most holes, 22 aces in 160 holes), too strong for a 6-year-old.
    expect(overPar('easy')).toBeGreaterThanOrEqual(0.4);
    expect(overPar('normal')).toBeLessThanOrEqual(0.1);
  });

  it('players alternate shots and the shot is the shooter only', () => {
    const g = atAim('zigzag');
    const first = g.shooter;
    // The other player trying to shoot does nothing.
    const intents: [Intent, Intent] = [NO_INTENT, NO_INTENT];
    intents[first === 0 ? 1 : 0] = { shot: { angle: 0, power: 1 }, power: false };
    g.step(DT, intents);
    expect(g.phase).toBe('aim');
    shoot(g, -Math.PI / 2, 0.3);
    for (let n = 0; g.phase !== 'aim' && n < 5000; n++) g.step(DT, [NO_INTENT, NO_INTENT]);
    expect(g.shooter).not.toBe(first);
  });

  it('water costs a penalty stroke and returns the ball to where it was hit from', () => {
    const g = atAim('pond');
    const p = g.shooter;
    const b = g.balls[p];
    const [x0, y0] = [b.x, b.y];
    shoot(g, -Math.PI / 2, 0.8); // straight into the pond
    expect(b.strokes).toBe(2);
    expect([b.x, b.y]).toEqual([x0, y0]);
  });

  it('a ball is picked up at the stroke cap', () => {
    const g = atAim('zigzag');
    const p = g.shooter;
    for (let i = 0; i < RULES.strokeCap; i++) {
      for (let n = 0; !(g.phase === 'aim' && g.shooter === p) && n < 5000; n++) {
        if (g.phase === 'aim') shoot(g, Math.PI / 2, 0.06); // the other player putts too
        else g.step(DT, [NO_INTENT, NO_INTENT]);
      }
      shoot(g, Math.PI / 2, 0.06); // tiny putts backward
    }
    expect(g.balls[p].done).toBe(true);
    expect(g.balls[p].sunk).toBe(false);
    expect(g.balls[p].strokes).toBe(RULES.strokeCap);
  });

  it('a straight putt drops in the cup, a screamer lips out', () => {
    const c = compileCourse(HOLES.find((h) => h.id === 'warmup')!);
    const slow = simulate(c, 180, 200, -Math.PI / 2, 0.25, 0, NO_MODS, DT);
    expect(slow.roll.status).toBe('sunk');
    // A full-power ball rolls right over the cup (it may still drop in later, after the back wall).
    const r = startRoll(180, 200, -Math.PI / 2, 1, 0, NO_MODS);
    let passed = false;
    for (let i = 0; i < 60 && r.status === 'roll'; i++) {
      rollFrame(c, r, DT, NO_MODS);
      if (r.y < 130 - PHYS.cupR - 2) passed = true;
    }
    expect(passed).toBe(true);
  });

  it('moving obstacles depend on game time: same timing, same shot', () => {
    const c = compileCourse(HOLES.find((h) => h.id === 'windmill')!);
    const a = simulate(c, 180, 525, -Math.PI / 2, 0.8, 1.0, NO_MODS, DT);
    const b = simulate(c, 180, 525, -Math.PI / 2, 0.8, 1.0, NO_MODS, DT);
    expect([a.roll.x, a.roll.y]).toEqual([b.roll.x, b.roll.y]);
    const ends = new Set<string>();
    for (const t of [0, 0.3, 0.6, 0.9, 1.2]) {
      const r = simulate(c, 180, 525, -Math.PI / 2, 0.8, t, NO_MODS, DT).roll;
      ends.add(`${r.status}:${Math.round(r.x)},${Math.round(r.y)}`);
    }
    expect(ends.size).toBeGreaterThan(1);
  });
});

describe('minigolf handicap', { timeout: 60_000 }, () => {
  it('assist lengthens the aim guide and, from 2, takes a stroke off each hole', () => {
    const g = new Minigolf([player({ assist: 3 }), player({ assist: 1 })], false, makeRng(1));
    expect(g.guideLen(0)).toBe(RULES.guideMax);
    expect(g.guideLen(1)).toBeGreaterThan(RULES.guideMin);
    expect(g.guideLen(1)).toBeLessThan(RULES.guideMax);
    expect(g.bonus(0)).toBe(1);
    expect(g.bonus(1)).toBe(0);
    const { g: m } = play(['normal', 'normal'], 4, { assist: [2, 0] });
    for (const h of m.card) {
      expect(h.bonus).toEqual([1, 0]);
      expect(h.net[0]).toBe(Math.max(1, h.strokes[0] - 1));
      expect(h.net[1]).toBe(h.strokes[1]);
    }
  });
});

describe('minigolf powers', { timeout: 60_000 }, () => {
  const withPowers = (a: string, b: string) => [player({ bot: null, power: power('minigolf', a) }), player({ bot: null, power: power('minigolf', b) })] as [PlayerInfo, PlayerInfo];

  it('wind gust is armed on the opponent, shown before they shoot, and pushes the ball', () => {
    const g = atAim('zigzag', withPowers('wind', 'wind'), true);
    const p = g.shooter;
    const q = p === 0 ? 1 : 0;
    g.energy[q].value = 1;
    const intents: [Intent, Intent] = [NO_INTENT, NO_INTENT];
    intents[q] = { shot: null, power: true };
    g.step(DT, intents);
    expect(g.energy[q].value).toBe(0);
    expect(g.wind[p]?.dir).not.toBeNull();
    const mods = g.modsFor(p);
    expect(mods.wind).not.toBeNull();
    const b = g.balls[p];
    const calm = simulate(g.course, b.x, b.y, -Math.PI / 2, 0.5, g.t + DT, NO_MODS, DT).roll;
    const windy = simulate(g.course, b.x, b.y, -Math.PI / 2, 0.5, g.t + DT, mods, DT).roll;
    expect(Math.hypot(calm.x - windy.x, calm.y - windy.y)).toBeGreaterThan(20);
    // It is used up by that one shot.
    shoot(g, -Math.PI / 2, 0.3);
    expect(g.wind[p]).toBeNull();
  });

  it('magnet hole pulls in a ball that would roll past', () => {
    const c = compileCourse(HOLES.find((h) => h.id === 'warmup')!);
    // Aim a little wide of the cup.
    const miss = simulate(c, 150, 320, Math.atan2(130 - 320, 180 + 34 - 150), 0.5, 0, NO_MODS, DT).roll;
    expect(miss.status).not.toBe('sunk');
    const pulled = simulate(c, 150, 320, Math.atan2(130 - 320, 180 + 34 - 150), 0.5, 0, { ...NO_MODS, magnet: true }, DT).roll;
    expect(pulled.status).toBe('sunk');
    expect(PHYS.magnet.radius).toBeGreaterThan(PHYS.cupR * 4);
  });

  it('ghost ball passes through one inner wall, never the border', () => {
    const c = compileCourse(HOLES.find((h) => h.id === 'zigzag')!);
    // Straight up from below the first inner wall (y 425..437).
    const blocked = simulate(c, 120, 500, -Math.PI / 2, 0.6, 0, NO_MODS, DT).roll;
    expect(blocked.y).toBeGreaterThan(437);
    const ghost = simulate(c, 120, 500, -Math.PI / 2, 0.6, 0, { ...NO_MODS, ghost: true }, DT).roll;
    expect(ghost.y).toBeLessThan(425);
    // Into the side border: it still bounces.
    const side = simulate(c, 300, 500, 0, 1, 0, { ...NO_MODS, ghost: true }, DT).roll;
    expect(pointInPoly(side.x, side.y, c.border)).toBe(true);
  });

  it('magnet and ghost apply to your own next shot only, then clear', () => {
    const g = atAim('warmup', withPowers('magnet', 'ghost'), true);
    g.energy[0].value = 1;
    g.energy[1].value = 1;
    g.step(DT, [{ shot: null, power: true }, { shot: null, power: true }]);
    expect(g.magnet[0]).toBe(true);
    expect(g.ghost[1]).toBe(true);
    const p = g.shooter;
    shoot(g, -Math.PI / 2, 0.2);
    expect(g.rollMods.magnet || g.rollMods.ghost).toBe(true);
    expect(g.magnet[p] || g.ghost[p]).toBe(false);
    expect(g.magnet[1 - p] || g.ghost[1 - p]).toBe(true);
  });

  it('energy charges from shots, faster when behind, and bots fire their powers', () => {
    const g = atAim('zigzag', [player({ bot: null, power: power('minigolf', 'magnet') }), player({ bot: null, power: power('minigolf', 'magnet') })], true);
    const p = g.shooter;
    shoot(g, Math.PI / 2, 0.06);
    expect(g.energy[p].value).toBeCloseTo(RULES.energyShot, 5);
    const { fired } = play(['normal', 'normal'], 11, { powers: ['wind', 'magnet'] });
    expect(fired).toContain('wind');
    expect(fired).toContain('magnet');
  });
});
