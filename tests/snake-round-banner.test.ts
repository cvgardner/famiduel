import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { roundEndLines } from '../src/games/snake/index';
import type { SnakeDuel } from '../src/games/snake/logic';
import { DT, player } from './helpers';

type Floater = { str: string; life: number; player: 0 | 1 };

// F232: the seat that crashed read "CRASH!" at the crash and "Crashed!" on its banner at once.
describe('Snake: the round-end banner does not echo the CRASH! pop', () => {
  it('the winner reads "You win the round!", the crashed seat what comes next', () => {
    expect(roundEndLines(0)).toEqual(['You win the round!', 'Ouch! Next round…']);
    expect(roundEndLines(1)).toEqual(['Ouch! Next round…', 'You win the round!']);
    expect(roundEndLines(null)).toEqual(['Crash! Draw round', 'Crash! Draw round']);
  });

  it('in bot matches, a seat with a live CRASH! pop never reads "crash" on its banner too', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal' }), player({ bot: 'normal' })];
      const fx = new Fx();
      const view = GAMES.snake.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: SnakeDuel; update(dt: number, i: Input): void };
      const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
      const g = view.game;
      for (let i = 0; i < 60 * 300 && !g.done; i++) {
        view.update(DT, input);
        fx.update(DT);
        if (g.phase !== 'over' || g.done || (g.lastRound !== 0 && g.lastRound !== 1)) continue;
        const lines = roundEndLines(g.lastRound);
        for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
          if (f.str !== 'CRASH!' || f.life <= 0) continue;
          checked++;
          expect(f.player, "the crashed seat lost the round").not.toBe(g.lastRound);
          expect(lines[f.player]).not.toMatch(/crash/i);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 120_000);
});
