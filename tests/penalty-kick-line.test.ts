import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerIndex } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { BOX_DEPTH, KICK_DY } from '../src/games/penalty/index';
import { RULES, type Penalty } from '../src/games/penalty/logic';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

/** Where the keeper's "Kick in N" / "Here it comes!" line lands mid-aim or on the run-up. */
function kickLine(shooter: PlayerIndex, runningUp: boolean) {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.penalty.create({ seed: 1, rng: makeRng(1), players: [player(), player()], powersOn: false, sfx, fx: new Fx(), end() {} }) as unknown as {
    game: Penalty;
    t: number;
    render(g: unknown): void;
  };
  const game = view.game;
  game.current = shooter === game.first ? 0 : 1;
  game.phase = 'aim';
  game.phaseT = runningUp ? game.aimTime() - RULES.runUp + 0.01 : 0.2;
  view.t = 1;
  const { g, words } = recorder();
  view.render(g);
  const w = words.find((x) => x.str.startsWith('Kick in') || x.str === 'Here it comes!');
  return { w, game };
}

// F260: the keeper's line sat 6 units inside the penalty box's white front edge, which ran
// through the words.
describe('Penalty: the keeper\'s "Kick in" line', () => {
  for (const shooter of [0, 1] as PlayerIndex[]) {
    for (const runningUp of [false, true]) {
      it(`keeper of seat ${1 - shooter}${runningUp ? ', on the run-up' : ''}: inside the box, clear of its edge, facing the keeper`, () => {
        const { w, game } = kickLine(shooter, runningUp);
        expect(w).toBeDefined();
        const k = game.keeper;
        expect(w!.upright).toBe(k === 0);
        const half = (runningUp ? 20 : 17) / 2 + 1;
        const out = Math.abs(w!.y - RULES.goalY[k]);
        expect(out).toBeCloseTo(KICK_DY, 6);
        // The box edge (2.5 wide) stays at least 6 units off the words.
        expect(BOX_DEPTH - 1.25 - (out + half)).toBeGreaterThanOrEqual(6);
        // And the words stay past the keeper's 🧤 (26 out, size 18).
        expect(out - half - (26 + 9)).toBeGreaterThanOrEqual(4);
      });
    }
  }
});
