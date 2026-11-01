import { describe, expect, it } from 'vitest';
import { contrastNeeded, contrastRatio, inkOn, labelContrast, parseColor } from '../src/core/contrast';
import { PLAYER_COLORS } from '../src/core/colors';

const rgb = (hex: string) => parseColor(hex)!.slice(0, 3) as [number, number, number];

describe('text contrast', () => {
  it('parses the colour forms the games use', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('#3fa9ff')).toEqual([63, 169, 255, 1]);
    expect(parseColor('rgba(80,50,20,0.55)')).toEqual([80, 50, 20, 0.55]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('gold')).toBeNull();
  });

  it('matches the WCAG reference ratios', () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], rgb('#777777'))).toBeCloseTo(4.48, 2);
    expect(contrastRatio([0, 0, 0], [0, 0, 0])).toBe(1);
  });

  it('large bold text needs 3:1, small text 4.5:1', () => {
    expect(contrastNeeded(13, 800)).toBe(4.5);
    expect(contrastNeeded(18, 800)).toBe(4.5);
    expect(contrastNeeded(20, 800)).toBe(3);
    expect(contrastNeeded(20, 400)).toBe(4.5);
    expect(contrastNeeded(24, 400)).toBe(3);
  });

  it('a faded label counts its alpha, an outline counts as what it is read against', () => {
    const white = parseColor('#ffffff')!;
    const grass = rgb('#7cc96a');
    expect(labelContrast(white, grass)).toBeLessThan(3);
    expect(labelContrast(white, grass, 0.45)).toBeLessThan(labelContrast(white, grass));
    expect(labelContrast(white, grass, 1, parseColor('rgba(0,0,0,0.75)'))).toBeGreaterThan(4.5);
  });

  it('words on every player colour get an ink that reads at 4.5:1 (Purple: 4.4:1, its best)', () => {
    // Purple is mid-bright: white gives 4.37:1 and the dark ink less, so pill labels
    // are drawn large (19 px bold, needs 3:1) and only small badge text sits at 4.4.
    for (const c of PLAYER_COLORS) {
      const ink = inkOn(c.hex);
      expect(contrastRatio(rgb(ink), rgb(c.hex)), `${c.name} with ${ink}`).toBeGreaterThanOrEqual(c.name === 'Purple' ? 4.35 : 4.5);
    }
    // White on the light colours was the old default and fails.
    expect(contrastRatio([255, 255, 255], rgb('#15e5b4'))).toBeLessThan(3);
  });
});
