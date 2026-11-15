import { describe, expect, it } from 'vitest';
import { fitLine } from '../src/games/minigolf/index';

// F300: the strip's status line takes the longest wording that fits before the score columns.
describe('minigolf strip status (fitLine)', () => {
  const w = (s: string) => s.length * 10;
  const lines = ['Your shot! Pull back, let go', 'Pull back, let go', 'Your shot!'];
  it('keeps the full line when it fits', () => expect(fitLine(lines, 400, w)).toBe(lines[0]));
  it('takes the first shorter wording that fits', () => expect(fitLine(lines, 200, w)).toBe('Pull back, let go'));
  it('falls back to the last wording when none fits', () => expect(fitLine(lines, 50, w)).toBe('Your shot!'));
});
