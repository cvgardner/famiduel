import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { MID, W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { RULES, type PingPong } from '../src/games/pingpong/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F197: a power's name popped at MID ± 50 for both seats, and powers are used with the ball
// near the net, so "🐢 Slow-mo Return!" sat on the slowed ball in 382 of 4,836 readable frames.
describe('Ping Pong: power names start clear of the ball', () => {
  it('in bot matches with every power pair, both seats, each copy in its own half', () => {
    const list = (powers.games as Record<string, PowerDef[]>).pingpong;
    const names = new Set(list.map((p) => `${p.icon} ${p.name}!`));
    let frames = 0;
    let covered = 0;
    const seats = new Set<number>();
    for (const seed of [1, 2, 3, 4]) {
      for (const a of list) {
        for (const b of list) {
          const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal', power: a }), player({ bot: 'normal', power: b })];
          const fx = new Fx();
          const view = GAMES.pingpong.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: PingPong; update(dt: number, i: Input): void };
          const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
          const g = view.game;
          const born = new Map<Floater, number>();
          for (let i = 0; i < 60 * 300 && g.winner === null; i++) {
            view.update(DT, input);
            fx.update(DT);
            for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
              if (!names.has(f.str) || f.life < 0.45) continue;
              if (!born.has(f)) born.set(f, f.y);
              seats.add(f.player);
              frames++;
              const w = ([...f.str].length * f.size * 0.55) / 2;
              if (Math.abs(g.ball.x - f.x) < w + RULES.ballR && Math.abs(g.ball.y - f.y) < f.size * 0.45 + RULES.ballR) covered++;
            }
          }
          // Each copy stays in the half its line was in (the seat's own, or the other seat's copy across the net).
          for (const y of born.values()) expect(Math.abs(y - MID)).toBeGreaterThan(10);
        }
      }
    }
    console.log(`ping pong power names: ${covered}/${frames} readable frames on the ball`);
    expect([...seats].sort()).toEqual([0, 1]);
    expect(frames).toBeGreaterThan(1000);
    expect(covered / frames).toBeLessThan(0.01);
  }, 240_000);
});
