import { afterEach, describe, expect, it } from 'vitest';
import { POWER_R, POWER_R_BIG, PowerButton, setBigHands } from '../src/engine/widgets';
import { H, W } from '../src/engine/world';
import { power } from './helpers';

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
