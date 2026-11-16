import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import type { Sumo } from '../src/games/sumo/logic';
import { DT, player } from './helpers';

type Floater = { str: string; life: number; player: 0 | 1 };
type View = { game: Sumo; update(dt: number, i: Input): void };
const ROPE = /rope save!|by the rope!/;
const idle = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false } as unknown as Input;

function setup(seed = 1): { view: View; fx: Fx; g: Sumo } {
  const players: [PlayerInfo, PlayerInfo] = [player(), player()];
  const fx = new Fx();
  const view = GAMES.sumo.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as View;
  const g = view.game;
  for (let i = 0; i < 60 * 5 && g.phase !== 'fight'; i++) {
    view.update(DT, idle);
    fx.update(DT);
  }
  expect(g.phase).toBe('fight');
  return { view, fx, g };
}

/** Run seat p's wrestler into the rope on its own (nobody touching it), as a quick re-dash does. */
function runAtRope(g: Sumo, p: 0 | 1, angle: number): void {
  const w = g.wrestlers[p];
  const r = g.outR(p) + 2;
  w.x = 180 + Math.cos(angle) * r;
  w.y = 320 + Math.sin(angle) * r;
  w.vx = Math.cos(angle) * 300;
  w.vy = Math.sin(angle) * 300;
  w.freeT = 99;
  // The other wrestler waits on the far side, out of reach.
  const o = g.wrestlers[p === 0 ? 1 : 0];
  o.x = 180 - Math.cos(angle) * 60;
  o.y = 320 - Math.sin(angle) * 60;
  o.vx = o.vy = 0;
}

function readable(fx: Fx, p: 0 | 1): Floater[] {
  return (fx as unknown as { floaters: Floater[] }).floaters.filter((f) => f.player === p && ROPE.test(f.str) && f.life >= 0.45);
}

// F329: tapping HOLD fast dashes a wrestler back at the rope just after it bounced them in,
// so saves can come 0.3-0.5 s apart (a two-person playtest at 320x568 logged 0.45 s and
// 0.33 s). The second "Saved by the rope!" stacked a line beside the first, still bright,
// which read like a stutter. The newest save's words replace the old ones.
describe('Sumo: one rope-save pop per seat at a time', () => {
  for (const p of [0, 1] as const) {
    it(`seat ${p}: saved again 0.4 s later shows one pop, and the last save says so`, () => {
      const { view, fx, g } = setup(3 + p);
      const angle = p === 0 ? Math.PI * 0.6 : -Math.PI * 0.4;
      const saves0 = g.wrestlers[p].saves;
      expect(saves0).toBe(3);
      const words: string[] = [];
      for (let n = 0; n < saves0; n++) {
        runAtRope(g, p, angle + n * 0.3);
        let seen = false;
        for (let i = 0; i < 24; i++) {
          view.update(DT, idle);
          if (g.events.some((e) => e.type === 'teeter' && e.p === p)) seen = true;
          fx.update(DT);
          expect(readable(fx, p).length, `save ${n + 1}, frame ${i}`).toBeLessThanOrEqual(1);
        }
        expect(seen, `the rope caught save ${n + 1}`).toBe(true);
        const now = readable(fx, p);
        expect(now.length).toBe(1);
        words.push(now[0].str);
      }
      expect(words).toEqual(['Saved by the rope!', 'Saved by the rope!', 'Last rope save!']);
      // The other seat's pops are left alone.
      expect(readable(fx, p === 0 ? 1 : 0).length).toBe(0);
    });
  }
});
