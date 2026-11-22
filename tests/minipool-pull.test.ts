// F442: a full shot took 130 units of pull from where the touch started, so a player whose cue
// sat by their own cushion and who started the pull on the ball ran out of screen at ~0.8 power.
import { describe, expect, it } from 'vitest';
import { H } from '../src/engine/world';
import { pullShot } from '../src/games/minipool/index';
import { PHYS, TABLE } from '../src/games/minipool/physics';

describe('Mini Pool pull', () => {
  it('reaches full power from a cue on your own cushion, both seats', () => {
    const bottom = TABLE.bottom - PHYS.r;
    // Bottom seat: start on the ball, pull straight down to a few units short of the edge.
    expect(pullShot({ sx: 180, sy: bottom, x: 180, y: H - 6 })!.power).toBe(1);
    const top = TABLE.top + PHYS.r;
    expect(pullShot({ sx: 180, sy: top, x: 180, y: 6 })!.power).toBe(1);
    // A slanted pull toward a corner too.
    expect(pullShot({ sx: 120, sy: bottom, x: 120 - 40, y: H - 6 })!.power).toBeGreaterThan(0.97);
  });
  it('keeps the usual feel with room to spare', () => {
    expect(pullShot({ sx: 180, sy: 380, x: 180, y: 445 })!.power).toBeCloseTo(0.5, 5);
    expect(pullShot({ sx: 180, sy: 380, x: 180, y: 510 })!.power).toBe(1);
    expect(pullShot({ sx: 180, sy: 380, x: 180, y: 388 })).toBeNull();
  });
  it('still needs a real pull near the edge (never full power from a flick)', () => {
    expect(pullShot({ sx: 180, sy: H - 20, x: 180, y: H - 4 })!.power).toBeLessThan(0.3);
  });
});
