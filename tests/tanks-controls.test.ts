import { describe, expect, it } from 'vitest';
import { CONTROLS_Y, controlsFor, FIRE_R, STICK_R } from '../src/games/tanks/controls';
import { W } from '../src/engine/world';

describe('tank controls: left-handed players get the mirror', () => {
  const right = controlsFor(false);
  const left = controlsFor(true);

  it('right-handed: stick on the left, FIRE on the right', () => {
    expect(right.stickX).toBeLessThan(W / 2);
    expect(right.fireX).toBeGreaterThan(W / 2);
  });

  it('left-handed: FIRE on the left, stick on the right, exactly mirrored', () => {
    expect(left.stickX).toBe(W - right.stickX);
    expect(left.fireX).toBe(W - right.fireX);
    expect(left.fireX).toBeLessThan(W / 2);
  });

  it('strip zones mirror too and never overlap', () => {
    for (let x = 0; x <= W; x += 2) {
      expect(left.fireSide(x)).toBe(right.fireSide(W - x));
      expect(left.stickSide(x)).toBe(right.stickSide(W - x));
      for (const c of [left, right]) expect(c.fireSide(x) && c.stickSide(x)).toBe(false);
    }
    // Each button sits inside its own zone.
    for (const c of [left, right]) {
      expect(c.fireSide(c.fireX)).toBe(true);
      expect(c.stickSide(c.stickX)).toBe(true);
    }
  });

  it('both controls stay on screen and apart', () => {
    for (const c of [left, right]) {
      expect(Math.min(c.stickX - STICK_R, c.fireX - FIRE_R)).toBeGreaterThan(0);
      expect(Math.max(c.stickX + STICK_R, c.fireX + FIRE_R)).toBeLessThan(W);
      expect(Math.abs(c.stickX - c.fireX)).toBeGreaterThan(STICK_R + FIRE_R + 44);
    }
    expect(CONTROLS_Y).toBeGreaterThan(540);
  });
});
