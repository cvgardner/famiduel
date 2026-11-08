import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerIndex } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { W } from '../src/engine/world';
import { EARLY_POP } from '../src/games/penalty/index';
import type { Intent, Penalty } from '../src/games/penalty/logic';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { DT, player, power } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };
const SHOOTER_LINES = ['Shot picked! Swipe again to change', 'Swipe to pick your shot!'];
const box = (str: string, x: number, y: number, size: number) => {
  const w = ([...str].length * size * 0.55) / 2;
  return { l: x - w, r: x + w, t: y - size * 0.45, b: y + size * 0.45 };
};
const hits = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

// F190: the keeper's early dive popped "Keeper moved early!" at the middle, and it rose into the
// shooter's "Shot picked! Swipe again to change" and "<power> ready" lines.
describe('Penalty: the early-dive pop keeps clear of the shooter lines', () => {
  for (const seat of [0, 1] as PlayerIndex[]) {
    it(`shooter seat ${seat}: beside the ball, off the ball's ring and every line, as it rises`, () => {
      const fx = new Fx();
      const pw = power('penalty', 'curveshot');
      const view = GAMES.penalty.create({ seed: 3, rng: makeRng(3), players: [player({ power: pw, bot: null }), player({ power: pw, bot: null })], powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as {
        game: Penalty;
        update(dt: number, i: Input): void;
        render(g: unknown): void;
      };
      const g = view.game;
      const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
      let dive = false;
      const step = g.step.bind(g);
      g.step = (dt: number, intents: [Intent, Intent]) => {
        if (dive) {
          intents[g.keeper] = { ...intents[g.keeper], dive: 1 };
          dive = false;
        }
        step(dt, intents);
      };
      let i = 0;
      while (!(g.shooter === seat && g.phase === 'aim' && g.phaseT > 0.4)) {
        view.update(DT, input);
        fx.update(DT);
        expect(++i).toBeLessThan(60 * 60);
      }
      (g as unknown as { picked: unknown }).picked = { x: 0, y: 0 };
      g.armed[seat] = true;
      dive = true;
      let seen = 0;
      for (let f = 0; f < 60; f++) {
        view.update(DT, input);
        fx.update(DT);
        if (g.phase !== 'aim') break;
        const pop = (fx as unknown as { floaters: Floater[] }).floaters.find((x) => x.str === EARLY_POP);
        if (!pop) continue;
        seen++;
        expect(pop.player).toBe(seat);
        // On the shooter's left, the side away from their big seconds digit.
        expect(Math.sign(pop.x - W / 2)).toBe(seat === 0 ? -1 : 1);
        const pb = box(pop.str, pop.x, pop.y, pop.size);
        // Off the ball and its 24 px clock ring.
        const sy = g.spotY();
        const nx = Math.max(pb.l, Math.min(pb.r, W / 2));
        const ny = Math.max(pb.t, Math.min(pb.b, sy));
        expect(Math.hypot(nx - W / 2, ny - sy), 'pop on the ball ring').toBeGreaterThan(27);
        const { g: ctx, words } = recorder();
        view.render(ctx);
        const lines = words.filter((w) => SHOOTER_LINES.includes(w.str) || w.str.endsWith(' ready'));
        expect(lines.length).toBeGreaterThan(0);
        for (const w of lines) expect(hits(pb, box(w.str, w.x, w.y, 16)), `${pop.str} on ${w.str}`).toBe(false);
      }
      expect(seen).toBeGreaterThan(20);
    });
  }
});
