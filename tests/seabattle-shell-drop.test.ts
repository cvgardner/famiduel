import { describe, expect, it } from 'vitest';
import { N } from '../src/games/seabattle/logic';
import { SHELL_DROP, SHELL_TOP, shellY } from '../src/games/seabattle/index';

// F388: the big board (src/games/seabattle/index.ts): header pill y 8..70, board from GY.
const C = 27;
const GY = 82;
const PILL_BOTTOM = 70;
// The small sea: label above SY, the big board's tally row above that.
const SY = 456;
const SC = 14;

const ks = Array.from({ length: 21 }, (_, i) => i / 20);

describe('Sea Battle shells fall inside their own sea (F388)', () => {
  it('a shell over the big board never starts over the header pill', () => {
    for (let row = 0; row < N; row++) {
      const ty = GY + row * C + C / 2;
      for (const k of ks) {
        const y = shellY(ty, k, SHELL_TOP.big);
        expect(y - 8).toBeGreaterThan(PILL_BOTTOM); // shell radius 8 on the big sea
        expect(y).toBeLessThanOrEqual(ty);
      }
      expect(shellY(ty, 1, SHELL_TOP.big)).toBe(ty);
    }
  });

  it('a shell over the small sea never starts on the big board above it', () => {
    for (let row = 0; row < N; row++) {
      const ty = SY + row * SC + SC / 2;
      for (const k of ks) expect(shellY(ty, k, SHELL_TOP.small)).toBeGreaterThanOrEqual(SY - 2);
      expect(shellY(ty, 1, SHELL_TOP.small)).toBe(ty);
    }
  });

  it('rows far enough down still drop the whole way', () => {
    const ty = GY + 7 * C + C / 2;
    expect(ty - SHELL_DROP).toBeGreaterThan(SHELL_TOP.big);
    expect(shellY(ty, 0, SHELL_TOP.big)).toBe(ty - SHELL_DROP);
  });
});
