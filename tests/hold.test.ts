import { describe, expect, it } from 'vitest';
import { HOLD_MS, HoldGate } from '../src/engine/hold';

describe('HoldGate (press-and-hold pause)', () => {
  it('a tap does not fire and asks for a hint', () => {
    const g = new HoldGate();
    g.press(1000);
    expect(g.update(1100)).toBe('none');
    expect(g.release(1120)).toBe('tooShort');
    expect(g.holding).toBe(false);
  });

  it('fires exactly once after HOLD_MS, even if the finger stays down', () => {
    const g = new HoldGate();
    g.press(0);
    expect(g.progress(HOLD_MS / 2)).toBeCloseTo(0.5);
    expect(g.update(HOLD_MS - 1)).toBe('none');
    expect(g.update(HOLD_MS)).toBe('fired');
    expect(g.update(HOLD_MS + 500)).toBe('none');
    expect(g.release(HOLD_MS + 600)).toBe('none');
  });

  it('a release after the time fires even if no frame ran in between', () => {
    const g = new HoldGate();
    g.press(0);
    expect(g.release(HOLD_MS + 10)).toBe('fired');
  });

  it('cancel (finger slid off) drops the hold silently', () => {
    const g = new HoldGate();
    g.press(0);
    g.cancel();
    expect(g.update(HOLD_MS * 2)).toBe('none');
    expect(g.release(HOLD_MS * 2)).toBe('none');
    expect(g.progress(HOLD_MS)).toBe(0);
  });

  it('is long enough to ignore taps and brushes but under a second', () => {
    expect(HOLD_MS).toBeGreaterThanOrEqual(400);
    expect(HOLD_MS).toBeLessThan(1000);
  });
});
