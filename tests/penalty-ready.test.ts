import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerIndex } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { RULES, type Penalty } from '../src/games/penalty/logic';
import { recorder } from './canvasRecorder';
import { player, power } from './helpers';

/** Where the shooter's "<power> ready" line lands, with the shooter's power armed mid-aim. */
function readyLine(shooter: PlayerIndex, runningUp: boolean) {
  const sfx = { play() {} } as unknown as Sfx;
  const pw = power('penalty', 'curveshot');
  const view = GAMES.penalty.create({ seed: 1, rng: makeRng(1), players: [player({ power: pw }), player({ power: pw })], powersOn: true, sfx, fx: new Fx(), end() {} }) as unknown as {
    game: Penalty;
    t: number;
    render(g: unknown): void;
  };
  const game = view.game;
  game.current = shooter === game.first ? 0 : 1;
  game.phase = 'aim';
  game.phaseT = runningUp ? game.aimTime() - RULES.runUp + 0.01 : 0.2;
  game.armed[shooter] = true;
  view.t = 1;
  const { g, words } = recorder();
  view.render(g);
  const w = words.find((x) => x.str.endsWith(`${pw.name} ready`));
  return { w, game };
}

// F183: the shooter's "Curve Shot ready" sat behind them, across their own goal's net.
describe('Penalty "<power> ready" line', () => {
  for (const shooter of [0, 1] as PlayerIndex[]) {
    for (const runningUp of [false, true]) {
      it(`seat ${shooter}${runningUp ? ', on the run-up' : ''}: clear of both goals and the kick rings, facing the shooter`, () => {
        const { w, game } = readyLine(shooter, runningUp);
        expect(w).toBeDefined();
        expect(w!.upright).toBe(shooter === 0);
        const half = 14 / 2;
        // Clear of either goal's net (nets sit 30 units behind each goal line).
        for (const gy of RULES.goalY) expect(Math.abs(w!.y - gy)).toBeGreaterThan(30 + half);
        // Clear of the kick ring (r 24) and the run-up's closing ring (r up to 52).
        expect(Math.abs(w!.y - game.spotY())).toBeGreaterThan(52 + half);
        // On the goal side of the ball, the way the shooter is kicking.
        const toward = shooter === 0 ? -1 : 1;
        expect(Math.sign(w!.y - game.spotY())).toBe(toward);
      });
    }
  }
});
