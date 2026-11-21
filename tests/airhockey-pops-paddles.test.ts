import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import type { AirHockey } from '../src/games/airhockey/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F239: Air Hockey's centre pops only dodged the pucks, so they printed over a paddle (the one
// under a person's finger, or the bot's): readable frames on a paddle in bot matches were Giant
// Paddle 67%, Split Puck 49%, Freeze 31%, "Your shot!" 22%, GOAL! 19%. A pop now takes the line
// nearest home that misses the pucks with the most room from both paddles' paths: 1.6-3.1%, and
// GOAL! 7.3% (F239). F240: a pop a paddle runs into once it is 0.2 s old fades out
// (fx.fadeNear()), mostly the conceding player's GOAL! as their paddle races to the served puck:
// GOAL! 0.8%, the rest 0-0.4%.
describe('Air Hockey: centre pops start clear of the paddles', () => {
  it('in bot matches at every level with powers, both seats', () => {
    const list = (powers.games as Record<string, PowerDef[]>).airhockey;
    const total: Record<string, number> = {};
    const covered: Record<string, number> = {};
    const seats = new Set<number>();
    for (const level of ['easy', 'normal', 'hard'] as const) {
      // 30 seeds a level: with 5 powers in the pool, 9 seeds gave each power only a few matches
      // and GOAL! read 1.1% on the luck of the draw (0.4-0.7% for every power over 450 matches).
      for (let seed = 1; seed <= 30; seed++) {
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: list[seed % list.length] }), player({ bot: level, power: list[(seed + 1) % list.length] })];
        const fx = new Fx();
        const view = GAMES.airhockey.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: AirHockey; update(dt: number, i: Input): void };
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        const g = view.game;
        for (let i = 0; i < 60 * 200 && g.winner === null; i++) {
          view.update(DT, input);
          fx.update(DT);
          for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
            if (f.x !== W / 2 || f.life < 0.45) continue;
            seats.add(f.player);
            const key = f.str.startsWith('GOAL') ? 'GOAL!' : f.str;
            total[key] = (total[key] ?? 0) + 1;
            const w = ([...f.str].length * f.size * 0.55) / 2;
            const onPaddle = ([0, 1] as const).some((p) => {
              const pd = g.paddles[p];
              const nx = Math.max(f.x - w, Math.min(f.x + w, pd.x));
              const ny = Math.max(f.y - f.size * 0.45, Math.min(f.y + f.size * 0.45, pd.y));
              return Math.hypot(pd.x - nx, pd.y - ny) < g.paddleRadius(p);
            });
            if (onPaddle) covered[key] = (covered[key] ?? 0) + 1;
          }
        }
      }
    }
    for (const k of Object.keys(total)) console.log(`airhockey ${k}: ${covered[k] ?? 0}/${total[k]} readable frames on a paddle`);
    expect([...seats].sort()).toEqual([0, 1]);
    for (const k of ['GOAL!', 'Your shot!', ...list.map((pw) => `${pw.icon} ${pw.name}!`)]) {
      expect(total[k], k).toBeGreaterThan(200);
      expect((covered[k] ?? 0) / total[k], k).toBeLessThan(0.01);
    }
  }, 120_000); // whole bot matches: GitHub CI runs ~3x slower than a laptop
});

describe('fx.fadeNear (F240)', () => {
  it('fades a pop a piece covers once it is a moment old, and leaves a young one', () => {
    const fx = new Fx();
    const floaters = () => (fx as unknown as { floaters: Floater[] }).floaters;
    fx.pop('GOAL!', 180, 500, '#fff', 0, 40);
    fx.fadeNear(180, 500, 26, 0.15, 0.2);
    expect(floaters()[0].life).toBeCloseTo(0.9);
    fx.update(0.25);
    fx.fadeNear(300, 300, 26, 0.15, 0.2);
    expect(floaters()[0].life).toBeGreaterThan(0.6);
    fx.fadeNear(200, 510, 26, 0.15, 0.2);
    expect(floaters()[0].life).toBeLessThanOrEqual(0.15);
  });
});
