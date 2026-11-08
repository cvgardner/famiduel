import { afterEach, describe, expect, it } from 'vitest';
import { POWER_R, POWER_R_BIG, PowerButton, setBigHands } from '../src/engine/widgets';
import { H, W } from '../src/engine/world';
import { power } from './helpers';
import { DIVE_R, DIVE_R_BIG } from '../src/games/penalty/index';
import { CONTROLS_Y, controlsFor, FIRE_R_BIG, FIRE_RIM, STICK_R } from '../src/games/tanks/controls';

// Settings > Little hands draws in-game power buttons bigger, as far as the screen edge
// allows, with the same touch area (drawn radius + slop) either way.
describe('little hands: power buttons', () => {
  afterEach(() => setBigHands(false));
  const pw = power('minigolf', 'magnet');
  it('grows a button with room, keeps its touch area', () => {
    const normal = new PowerButton(W / 2, H / 2, 0, pw, '#3fa9ff').button;
    setBigHands(true);
    const big = new PowerButton(W / 2, H / 2, 0, pw, '#3fa9ff').button;
    expect(normal.r).toBe(POWER_R);
    expect(big.r).toBe(POWER_R_BIG);
    expect(big.r + big.slop).toBe(normal.r + normal.slop);
  });
  it('grows only as far as the edge allows, never below normal', () => {
    setBigHands(true);
    expect(new PowerButton(W / 2, 26, 1, pw, '#ff5a7a').button.r).toBe(POWER_R);
    expect(new PowerButton(W / 2, H - 26, 0, pw, '#3fa9ff').button.r).toBe(POWER_R);
    const near = new PowerButton(31, H / 2, 0, pw, '#3fa9ff').button;
    expect(near.r).toBe(25);
  });
});

// The other in-game controls drawn bigger with Little hands (F92): Penalty's dive buttons and
// Tank Duel's FIRE. They must still fit the screen and clear their neighbours.
describe('little hands: dive buttons and FIRE', () => {
  it('Penalty dive buttons grow but stay apart (centres 76 apart) and on screen', () => {
    expect(DIVE_R_BIG).toBeGreaterThan(DIVE_R);
    expect(2 * DIVE_R_BIG + 4).toBeLessThan(76);
    expect(104 - DIVE_R_BIG).toBeGreaterThan(0);
    expect(52 - DIVE_R_BIG - 4).toBeGreaterThan(0); // its shadow sits 4 below
  });
  it('a big FIRE (band, reload ring) stays on the phone and clear of the stick', () => {
    expect(CONTROLS_Y + FIRE_RIM + FIRE_R_BIG + 4 + 2).toBeLessThan(H);
    for (const c of [controlsFor(false), controlsFor(true)]) {
      expect(Math.min(c.fireX - FIRE_R_BIG - FIRE_RIM - 4, W - c.fireX - FIRE_R_BIG - FIRE_RIM - 4)).toBeGreaterThan(0);
      expect(Math.abs(c.stickX - c.fireX)).toBeGreaterThan(STICK_R + FIRE_R_BIG + FIRE_RIM + 30);
    }
  });
});
