import { describe, expect, it } from 'vitest';
import { loserTitle } from '../src/app/resulttitle';

describe('result screen: the losing half (F223)', () => {
  it('says "So close!" only for a close match', () => {
    expect(loserTitle(0, 1)).toBe('So close!'); // a point apart
    expect(loserTitle(2, 3)).toBe('So close!'); // best of 5
    expect(loserTitle(11, 10)).toBe('So close!'); // Minigolf: one stroke more
    expect(loserTitle(12, 15)).toBe('So close!'); // Snack Snatch: within a fifth
    expect(loserTitle(0, 0)).toBe('So close!');
  });
  it('says "Good game!" after a clear loss', () => {
    expect(loserTitle(10, 3)).toBe('Good game!'); // Minigolf: 7 strokes more
    expect(loserTitle(0, 5)).toBe('Good game!'); // Air Hockey shut-out
    expect(loserTitle(0, 3)).toBe('Good game!'); // best of 5, swept
    expect(loserTitle(5, 15)).toBe('Good game!');
  });
});
