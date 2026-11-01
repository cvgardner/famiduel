import { describe, expect, it } from 'vitest';
import { CONTROLS_Y, controlsFor, FIRE_R, FIRE_RIM, fireLook, STICK_R } from '../src/games/tanks/controls';
import { PLAYER_COLORS } from '../src/core/colors';
import { contrastRatio, over, parseColor } from '../src/core/contrast';
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

describe('tank FIRE buttons: whose button is whose', () => {
  it('each seat wears its own colour around the red button', () => {
    const a = fireLook(PLAYER_COLORS[0].hex, true);
    const b = fireLook(PLAYER_COLORS[1].hex, true);
    expect(a.rim).toBe(PLAYER_COLORS[0].hex);
    expect(b.rim).toBe(PLAYER_COLORS[1].hex);
    expect(a.fill).toBe(b.fill); // red still means fire for both
    expect(a.rimR).toBeGreaterThanOrEqual(FIRE_R + 4); // a band you can see, not a hairline
  });

  it('a dark gap separates the rim from the button for every player colour, even Pink on red', () => {
    for (const { hex } of PLAYER_COLORS) {
      for (const ready of [true, false]) {
        const look = fireLook(hex, ready);
        const gap = parseColor(look.gap)!;
        const rim = parseColor(look.rim)!.slice(0, 3) as [number, number, number];
        const fill = parseColor(look.fill)!.slice(0, 3) as [number, number, number];
        const onRim = over(gap, rim);
        expect(contrastRatio(onRim, rim)).toBeGreaterThan(2);
        expect(contrastRatio(onRim, fill)).toBeGreaterThan(1.5);
      }
    }
  });

  it('the band, reload ring and ammo pips still fit on the phone', () => {
    expect(CONTROLS_Y + FIRE_RIM + FIRE_R + 4 + 2).toBeLessThan(640);
  });
});
