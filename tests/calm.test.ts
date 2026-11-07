import { afterEach, describe, expect, it } from 'vitest';
import { Fx } from '../src/engine/fx';
import { reducedMotion } from '../src/engine/calm';

const g = globalThis as { matchMedia?: unknown };
const askFor = (reduce: boolean) => {
  g.matchMedia = (q: string) => ({ matches: reduce && q.includes('reduced-motion: reduce'), addEventListener() {} });
};

// Counts how far the camera moves when a shake is applied.
function shaken(fx: Fx): number {
  let moved = 0;
  fx.applyShake({ translate: (x: number, y: number) => (moved += Math.abs(x) + Math.abs(y)) } as never);
  return moved;
}

describe('reduce motion', () => {
  afterEach(() => delete g.matchMedia);

  it('is off without a window (unit tests, sims)', () => {
    delete g.matchMedia;
    expect(reducedMotion()).toBe(false);
  });

  it('the camera shakes normally, and not at all when the phone asks for less motion', () => {
    askFor(false);
    const fx = new Fx();
    fx.shake(8, 0.3);
    expect(shaken(fx)).toBeGreaterThan(0);
    askFor(true);
    const calm = new Fx();
    calm.shake(8, 0.3);
    expect(shaken(calm)).toBe(0);
  });

  it('a full-screen flash is a quarter as bright when the phone asks for less motion', () => {
    const peak = (fx: Fx) => {
      let a = 0;
      let alpha = 1;
      const g = new Proxy({}, {
        get: (_t, k) => (k === 'fillRect' ? () => (a = Math.max(a, (g as { globalAlpha: number }).globalAlpha)) : k === 'globalAlpha' ? alpha : () => {}),
        set: (_t, k, v) => ((k === 'globalAlpha' ? (alpha = v) : 0), true),
      });
      fx.flash('#fff', 0.18);
      fx.render(g as never);
      return a;
    };
    askFor(false);
    const loud = peak(new Fx());
    askFor(true);
    const calm = peak(new Fx());
    expect(loud).toBeCloseTo(0.35, 2);
    expect(calm).toBeCloseTo(loud / 4, 2);
  });
});
