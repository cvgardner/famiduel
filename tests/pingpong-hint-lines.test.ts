import { describe, expect, it } from 'vitest';
import { PLAYERS } from '../src/core/types';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { MID } from '../src/engine/world';
import { HINT_SIZE, hintLines, lungeY, scoreSpot } from '../src/games/pingpong/index';

// F265: "Flick up hard: SMASH" sat right on that seat's dashed lunge line (lefty-pingpong.png).
describe('Ping Pong: first-match hint lines', () => {
  for (const scale of [1, BIG_TEXT]) {
    it(`clear the lunge line, the score card and the net (text scale ${scale})`, () => {
      setTextScale(scale);
      const half = (scaledSize(HINT_SIZE) * 1.2) / 2; // a line's height is about 1.2 em
      for (const p of PLAYERS) {
        const [, cy] = scoreSpot(p);
        const card: [number, number] = [cy - 34, cy + 34];
        for (const y of hintLines(p)) {
          const band: [number, number] = [y - half, y + half];
          expect(Math.abs(y - lungeY(p)), `seat ${p} line ${y} vs lunge`).toBeGreaterThan(half + 3);
          expect(band[1] < card[0] - 2 || band[0] > card[1] + 2, `seat ${p} line ${y} vs card`).toBe(true);
          // On the owner's side, between the net and the lunge line.
          expect(Math.sign(y - MID)).toBe(p === 0 ? 1 : -1);
          expect(Math.abs(y - MID)).toBeLessThan(Math.abs(lungeY(p) - MID));
        }
        const [a, b] = hintLines(p);
        expect(Math.abs(a - b)).toBeGreaterThanOrEqual(2 * half);
      }
      setTextScale(1);
    });
  }
});
