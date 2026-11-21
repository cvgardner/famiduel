import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { ASSIST_POP_GAP } from '../src/games/snake';
import type { SnakeDuel } from '../src/games/snake/logic';
import { DT, player } from './helpers';

// F352: at three stars the auto-turn also dodges trails, so an easy+3 snake auto-turned
// 1.45 times a round (up to 5) and 27% of turns came within 3 s of the last: stacked
// "assist!" words on the head. Each auto-turn still sounds; the word shows once per gap.
describe('Snake: "assist!" pops do not stack', () => {
  it('easy+3 v normal bot matches: a seat pops at most once per gap, and still pops', () => {
    let pops = 0;
    let autos = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'easy', assist: 3 }), player({ bot: 'normal' })];
      const fx = new Fx();
      const times: number[] = [];
      let t = 0;
      const pop = fx.pop.bind(fx);
      fx.pop = ((str: string, ...rest: unknown[]) => {
        if (str === 'assist!') times.push(t);
        return (pop as (...a: unknown[]) => unknown)(str, ...rest);
      }) as typeof fx.pop;
      const view = GAMES.snake.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: SnakeDuel; update(dt: number, i: Input): void };
      const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
      const g = view.game;
      for (let i = 0; i < 60 * 300 && !g.done; i++) {
        t += DT;
        view.update(DT, input);
        for (const e of g.events) if (e.type === 'turn' && e.auto) autos++;
        fx.update(DT);
      }
      for (let k = 1; k < times.length; k++) expect(times[k] - times[k - 1]).toBeGreaterThanOrEqual(ASSIST_POP_GAP - 1e-6);
      pops += times.length;
    }
    expect(pops).toBeGreaterThan(5);
    expect(autos).toBeGreaterThan(pops);
  }, 120_000);
});
