// F375: Tug of War's round stars must read on the grass, empty or won, so a kid can count
// rounds. Empty stars used to be a dark blot like the grass tufts beside them.
import { describe, expect, it } from 'vitest';
import { contrastRatio, over, parseColor } from '../src/core/contrast';
import { STAR, SURFACES } from '../src/games/tugofwar/index';

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
