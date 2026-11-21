// F375: Tug of War's round stars must read on the grass, empty or won, so a kid can count
// rounds. Empty stars used to be a dark blot like the grass tufts beside them.
import { describe, expect, it } from 'vitest';
import { contrastRatio, over, parseColor } from '../src/core/contrast';
import { CARD_Y, cardBox, L, STAR, SURFACES } from '../src/games/tugofwar/index';
import { RULES } from '../src/games/tugofwar/logic';
import { W } from '../src/engine/world';

const rgb = (css: string): [number, number, number] => {
  const c = parseColor(css)!;
  return [c[0], c[1], c[2]];
};
const grasses = SURFACES.slice(0, 2).map(rgb);

describe('Tug of War round stars', () => {
  it('every star has an outline that reads 3:1 on both grasses', () => {
    for (const g of grasses) expect(contrastRatio(rgb(STAR.outline), g)).toBeGreaterThanOrEqual(3);
    expect(STAR.line).toBeGreaterThanOrEqual(2);
  });
  it('a won star reads 3:1 against an empty one', () => {
    for (const g of grasses) {
      const e = parseColor(STAR.empty)!;
      const empty = over(e, g);
      expect(contrastRatio(rgb(STAR.won), empty)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Tug of War round card (F376)', () => {
  it("the loser's card, level with that seat's stars, stays clear of them and centred", () => {
    const box = cardBox(true);
    const top = CARD_Y.lost - 30;
    const bottom = CARD_Y.lost + 34;
    const r = 11 + STAR.line;
    const starTop = L.starY - r;
    const starBottom = L.starY + (RULES.winRounds - 1) * 26 + r;
    // The card and the star column share rows, so the card must end left of the stars.
    expect(top < starBottom && bottom > starTop).toBe(true);
    expect(box.x + box.w).toBeLessThanOrEqual(L.starX - r - 4);
    expect(box.x + box.w / 2).toBeCloseTo(W / 2);
    // Room for "Into the mud!" (size 22) and "They win the round" (size 14).
    expect(box.w).toBeGreaterThanOrEqual(180);
  });
});
