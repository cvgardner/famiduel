import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { RULES, type Penalty } from '../src/games/penalty/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F206: "Your kick!" started at MID ± 70, right on the ball at the spot (3,872/6,292 readable
// frames), and a saved ball bounced back up the middle through "SAVED!" (1,420/5,096). The kick
// line now starts just past the ball toward the goal, and centre pops take the nearest line the
// rolling ball misses: 0. No pop sits on the keeper either.
describe('Penalty: pops stay off the ball and the keeper', () => {
  it('in bot matches at every level with powers, both seats', () => {
    const total: Record<string, number> = {};
    const onBall: Record<string, number> = {};
    let onKeeper = 0;
    const seats = new Set<number>();
    const list = (powers.games as Record<string, PowerDef[]>).penalty;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: list[seed % list.length] }), player({ bot: level, power: list[(seed + 1) % list.length] })];
        const fx = new Fx();
        const view = GAMES.penalty.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: Penalty; update(dt: number, i: Input): void };
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        const g = view.game;
        for (let i = 0; i < 60 * 300 && !g.over; i++) {
          view.update(DT, input);
          fx.update(DT);
          for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
            if (f.life < 0.45) continue;
            seats.add(f.player);
            total[f.str] = (total[f.str] ?? 0) + 1;
            const w = ([...f.str].length * f.size * 0.55) / 2;
            const h = f.size * 0.45;
            const box = g.keeperBox();
            const gy = RULES.goalY[g.keeper] + (g.keeper === 1 ? 8 : -8);
            if (Math.abs(box.x - f.x) < w + box.half + 7 && Math.abs(gy - f.y) < h + 12) onKeeper++;
            if (Math.abs(g.ball.x - f.x) < w + 9 && Math.abs(g.ball.y - f.y) < h + 9) onBall[f.str] = (onBall[f.str] ?? 0) + 1;
          }
        }
      }
    }
    for (const k of Object.keys(total)) console.log(`penalty ${k}: ${onBall[k] ?? 0}/${total[k]} readable frames on the ball`);
    expect([...seats].sort()).toEqual([0, 1]);
    expect(onKeeper).toBe(0);
    for (const k of ['Your kick!', 'Sudden death! Your kick', 'SAVED!', 'GOAL!']) {
      expect(total[k], k).toBeGreaterThan(300);
      expect((onBall[k] ?? 0) / total[k], k).toBeLessThan(0.02);
    }
  }, 120_000); // whole bot matches: GitHub CI runs ~3x slower than a laptop
});
