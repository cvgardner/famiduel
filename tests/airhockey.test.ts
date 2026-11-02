import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { AirHockey, AirHockeyBot, RULES } from '../src/games/airhockey/logic';
import { H } from '../src/engine/world';
import { DT, player, power } from './helpers';

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: boolean; assist?: [number, number] } = {}) {
  const rng = makeRng(seed);
  const pw = opts.powers ? power('airhockey', 'giant') : null;
  const g = new AirHockey(
    [player({ bot: levels[0], power: pw, assist: opts.assist?.[0] ?? 0 }), player({ bot: levels[1], power: pw, assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    rng,
  );
  const bots = [new AirHockeyBot(0, levels[0], rng), new AirHockeyBot(1, levels[1], rng)];
  let t = 0;
  while (g.winner === null && t < 600) {
    g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
    t += DT;
  }
  return { g, t };
}

describe('air hockey', () => {
  it('bot vs bot reaches a winner at 5 goals in reasonable time', () => {
    for (const seed of [1, 2, 3]) {
      const { g, t } = play(['normal', 'normal'], seed);
      expect(g.winner).not.toBeNull();
      expect(Math.max(...g.score)).toBe(RULES.winScore);
      expect(t).toBeLessThan(300);
    }
  });

  it('is deterministic for a seed', () => {
    const a = play(['hard', 'easy'], 7);
    const b = play(['hard', 'easy'], 7);
    expect(a.g.score).toEqual(b.g.score);
    expect(a.t).toBe(b.t);
  });

  it('a hard bot beats an easy bot most of the time', () => {
    let hardWins = 0;
    for (let s = 0; s < 8; s++) if (play(['hard', 'easy'], 100 + s).g.winner === 0) hardWins++;
    expect(hardWins).toBeGreaterThanOrEqual(5);
  });

  it('assist widens the goal you shoot at and grows your paddle', () => {
    const g = new AirHockey([player({ assist: 3 }), player()], false, makeRng(1));
    expect(g.goalAt('top')).toBe(RULES.goalWMax);
    expect(g.goalAt('bottom')).toBe(RULES.goalW);
    expect(g.paddleRadius(0)).toBe(RULES.paddleRMax);
  });

  it('paddles stay in their own half', () => {
    const g = new AirHockey([player(), player()], false, makeRng(1));
    for (let i = 0; i < 120; i++) g.step(DT, [{ tx: 180, ty: 0, power: false }, { tx: 180, ty: 640, power: false }]);
    expect(g.paddles[0].y).toBeGreaterThanOrEqual(320);
    expect(g.paddles[1].y).toBeLessThanOrEqual(320);
  });

  it('freeze stops the other paddle; split makes two pucks', () => {
    const g = new AirHockey([player({ power: power('airhockey', 'freeze') }), player({ power: power('airhockey', 'split') })], true, makeRng(3));
    g.energy[0].value = 1;
    g.energy[1].value = 1;
    g.serve = 0;
    g.pucks[0].vx = 200;
    g.pucks[0].vy = 100;
    g.step(DT, [{ tx: 180, ty: 560, power: true }, { tx: 180, ty: 80, power: true }]);
    expect(g.paddles[1].frozen).toBeGreaterThan(0);
    expect(g.pucks).toHaveLength(2);
    const y = g.paddles[1].y;
    g.step(DT, [{ tx: 180, ty: 560, power: false }, { tx: 100, ty: 200, power: false }]);
    expect(g.paddles[1].y).toBe(y);
  });

  describe('stall rule', () => {
    const idle = (g: AirHockey, p: 0 | 1) => ({ tx: g.paddles[p].x, ty: g.paddles[p].y, power: false });

    it('a puck resting in one half is nudged, then blown just past the centre line', () => {
      const g = new AirHockey([player(), player()], false, makeRng(5));
      g.resetPuck(0);
      const events: { type: string; t: number; p?: number }[] = [];
      let crossedAt = -1;
      let maxPast = 0;
      for (let t = 0; t < 14; t += DT) {
        g.step(DT, [idle(g, 0), idle(g, 1)]);
        for (const e of g.events) if (e.type === 'nudge' || e.type === 'drift') events.push({ type: e.type, t: g.t, p: e.p });
        const pk = g.pucks[0];
        if (crossedAt < 0 && pk.y < 320) crossedAt = g.t;
        if (crossedAt > 0 && g.t < crossedAt + 6) maxPast = Math.max(maxPast, 320 - pk.y);
      }
      const serve = RULES.serveDelay;
      expect(events[0]).toMatchObject({ type: 'nudge', p: 0 });
      expect(events[0].t).toBeCloseTo(serve + RULES.nudgeAfter, 1);
      expect(events[1]).toMatchObject({ type: 'drift', p: 0 });
      expect(events[1].t).toBeCloseTo(serve + RULES.driftAfter, 1);
      // It crosses within a couple of seconds and stops short of the far goal.
      expect(crossedAt - events[1].t).toBeLessThan(2);
      expect(maxPast).toBeGreaterThan(RULES.driftPast * 0.7);
      expect(maxPast).toBeLessThan(RULES.driftPast + 10);
      expect(g.score).toEqual([0, 0]);
    });

    it('two players who walk away: the puck goes back and forth, nobody scores', () => {
      const g = new AirHockey([player(), player()], false, makeRng(9));
      const halves = new Set<number>();
      for (let t = 0; t < 60; t += DT) {
        g.step(DT, [idle(g, 0), idle(g, 1)]);
        halves.add(AirHockey.halfOf(g.pucks[0].y));
      }
      expect(halves.size).toBe(2);
      expect(g.score).toEqual([0, 0]);
    });

    it('a match against a bot ends even if the person never moves', () => {
      let botWins = 0;
      for (const seed of [1, 2, 3, 4]) {
        for (const level of ['easy', 'normal', 'hard'] as BotLevel[]) {
          const rng = makeRng(seed);
          const g = new AirHockey([player(), player({ bot: level })], false, rng);
          const bot = new AirHockeyBot(1, level, rng);
          let t = 0;
          while (g.winner === null && t < 300) {
            g.step(DT, [idle(g, 0), bot.think(g, DT)]);
            t += DT;
          }
          expect(g.winner, `${level} seed ${seed}`).not.toBeNull();
          if (g.winner === 1) botWins++;
        }
      }
      // A still paddle in front of its goal can deflect a shot in, but the bot mostly wins.
      expect(botWins).toBeGreaterThanOrEqual(9);
    });

    it('a bot almost never loses to a person who never moves, at any level', () => {
      // Before the bot walked around the puck it often dragged its own shots back
      // into its own goal: an idle person beat the easy bot in 21 of 40 matches and
      // the hard bot in 10 of 40, with nearly one own goal per goal scored.
      for (const level of ['easy', 'normal', 'hard'] as BotLevel[]) {
        let botWins = 0;
        let own = 0;
        let scored = 0;
        for (let seed = 1; seed <= 20; seed++) {
          for (const p of [0, 1] as const) {
            const rng = makeRng(seed);
            const g = new AirHockey([player({ bot: level }), player({ bot: level })], false, rng);
            const bot = new AirHockeyBot(p === 0 ? 1 : 0, level, rng);
            let t = 0;
            while (g.winner === null && t < 600) {
              const b = bot.think(g, DT);
              g.step(DT, p === 0 ? [idle(g, 0), b] : [b, idle(g, 1)]);
              t += DT;
            }
            if (g.winner === bot.p) botWins++;
            own += g.score[p];
            scored += g.score[bot.p];
          }
        }
        // 40 matches a level (10 was too few to tell luck from a change). Before the
        // smooth hand the bot won 69/80 (easy) and 76/80 (hard) of these.
        expect(botWins, level).toBeGreaterThanOrEqual(level === 'easy' ? 32 : 36);
        // Own goals (the idle seat never touches the puck on purpose) stay well under the bot's goals.
        expect(own / scored, level).toBeLessThan(level === 'easy' ? 0.7 : 0.35);
      }
    });

    it('a bot in front of the puck goes around it instead of pushing it at its own goal', () => {
      for (const level of ['easy', 'normal', 'hard'] as BotLevel[]) {
        for (const x of [120, 180, 240]) {
          const rng = makeRng(7);
          const g = new AirHockey([player({ bot: level }), player()], false, rng);
          g.serve = 0;
          // Puck resting deep in player 0's half; the bot's paddle sits between it and the centre line.
          g.pucks = [{ x, y: 520, vx: 0, vy: 0, alive: true }];
          g.paddles[0].x = x;
          g.paddles[0].y = 440;
          const bot = new AirHockeyBot(0, level, rng);
          let firstHitVy: number | null = null;
          for (let t = 0; t < 1.5 && firstHitVy === null; t += DT) {
            g.step(DT, [bot.think(g, DT), idle(g, 1)]);
            if (g.events.some((e) => e.type === 'hit' && e.p === 0)) firstHitVy = g.pucks[0]?.vy ?? 0;
          }
          expect(g.score[1], `${level} x ${x}`).toBe(0);
          // Its first touch sends the puck up the table (toward the goal it attacks), not down at its own.
          expect(firstHitVy, `${level} x ${x}`).not.toBeNull();
          expect(firstHitVy!, `${level} x ${x}`).toBeLessThan(0);
        }
      }
    });

    it('a puck resting on the bot\'s own back wall is cleared sideways, not jabbed in', () => {
      for (const level of ['easy', 'normal', 'hard'] as BotLevel[]) {
        for (const x of [150, 180, 210]) {
          const rng = makeRng(3);
          const g = new AirHockey([player({ bot: level }), player()], false, rng);
          g.serve = 0;
          g.pucks = [{ x, y: H - RULES.wall - RULES.puckR - 2, vx: 0, vy: 0, alive: true }];
          g.paddles[0].x = x;
          g.paddles[0].y = H - 120;
          const bot = new AirHockeyBot(0, level, rng);
          for (let t = 0; t < 2 && g.winner === null; t += DT) g.step(DT, [bot.think(g, DT), idle(g, 1)]);
          expect(g.score[1], `${level} x ${x}`).toBe(0);
        }
      }
    });

    it('a rally that keeps crossing is never touched', () => {
      const { g } = play(['hard', 'hard'], 4);
      expect(g.winner).not.toBeNull();
      const g2 = new AirHockey([player(), player()], false, makeRng(1));
      g2.serve = 0;
      g2.pucks[0] = { x: 180, y: 400, vx: 0, vy: 0, alive: true };
      for (let t = 0; t < RULES.nudgeAfter - 0.5; t += DT) g2.step(DT, [idle(g2, 0), idle(g2, 1)]);
      g2.pucks[0].y = 200; // it crossed: the clock starts again for the other half
      g2.step(DT, [idle(g2, 0), idle(g2, 1)]);
      expect(g2.held).toMatchObject({ p: 1 });
      expect(g2.held!.t).toBeLessThan(0.1);
    });
  });
});
