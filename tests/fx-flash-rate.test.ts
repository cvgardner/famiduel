import { describe, expect, it } from 'vitest';
import { BLINK_MAX_HZ } from '../src/engine/calm';
import { Fx } from '../src/engine/fx';

// F228: full-screen flashes had no rate limit; a goal, a power and a frenzy (or both seats'
// powers) could flash the whole board several times in one second.
describe('fx.flash rate', () => {
  it('ten flash calls in one second start at most BLINK_MAX_HZ flashes', () => {
    const fx = new Fx();
    for (let i = 0; i < 60; i++) {
      if (i % 6 === 0) fx.flash('#fff', 0.18);
      fx.update(1 / 60);
    }
    expect(fx.flashes).toBeLessThanOrEqual(BLINK_MAX_HZ);
    expect(fx.flashes).toBeGreaterThanOrEqual(1);
  });
  it('flashes half a second or more apart all show', () => {
    const fx = new Fx();
    for (let i = 0; i < 180; i++) {
      if (i % 30 === 0) fx.flash('#fff', 0.18);
      fx.update(1 / 60);
    }
    expect(fx.flashes).toBe(6);
  });
  it('a single flash still shows', () => {
    const fx = new Fx();
    fx.flash();
    expect(fx.flashes).toBe(1);
  });
});
