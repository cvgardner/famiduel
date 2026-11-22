import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import type { MiniPool } from '../src/games/minipool/logic';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

// F441: a head start's forgiven misses showed as "↺4" in the seat panel; a small kid can't
// read that. The panel says it in words when they fit ("Your shot! · 4 extra goes").
function panel(retries: [number, number]): string[] {
  const sfx = { play() {} } as unknown as Sfx;
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: null, name: 'Maya', assist: 3 }), player({ bot: 'hard', name: 'Bot' })];
  const view = GAMES.minipool.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} }) as unknown as { game: MiniPool; render(g: unknown): void };
  const g = view.game;
  g.phase = 'aim';
  g.shooter = 0;
  g.retries = retries;
  const { g: gx, words } = recorder();
  view.render(gx);
  return words.map((w) => w.str);
}

describe('Mini Pool head-start extra goes', () => {
  it('says the forgiven misses in words, singular for one', () => {
    const four = panel([4, 0]);
    expect(four.some((s) => s.includes('4 extra goes'))).toBe(true);
    expect(four.some((s) => s.includes('↺'))).toBe(false);
    expect(panel([1, 0]).some((s) => s.includes('1 extra go') && !s.includes('goes'))).toBe(true);
  });
  it('shows nothing when there are none left', () => {
    expect(panel([0, 0]).some((s) => /extra go|↺/.test(s))).toBe(false);
  });
});
