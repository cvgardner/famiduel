import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { PingPong, PingPongBot, predictX, RULES, type Intent } from '../src/games/pingpong/logic';
import { DT, player, power } from './helpers';

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: [string, string]; assist?: [number, number] } = {}) {
  const rng = makeRng(seed);
  const pw = (i: 0 | 1) => (opts.powers ? power('pingpong', opts.powers[i]) : null);
  const g = new PingPong(
    [player({ bot: levels[0], power: pw(0), assist: opts.assist?.[0] ?? 0 }), player({ bot: levels[1], power: pw(1), assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    rng,
  );
  const bots = [new PingPongBot(0, levels[0], rng), new PingPongBot(1, levels[1], rng)];
  let t = 0;
  let maxHits = 0;
  while (g.winner === null && t < 900) {
    g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
    maxHits = Math.max(maxHits, g.hits);
    t += DT;
  }
  return { g, t, maxHits };
}

/** Put the ball in flight toward player `to` from the far paddle, straight down the middle. */
function rallyToward(g: PingPong, to: 0 | 1, speed = 400) {
  g.serveT = 0;
  g.pointT = 0;
  const b = g.ball;
  b.x = 180;
  b.y = g.faceY(to === 0 ? 1 : 0);
  b.vx = 0;
  b.vy = to === 0 ? speed : -speed;
  b.fromY = b.y;
  b.toY = g.faceY(to);
  b.ax = 0;
}

const still = (x = 180): Intent => ({ tx: x, power: false });

describe('ping pong', () => {
  it('bot vs bot reaches a winner in reasonable time', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { g, t } = play(['normal', 'normal'], seed);
      expect(g.winner).not.toBeNull();
      const [w, l] = [g.score[g.winner!], g.score[1 - g.winner!]];
      expect(w >= RULES.hardCap || (w >= RULES.winScore && w - l >= RULES.winBy)).toBe(true);
      expect(t).toBeLessThan(300);
    }
  });

  it('finishes with powers on too', () => {
    for (const seed of [5, 6]) {
      const { g, t } = play(['normal', 'normal'], seed, { powers: ['smash', 'curve'] });
      expect(g.winner).not.toBeNull();
      expect(t).toBeLessThan(300);
      const r = play(['easy', 'hard'], seed, { powers: ['slowmo', 'smash'] });
      expect(r.g.winner).not.toBeNull();
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
    expect(hardWins).toBeGreaterThanOrEqual(6);
  });

  it('assist grows the paddle and slows the ball toward the assisted player only', () => {
    const g = new PingPong([player({ assist: 3 }), player()], false, makeRng(1));
    expect(g.paddles[0].w).toBe(RULES.paddleWMax);
    expect(g.paddles[1].w).toBe(RULES.paddleW);
    rallyToward(g, 0);
    const y0 = g.ball.y;
    g.step(DT, [still(), still()]);
    const down = g.ball.y - y0;
    rallyToward(g, 1);
    const y1 = g.ball.y;
    g.step(DT, [still(), still()]);
    const up = y1 - g.ball.y;
    expect(down / up).toBeCloseTo(RULES.assistSlow, 5);
  });

  it('where the ball hits the paddle sets the angle, and the rally speeds up to a cap', () => {
    const g = new PingPong([player(), player()], false, makeRng(2));
    rallyToward(g, 0);
    g.ball.x = 180 + 30; // right side of player 0's paddle
    let hit = false;
    for (let i = 0; i < 200 && !hit; i++) {
      g.step(DT, [still(), still()]);
      hit = g.events.some((e) => e.type === 'hit');
    }
    expect(hit).toBe(true);
    expect(g.ball.vx).toBeGreaterThan(0);
    expect(g.ball.vy).toBeLessThan(0);
    const s1 = Math.hypot(g.ball.vx, g.ball.vy);
    expect(s1).toBeCloseTo(RULES.serveSpeed + RULES.speedUp, 3);
    g.rally = RULES.maxSpeed;
    rallyToward(g, 0);
    for (let i = 0; i < 200 && g.ball.vy > 0; i++) g.step(DT, [still(), still()]);
    expect(Math.hypot(g.ball.vx, g.ball.vy)).toBeCloseTo(RULES.maxSpeed, 3);
  });

  it('paddle speed is capped the same for everyone', () => {
    const g = new PingPong([player(), player()], false, makeRng(3));
    g.step(DT, [still(0), still(360)]);
    expect(Math.abs(g.paddles[0].x - 180)).toBeCloseTo(RULES.paddleSpeed * DT, 5);
    expect(Math.abs(g.paddles[1].x - 180)).toBeCloseTo(RULES.paddleSpeed * DT, 5);
  });

  it('serve alternates every 2 points, every point at deuce', () => {
    const g = new PingPong([player(), player()], false, makeRng(4));
    const f = g.firstServer;
    expect([0, 1, 2, 3, 4].map((n) => g.serverFor(n))).toEqual([f, f, 1 - f, 1 - f, f]);
    g.score = [6, 6];
    expect(g.serverFor(12)).toBe(f);
    expect(g.serverFor(13)).toBe(1 - f);
  });

  it('a missed ball scores for the other player; win by 2', () => {
    const g = new PingPong([player(), player()], false, makeRng(5));
    g.score = [6, 6];
    rallyToward(g, 0);
    g.ball.x = 40;
    for (let i = 0; i < 200 && g.score[1] === 6; i++) g.step(DT, [still(320), still()]);
    expect(g.score).toEqual([6, 7]);
    expect(g.winner).toBeNull();
    g.score = [6, 8];
    g.pointT = 0;
    rallyToward(g, 0);
    g.ball.x = 40;
    for (let i = 0; i < 200 && g.winner === null; i++) g.step(DT, [still(320), still()]);
    expect(g.winner).toBe(1);
  });

  it('Smash makes the next return very fast', () => {
    const g = new PingPong([player({ power: power('pingpong', 'smash') }), player()], true, makeRng(6));
    g.energy[0].value = 1;
    rallyToward(g, 0);
    g.step(DT, [{ tx: 180, power: true }, still()]);
    expect(g.paddles[0].smash).toBe(true);
    for (let i = 0; i < 200 && g.ball.vy > 0; i++) g.step(DT, [still(), still()]);
    expect(Math.hypot(g.ball.vx, g.ball.vy)).toBeCloseTo(RULES.smashSpeed, 3);
    expect(g.ball.smash).toBe(true);
    expect(g.paddles[0].smash).toBe(false);
  });

  it('Slow-mo slows the ball coming toward you, not away', () => {
    const g = new PingPong([player({ power: power('pingpong', 'slowmo') }), player()], true, makeRng(7));
    g.energy[0].value = 1;
    rallyToward(g, 0);
    const y0 = g.ball.y;
    g.step(DT, [{ tx: 180, power: true }, still()]);
    expect(g.paddles[0].slowmo).toBeGreaterThan(0);
    expect((g.ball.y - y0) / (400 * DT)).toBeCloseTo(RULES.slowmo, 5);
    rallyToward(g, 1);
    const y1 = g.ball.y;
    g.step(DT, [still(), still()]);
    expect((y1 - g.ball.y) / (400 * DT)).toBeCloseTo(1, 5);
  });

  it('Curve Ball bends the next return away from the other paddle', () => {
    const g = new PingPong([player({ power: power('pingpong', 'curve') }), player()], true, makeRng(8));
    g.energy[0].value = 1;
    g.paddles[1].x = 100; // opponent on the left
    rallyToward(g, 0);
    g.step(DT, [{ tx: 180, power: true }, still(100)]);
    for (let i = 0; i < 200 && g.ball.vy > 0; i++) g.step(DT, [still(), still(100)]);
    const straight = predictX(g.ball, g.faceY(1));
    for (let i = 0; i < 300 && g.ball.vy < 0 && g.ball.y > g.faceY(1) + 20; i++) g.step(DT, [still(), still(100)]);
    expect(g.ball.ax).toBeGreaterThan(0);
    expect(g.ball.x).toBeGreaterThan(straight + 40);
  });
});
