import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { W } from '../src/engine/world';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { clearLine, room, turned, type Box } from '../src/games/minigolf/bannerline';
import { PHYS } from '../src/games/minigolf/physics';
import { recorder } from './canvasRecorder';
import { DT, player } from './helpers';

type Ball = { x: number; y: number; done: boolean };
type View = {
  update(dt: number, input: Input): void;
  render(g: unknown): void;
  game: { phase: string; balls: Ball[]; hole: { cup: [number, number] } };
  /** The course turns to face the shooter: where a course point shows on screen. */
  toScreen(x: number, y: number): { x: number; y: number };
  rotT: number;
};

/**
 * Plays bot-vs-bot minigolf and counts the frames where a turn card ("YOUR SHOT!" for the
 * shooter, "<name>'s shot" for the other half) is drawn over a ball still in play or the cup,
 * once the course has turned to the shooter.
 */
function play(seed: number): { cards: number; covered: string[] } {
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal' }), player({ bot: 'normal' })];
  const sfx = { play() {} } as unknown as Sfx;
  const fx = new Fx();
  const view = GAMES.minigolf.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx, fx, end() {} }) as unknown as View;
  const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined } as unknown as Input;
  let cards = 0;
  const covered: string[] = [];
  for (let i = 0; i < 60 * 300 && view.game.phase !== 'over'; i++) {
    view.update(DT, input);
    fx.update(DT);
    const { g, words } = recorder();
    view.render(g);
    const gm = view.game;
    // While the course turns to the next shooter (0.6 s) everything sweeps under the card.
    if (view.rotT < 1) continue;
    const r = PHYS.ballR;
    const at = (x: number, y: number, rr: number): Box => {
      const p = view.toScreen(x, y);
      return { x0: p.x - rr, x1: p.x + rr, y0: p.y - rr, y1: p.y + rr };
    };
    const things: [string, Box][] = gm.balls.filter((b) => !b.done).map((b, k) => [`ball ${k}`, at(b.x, b.y, r)]);
    things.push(['cup', at(gm.hole.cup[0], gm.hole.cup[1], PHYS.cupR)]);
    for (const w of words) {
      const half = w.str === 'YOUR SHOT!' ? 26 : w.str.endsWith("'s shot") ? 15 : 0;
      if (!half) continue;
      cards++;
      const x0 = w.str === 'YOUR SHOT!' ? 30 : 60;
      for (const [name, b] of things) if (room(w.y, half, x0, W - x0, [b]) < 0) covered.push(`frame ${i}: ${w.str} over ${name}`);
    }
  }
  return { cards, covered };
}

describe('Minigolf: turn cards keep the balls and the cup in sight (F259)', () => {
  it('clearLine keeps the first line when it is clear and moves off a box otherwise', () => {
    const ball: Box = { x0: 170, x1: 190, y0: 380, y1: 400 };
    expect(clearLine([300, 450], 26, 30, 330, [ball])).toBe(300);
    expect(clearLine([390, 450], 26, 30, 330, [ball])).toBe(450);
    // Nothing clear: the line with the most room.
    expect(clearLine([390, 400], 26, 30, 330, [ball, { x0: 0, x1: 360, y0: 420, y1: 480 }])).toBe(400);
    // A box beside the card doesn't count.
    expect(clearLine([390], 26, 60, 300, [{ x0: 310, x1: 330, y0: 380, y1: 400 }])).toBe(390);
    expect(turned(ball, 360, 640)).toEqual({ x0: 170, x1: 190, y0: 240, y1: 260 });
  });

  it('never draws a turn card over a ball in play or the cup in bot matches', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = play(seed);
      expect(r.cards, `seed ${seed}: the cards still show`).toBeGreaterThan(0);
      expect(r.covered.slice(0, 5), `seed ${seed}`).toEqual([]);
    }
  }, 120_000);
});
