import { afterEach, describe, expect, it } from 'vitest';
import { setTextScale } from '../src/engine/draw';
import { W } from '../src/engine/world';
import { CARD_HALF_W, pointLines, pointSpot, scoreSpot } from '../src/games/pingpong/index';

// F303: centred at size 34, the scorer's "Your point!" rose past its score card ~2 units from
// it (and a long bot name in the other seat's words ran under that seat's card).
describe('ping pong point words keep clear of the score cards', () => {
  afterEach(() => setTextScale(1));
  const casts = [
    [{ name: 'Player 1' }, { name: 'Player 2' }],
    [{ name: 'Player 1' }, { name: 'Bot', bot: 'normal' }],
    [{ name: 'Grandma' }, { name: 'Super Robot', bot: 'hard' }],
  ];
  for (const scale of [1, 1.2]) {
    it(`every seat's words sit beside its card (text scale ${scale})`, () => {
      setTextScale(scale);
      for (const players of casts) {
        for (const scorer of [0, 1] as const) {
          const lines = pointLines(scorer, players);
          for (const p of [0, 1] as const) {
            const size = p === scorer ? 34 : 28;
            const at = pointSpot(p, lines[p], size);
            const half = ([...lines[p]].length * Math.max(at.size, Math.min(at.size * scale, 28)) * 0.55) / 2;
            const [cx] = scoreSpot(p);
            const x0 = at.x - half;
            const x1 = at.x + half;
            expect(x0, `"${lines[p]}" inside the left edge`).toBeGreaterThanOrEqual(6);
            expect(x1, `"${lines[p]}" inside the right edge`).toBeLessThanOrEqual(W - 6);
            if (p === 0) expect(x1, `"${lines[p]}" left of seat 0's card`).toBeLessThanOrEqual(cx - CARD_HALF_W - 6);
            else expect(x0, `"${lines[p]}" right of seat 1's card`).toBeGreaterThanOrEqual(cx + CARD_HALF_W + 6);
          }
        }
      }
    });
  }
  it('"Your point!" keeps its big size and stays near the middle', () => {
    for (const p of [0, 1] as const) {
      const at = pointSpot(p, 'Your point!', 34);
      expect(at.size).toBe(34);
      expect(Math.abs(at.x - W / 2)).toBeLessThan(30);
    }
  });
});
