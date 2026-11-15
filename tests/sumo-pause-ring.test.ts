import { describe, expect, it } from 'vitest';
import games from '../content/games.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { MID } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { DT, player } from './helpers';

type View = { update(dt: number, i: Input): void; game: { round: number; wrestlers: { x: number; y: number }[]; radius(p: 0 | 1): number } };

// F301: the pause dot (left edge, centre line: 44 px at 1 px from the left on a 320 px phone,
// a 17.5 px dot) sat on a wrestler teetering at the left rope at the round's deciding moment.
// Bot matches do put a wrestler under it, so Sumo gets the see-through ring (with a dark core
// behind the "II" for the pale sand), like Snake.
describe('Sumo: the ring runs under the pause button', () => {
  it('wrestlers pass under it in bot matches, so Sumo uses the see-through pause ring', () => {
    const k = 320 / 360;
    const bx = (1 + 22) / k;
    const br = 17.5 / k;
    let rounds = 0;
    let roundsUnder = 0;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: level }), player({ bot: level })];
        const fx = new Fx();
        let ended = false;
        const view = GAMES.sumo.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as View;
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        let round = view.game.round;
        let hit = false;
        for (let i = 0; i < 60 * 300 && !ended; i++) {
          view.update(DT, input);
          fx.update(DT);
          const g = view.game;
          if (g.round !== round) {
            rounds++;
            if (hit) roundsUnder++;
            round = g.round;
            hit = false;
          }
          for (const p of [0, 1] as const) {
            const w = g.wrestlers[p];
            if (Math.hypot(w.x - bx, w.y - MID) < br + g.radius(p) * 0.6) hit = true;
          }
        }
        rounds++;
        if (hit) roundsUnder++;
        expect(ended).toBe(true);
      }
    }
    console.log(`sumo pause: a wrestler under the pause button in ${roundsUnder} of ${rounds} rounds`);
    expect(roundsUnder).toBeGreaterThan(0);
    const sumo = games.games.find((g) => g.id === 'sumo') as { pauseRing?: unknown };
    expect(sumo.pauseRing).toBe('core');
  }, 120_000);
});
