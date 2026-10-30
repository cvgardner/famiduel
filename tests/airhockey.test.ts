import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { AirHockey, AirHockeyBot, RULES } from '../src/games/airhockey/logic';
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
});
