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
});
