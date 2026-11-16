import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { MID } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import type { Sumo } from '../src/games/sumo/logic';
import { recorder } from './canvasRecorder';
import { DT, player } from './helpers';

type View = { game: Sumo; update(dt: number, i: Input): void; render(g: unknown): void };
const idle = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false } as unknown as Input;

// F333: in ~31-37% of ring-outs (40 bot mirrors per level) the loser leaves the ring beside
// the centre line, where both round-end banners' dark boxes sit (MID ± ~49). The boxes were
// drawn last, so the spin-out, the round's big moment, played behind them. The wrestler who
// went out is now drawn over the boxes (words still last); the winner stays under them, so
// the words, in the winner's colour, never sit on the winner's body.
describe('Sumo: a ring-out beside the centre line shows over the round-end banner', () => {
  for (const side of [1, -1]) {
    it(`out on the ${side > 0 ? 'right' : 'left'}`, () => {
      const players: [PlayerInfo, PlayerInfo] = [player(), player()];
      const fx = new Fx();
      const view = GAMES.sumo.create({ seed: 2, rng: makeRng(2), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as View;
      const g = view.game;
      for (let i = 0; i < 60 * 5 && g.phase !== 'fight'; i++) view.update(DT, idle);
      expect(g.phase).toBe('fight');
      // Seat 1 slides out sideways just past the centre line; seat 0 waits at the middle.
      const w = g.wrestlers[1];
      w.x = 180 + side * (g.outR(1) - 1);
      w.y = MID + 10;
      w.vx = side * 200;
      w.vy = 0;
      w.freeT = 99;
      w.saves = 0; // no rope save left to bounce it back in
      const o = g.wrestlers[0];
      o.x = 180;
      o.y = MID + 30; // the winner stands in the bottom box's band
      o.vx = o.vy = 0;
      for (let i = 0; i < 20 && g.phase === 'fight'; i++) view.update(DT, idle);
      expect(g.phase).toBe('over');
      expect(w.out).toBe(true);
      view.update(DT, idle);
      const rec = recorder();
      view.render(rec.g);
      // Banner boxes: wide rounded boxes hugging the centre line.
      const boxes = rec.fills.map((f, i) => ({ f, i })).filter(({ f }) => f.box && f.box.x1 - f.box.x0 > 150 && Math.abs((f.box.y0 + f.box.y1) / 2 - MID) < 40);
      expect(boxes.length, 'two banner boxes').toBe(2);
      // The out wrestler's body: an arc filled at its spot.
      const body = rec.fills.map((f, i) => ({ f, i })).filter(({ f }) => !f.box && Math.hypot(f.x - w.x, f.y - w.y) < 3);
      expect(body.length, 'the out wrestler is drawn').toBeGreaterThan(0);
      for (const b of boxes) expect(Math.max(...body.map((x) => x.i)), 'body drawn after the box').toBeGreaterThan(b.i);
      const winner = rec.fills.map((f, i) => ({ f, i })).filter(({ f }) => !f.box && Math.hypot(f.x - o.x, f.y - o.y) < 3);
      expect(winner.length, 'the winner is drawn').toBeGreaterThan(0);
      for (const b of boxes) expect(Math.max(...winner.map((x) => x.i)), 'winner drawn under the box').toBeLessThan(b.i);
      // The words still come after everything else.
      expect(rec.words.some((x) => /wins the round!/.test(x.str))).toBe(true);
    });
  }
});
