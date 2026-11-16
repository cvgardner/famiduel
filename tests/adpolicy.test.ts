import { describe, expect, it } from 'vitest';
import { AD_RULES, adDue, type AdState } from '../src/core/adpolicy';
import { makeMoney } from '../src/engine/ads';

const MIN = 60_000;
const st = (o: Partial<AdState> = {}): AdState => ({ removed: false, launches: 2, matchesSinceAd: 2, lastAdAt: 0, ...o });

describe('fair ads (core/adpolicy.ts)', () => {
  it('shows an ad after two matches and three minutes, on a second launch', () => {
    expect(AD_RULES).toEqual({ minMatches: 2, minGapMs: 3 * MIN, freeLaunches: 1 });
    expect(adDue(st(), 3 * MIN)).toBe(true);
  });

  it('never in the first session on a phone', () => {
    expect(adDue(st({ launches: 1, matchesSinceAd: 50 }), 600 * MIN)).toBe(false);
  });

  it('at most one ad every two matches', () => {
    expect(adDue(st({ matchesSinceAd: 0 }), 60 * MIN)).toBe(false);
    expect(adDue(st({ matchesSinceAd: 1 }), 60 * MIN)).toBe(false);
  });

  it('at most one ad every three minutes, counting from when the app opened', () => {
    expect(adDue(st({ lastAdAt: 10 * MIN }), 12 * MIN)).toBe(false);
    expect(adDue(st({ lastAdAt: 10 * MIN }), 13 * MIN)).toBe(true);
  });

  it('never after Remove ads', () => {
    expect(adDue(st({ removed: true, matchesSinceAd: 99 }), 600 * MIN)).toBe(false);
  });

  it('a plain browser has no ads and no purchase; ?fakeads gets the stand-ins', () => {
    expect(makeMoney('')).toBeNull();
    expect(makeMoney('?seed=1')).toBeNull();
    expect(makeMoney('?fakeads')?.fake).toBe(true);
  });
});
