import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { setTextScale } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { H, MID, W } from '../src/engine/world';
import { BANNER_OFF } from '../src/games/sumo/index';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

function render(str: string, boxed: boolean) {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.sumo.create({ seed: 1, rng: makeRng(1), players: [player({ bot: null }), player({ bot: null })], powersOn: false, sfx, fx: new Fx(), end() {} });
  (view as unknown as { showBanner(s: string, c: string, t: number, b: boolean): void }).showBanner(str, '#ffffff', 1, boxed);
  const rec = recorder();
  view.render(rec.g);
  return rec;
}

// F225: Sumo's round-end banner was bare outlined text, edge to edge over the ring and both
// wrestlers; Snake and Chop Chop put theirs on a dark box.
describe('Sumo round-end banner box', () => {
  for (const scale of [1, 1.2]) {
    it(`each seat's words sit inside a box within the world (text scale ${scale})`, () => {
      setTextScale(scale);
      try {
        const str = 'Player 1 wins the round!';
        const { words, fills } = render(str, true);
        const copies = words.filter((w) => w.str === str);
        expect(copies).toHaveLength(2);
        const boxes = copies.map((w) => fills.find((f) => f.box && f.box.x0 < w.x && w.x < f.box.x1 && f.box.y0 < w.y && w.y < f.box.y1 && f.box.x1 - f.box.x0 > 100));
        for (const [i, b] of boxes.entries()) {
          expect(b, `seat ${i}`).toBeDefined();
          const box = b!.box!;
          expect(box.x0).toBeGreaterThanOrEqual(0);
          expect(box.x1).toBeLessThanOrEqual(W);
          expect(box.y0).toBeGreaterThanOrEqual(0);
          expect(box.y1).toBeLessThanOrEqual(H);
          // The words (measured 10 units a letter here) fit inside the box.
          expect(box.x1 - box.x0).toBeGreaterThanOrEqual(str.length * 10 * 0.9);
        }
        // The two mirrored boxes never touch across the middle.
        const [a, b] = boxes.map((f) => f!.box!);
        const low = a.y0 > b.y0 ? a : b;
        const high = a.y0 > b.y0 ? b : a;
        expect(high.y1).toBeLessThan(low.y0);
        expect(high.y1).toBeLessThanOrEqual(MID);
        expect(low.y0).toBeGreaterThanOrEqual(MID);
        expect(Math.abs((low.y0 + low.y1) / 2 - MID)).toBeCloseTo(BANNER_OFF, 0);
      } finally {
        setTextScale(1);
      }
    });
  }
  it('Round and GO! banners stay bare (no box)', () => {
    const { words, fills } = render('Round 2', false);
    const w = words.find((x) => x.str === 'Round 2')!;
    expect(fills.some((f) => f.box && f.box.x0 < w.x && w.x < f.box.x1 && f.box.y0 < w.y && w.y < f.box.y1 && f.box.x1 - f.box.x0 > 100)).toBe(false);
  });
});
