import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor } from '../src/core/contrast';
import { THEME_COLOR, resolveTheme } from '../src/app/theme';

const rgb = (hex: string) => parseColor(hex)!.slice(0, 3) as [number, number, number];

describe('menu theme', () => {
  it('auto (and older saves with no choice) follows the phone', () => {
    expect(resolveTheme(undefined, true)).toBe('dark');
    expect(resolveTheme(undefined, false)).toBe('light');
    expect(resolveTheme('auto', false)).toBe('light');
  });
  it('a picked look wins over the phone', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('body text and dim text read on each theme background', () => {
    // Light: --text #1d1840 and --dim #5b5582 on --bg / --surface (white).
    for (const bg of [THEME_COLOR.light, '#ffffff', '#ece8fb']) {
      expect(contrastRatio(rgb('#1d1840'), rgb(bg))).toBeGreaterThan(7);
      expect(contrastRatio(rgb('#5b5582'), rgb(bg))).toBeGreaterThan(4.5);
    }
    expect(contrastRatio([255, 255, 255], rgb(THEME_COLOR.dark))).toBeGreaterThan(7);
  });
});
