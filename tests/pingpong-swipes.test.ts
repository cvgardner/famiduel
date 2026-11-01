// Ping Pong swipe mix: a range of human-like finger gestures must make a healthy mix of
// shots. Curves have to be reliably reachable and smashes must take a deliberate flick
// (Chris's playtest, Nov 2026: "basically everything turns into smashes").
// `npm run swipes` prints the full table.
import { describe, expect, it } from 'vitest';
import { sweep, type Outcome, type Tally } from './pingpongSwipes';

const share = (t: Tally, o: Outcome) => t[o] / Object.values(t).reduce((a, b) => a + b, 0);

describe('ping pong swipe mix', () => {
  const { byFamily, all } = sweep();

  it('holding still blocks', () => {
    expect(share(byFamily.hold, 'block')).toBe(1);
  });

  it('an ordinary push toward the net drives, it never smashes', () => {
    expect(share(byFamily.push, 'drive')).toBeGreaterThanOrEqual(0.8);
    expect(byFamily.push.smash).toBe(0);
  });

  it('a hard, straight flick smashes', () => {
    expect(share(byFamily['hard push'], 'smash')).toBeGreaterThanOrEqual(0.8);
  });

  it('sideways and diagonal swipes curve, and never smash', () => {
    expect(share(byFamily.sideways, 'curve')).toBeGreaterThanOrEqual(0.65);
    expect(share(byFamily.diagonal, 'curve')).toBeGreaterThanOrEqual(0.6);
    expect(byFamily.sideways.smash + byFamily.diagonal.smash).toBe(0);
  });

  it('across all gestures no shot dominates', () => {
    for (const o of ['smash', 'curve', 'drive', 'block'] as Outcome[]) expect(share(all, o)).toBeLessThan(0.5);
    expect(share(all, 'smash')).toBeLessThanOrEqual(0.25);
    expect(share(all, 'curve')).toBeGreaterThanOrEqual(0.3);
    expect(share(all, 'miss')).toBeLessThanOrEqual(0.15);
  });
});
