import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerIndex, PlayerInfo } from '../src/core/types';
import { MID, W } from '../src/engine/world';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { HOLES, Minigolf } from '../src/games/minigolf/logic';
import { moverSegs } from '../src/games/minigolf/physics';
import { player } from './helpers';

type View = { game: Minigolf; rot: number; clearPopY(str: string, size: number, x: number, y: number, p: PlayerIndex): number };

const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal' }), player({ bot: 'normal' })];

function viewOn(holeId: string, rot: number): View {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.minigolf.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} }) as unknown as View;
  view.game = new Minigolf(players, false, makeRng(1), [holeId]);
  view.rot = rot;
  return view;
}

/** Every inner-wall and mover point (sampled every 2 px) as the seat sees the course. */
function wallPoints(game: Minigolf, rot: number): { x: number; y: number }[] {
  const flip = Math.abs(rot - Math.PI) < 1e-6;
  const pts: { x: number; y: number }[] = [];
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const y = ay + ((by - ay) * k) / n;
      pts.push(flip ? { x: W - x, y: 2 * MID - y } : { x, y });
    }
  };
  for (const w of game.hole.walls) {
    if (w.kind === 'border') continue;
    const n = w.closed ? w.pts.length : w.pts.length - 1;
    for (let i = 0; i < n; i++) add(w.pts[i][0], w.pts[i][1], w.pts[(i + 1) % w.pts.length][0], w.pts[(i + 1) % w.pts.length][1]);
  }
  for (const s of moverSegs(game.hole, game.t)) add(s.ax, s.ay, s.bx, s.by);
  return pts;
}

/** The pops whose rise (36 px toward the far side) crosses a wall, over every hole, both facings. */
function blocked(pick: (v: View, str: string, size: number, y: number, p: PlayerIndex) => number): string[] {
  const out: string[] = [];
  const pops: [string, number, number][] = [
    ['Birdie!', 28, 40],
    ['Splash! +1 stroke', 24, 40],
    ['HOLE IN ONE!', 34, 40],
    ['🧲 Magnet Cup!', 26, 70],
  ];
  for (const hole of HOLES) {
    for (const rot of [0, Math.PI]) {
      const v = viewOn(hole.id, rot);
      const pts = wallPoints(v.game, rot);
      for (const [str, size, off] of pops) {
        for (const p of [0, 1] as PlayerIndex[]) {
          const y = pick(v, str, size, p === 0 ? MID + off : MID - off, p);
          const half = ([...str].length * size * 0.55) / 2;
          const top = Math.min(y, y + (p === 0 ? -36 : 36)) - size * 0.45;
          const bot = Math.max(y, y + (p === 0 ? -36 : 36)) + size * 0.45;
          if (pts.some((q) => q.x > W / 2 - half && q.x < W / 2 + half && q.y > top && q.y < bot)) out.push(`${hole.id} rot ${rot.toFixed(1)} seat ${p} "${str}"`);
        }
      }
    }
  }
  return out;
}

// F193: the centre pops ("Birdie!", "Splash! +1 stroke", a power's name) printed at a fixed
// line either side of the middle, so on Warm-Up Lane, Bank Shot and others they rose across
// the hole's walls.
describe('Minigolf: centre pops rise on open green', () => {
  it('starts each seat\'s pop clear of inner walls and movers on every hole', () => {
    const before = blocked((_v, _s, _z, y) => y);
    expect(before.length, 'the fixed lines did cross walls').toBeGreaterThan(10);
    expect(before.some((b) => b.startsWith('warmup'))).toBe(true);
    const after = blocked((v, str, size, y, p) => v.clearPopY(str, size, W / 2, y, p));
    expect(after).toEqual([]);
  });

  it('only ever steps a pop toward its own seat\'s edge', () => {
    for (const hole of HOLES) {
      const v = viewOn(hole.id, 0);
      expect(v.clearPopY('Birdie!', 28, W / 2, MID + 40, 0)).toBeGreaterThanOrEqual(MID + 40);
      expect(v.clearPopY('Birdie!', 28, W / 2, MID - 40, 1)).toBeLessThanOrEqual(MID - 40);
    }
  });
});
