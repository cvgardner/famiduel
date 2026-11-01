import { describe, expect, it } from 'vitest';
import { counterTurn, unturn } from '../src/engine/portrait';

describe('portrait lock (a flat phone flipping to landscape)', () => {
  it('turns a landscape phone back to portrait', () => {
    expect(counterTurn(90, 844, 390, true)).toBe(-90);
    expect(counterTurn(270, 844, 390, true)).toBe(90);
    expect(counterTurn(-90, 844, 390, true)).toBe(90); // old window.orientation
  });
  it('leaves portrait phones, desktops and landscape-native tablets alone', () => {
    expect(counterTurn(0, 390, 844, true)).toBe(0);
    expect(counterTurn(180, 390, 844, true)).toBe(0);
    expect(counterTurn(90, 1280, 800, false)).toBe(0); // mouse
    expect(counterTurn(0, 1280, 800, true)).toBe(0); // tablet whose natural orientation is landscape
    expect(counterTurn(90, 390, 844, true)).toBe(0); // reports a turn but is laid out portrait
  });
  it('unturn undoes the CSS rotation of a point', () => {
    for (const turn of [0, 90, -90] as const) {
      const a = (turn * Math.PI) / 180;
      const [lx, ly] = [30, -70];
      // CSS rotate(a) maps the element's own (lx, ly) to the screen:
      const sx = lx * Math.cos(a) - ly * Math.sin(a);
      const sy = lx * Math.sin(a) + ly * Math.cos(a);
      const back = unturn(turn, sx, sy);
      expect(back.x).toBeCloseTo(lx);
      expect(back.y).toBeCloseTo(ly);
    }
  });
});
