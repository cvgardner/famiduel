import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { RULES, type Critter, type SnackSnatch } from '../src/games/snacksnatch/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

// F176: the "Miss!" pop started 10 in front of the frog's resting head, so the head pulling
// back from the missed snap slid over it and the word sat on the frog's eyes.
describe('Snack Snatch: "Miss!" clears the frog\'s head', () => {
  it('for both seats, for the whole time the pop shows', () => {
    const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'easy' }), player({ bot: 'easy' })];
    const sfx = { play() {} } as unknown as Sfx;
    const fx = new Fx();
    const view = GAMES.snacksnatch.create({ seed: 3, rng: makeRng(3), players, powersOn: false, sfx, fx, end() {} }) as unknown as { game: SnackSnatch; update(dt: number, i: Input): void };
    const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined } as unknown as Input;
    const g = view.game;
    const floaters = () => (fx as unknown as { floaters: Floater[] }).floaters.filter((f) => f.str === 'Miss!');
    const clashes: string[] = [];
    const seats = new Set<number>();
    let checked = 0;
    for (let i = 0; i < 60 * 40; i++) {
      view.update(DT, input);
      fx.update(DT);
      for (const f of floaters()) {
        seats.add(f.player);
        // The frog nearest the pop, in its own seat.
        const c = g.critters[f.player].reduce((a: Critter, b: Critter) => (Math.abs(b.x - f.x) < Math.abs(a.x - f.x) ? b : a));
        const gap = Math.abs(f.y - g.headY(c)) - RULES.headR - f.size * 0.45;
        checked++;
        if (gap < 0) clashes.push(`step ${i} seat ${f.player}: pop ${gap.toFixed(1)} into the head`);
      }
    }
    expect([...seats].sort(), 'both seats missed at least once').toEqual([0, 1]);
    expect(checked).toBeGreaterThan(0);
    expect(clashes.slice(0, 5)).toEqual([]);
  });
});
