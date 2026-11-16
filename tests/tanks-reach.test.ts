// F344: Tank Duel's head start also gives the helped player's shells a longer reach
// (they bonk the other tank from further off), because extra armor alone left an easy
// bot with +3 at 7% against normal: its wobbly aim lands ~1 shot in 12.
import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerIndex } from '../src/core/types';
import { IDLE, reachFor, RULES, TankBot, TankDuel, type Intent } from '../src/games/tanks/logic';
import { DT, player } from './helpers';

const idle2: [Intent, Intent] = [IDLE, IDLE];

function inPlay(assist: [number, number]) {
  const g = new TankDuel([player({ bot: null, assist: assist[0] }), player({ bot: null, assist: assist[1] })], false, makeRng(3));
  for (let i = 0; i < 200 && g.phase !== 'play'; i++) g.step(DT, idle2);
  expect(g.phase).toBe('play');
  return g;
}

/** Park a still shell owned by `owner` d units to the side of tank `at` and step once. */
function hitsAt(g: TankDuel, owner: PlayerIndex, at: PlayerIndex, d: number): boolean {
  const tk = g.tanks[at];
  // Pick a side of the tank that is open arena.
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([x, y]) => !g.arena.solidAt(tk.x + x * d, tk.y + y * d));
  const [dx, dy] = dirs[0];
  g.shells.push({ id: 999, owner, x: tk.x + dx * d, y: tk.y + dy * d, vx: 0, vy: 0, bounces: 1, maxBounces: 2, age: 1, bouncy: false, alive: true });
  g.step(DT, idle2);
  return g.events.some((e) => e.type === 'hit' && e.p === at);
}

function winShare(easyAssist: number, foe: BotLevel, n: number): number {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1;
    const levels: [BotLevel, BotLevel] = swap ? [foe, 'easy'] : ['easy', foe];
    const rng = makeRng(1000 + (i >> 1));
    const g = new TankDuel(
      [player({ bot: levels[0], assist: swap ? 0 : easyAssist }), player({ bot: levels[1], assist: swap ? easyAssist : 0 })],
      false,
      rng,
    );
    const bots = [new TankBot(0, levels[0], rng), new TankBot(1, levels[1], rng)];
    for (let t = 0; t < 300 && !g.over; t += DT) g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
    if (g.winner === (swap ? 1 : 0)) wins++;
  }
  return wins / n;
}

describe('Tank Duel head start: longer reach (F344)', () => {
  it('reach grows with assist, none without help', () => {
    expect(reachFor(0)).toBe(0);
    expect(reachFor(1)).toBeGreaterThan(0);
    expect(reachFor(2)).toBeGreaterThan(reachFor(1));
    expect(reachFor(3)).toBe(RULES.reachMax);
  });

  it("a helped player's shell bonks the other tank from further off", () => {
    const d = RULES.tankR + RULES.shellR + RULES.reachMax - 2;
    expect(hitsAt(inPlay([3, 0]), 0, 1, d)).toBe(true);
    expect(hitsAt(inPlay([0, 0]), 0, 1, d)).toBe(false);
  });

  it("never reaches further toward the helped player's own tank", () => {
    const d = RULES.tankR + RULES.shellR + RULES.reachMax - 2;
    expect(hitsAt(inPlay([3, 0]), 0, 0, d)).toBe(false);
  });

  it('easy with +3 now gives normal a real match (was 7%)', () => {
    const n = 40;
    const ladder = [0, 3].map((a) => winShare(a, 'normal', n));
    expect(ladder[0]).toBeLessThan(0.15);
    expect(ladder[1]).toBeGreaterThan(0.3);
  }, 120_000);
});
