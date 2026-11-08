import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerIndex } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { RULES, type Penalty } from '../src/games/penalty/logic';
import { recorder } from './canvasRecorder';
import { player, power } from './helpers';

const LINES = ['Swipe to pick your shot!', 'Shot picked! Swipe again to change', 'Quick, swipe!', 'Shot locked!'];

/** Every word drawn mid-aim for a shooter seat, with the shot picked or not and the power armed. */
function frame(shooter: PlayerIndex, picked: boolean, runningUp: boolean) {
  const sfx = { play() {} } as unknown as Sfx;
  const pw = power('penalty', 'curveshot');
  const view = GAMES.penalty.create({ seed: 1, rng: makeRng(1), players: [player({ power: pw, bot: null }), player({ power: pw, bot: null })], powersOn: true, sfx, fx: new Fx(), end() {} }) as unknown as {
    game: Penalty;
    t: number;
    pickedT: number;
    render(g: unknown): void;
  };
  const game = view.game;
  game.current = shooter === game.first ? 0 : 1;
  game.phase = 'aim';
  game.phaseT = runningUp ? game.aimTime() - RULES.runUp + 0.01 : 0.2;
  game.armed[shooter] = true;
  if (picked) (game as unknown as { picked: unknown }).picked = { x: 0, y: 0 } as unknown;
  view.t = 1;
  view.pickedT = 1;
  const { g, words } = recorder();
  view.render(g);
  return { words, game };
}

// F186: the shooter's "Shot picked! Swipe again to change" printed across their own goal's net.
describe('Penalty shot-pick line', () => {
  for (const shooter of [0, 1] as PlayerIndex[]) {
    for (const picked of [false, true]) {
      for (const runningUp of [false, true]) {
        it(`seat ${shooter}, ${picked ? 'picked' : 'not picked'}${runningUp ? ', on the run-up' : ''}: toward the goal, clear of nets, rings and the other lines`, () => {
          const { words, game } = frame(shooter, picked, runningUp);
          const w = words.find((x) => LINES.includes(x.str));
          expect(w).toBeDefined();
          expect(w!.upright).toBe(shooter === 0);
          const half = 20 / 2;
          for (const gy of RULES.goalY) expect(Math.abs(w!.y - gy)).toBeGreaterThan(30 + half);
          expect(Math.abs(w!.y - game.spotY())).toBeGreaterThan(52 + half);
          expect(Math.sign(w!.y - game.spotY())).toBe(shooter === 0 ? -1 : 1);
          // Clear of every other centred line (ready, keeper's "Kick in", "coming!").
          for (const o of words) {
            if (o === w || Math.abs(o.x - w!.x) > 60) continue;
            expect(Math.abs(o.y - w!.y), `${w!.str} vs ${o.str}`).toBeGreaterThan(half + 7);
          }
        });
      }
    }
  }
});
