// Fair ads (Chris, Nov 2026): the store build shows a full-screen ad now and then, only
// BETWEEN matches. Pure rules, no DOM, no SDK: the app asks `adDue()` when someone leaves a
// result screen (Rematch, Games, Next game) and shows an ad only when it says yes.
//
// - Never mid-round: the only caller is the result screen's buttons.
// - Never in the very first session on a phone (the first launch is ad-free).
// - At most one ad every `minMatches` finished matches AND `minGapMs` apart; the session's
//   start counts as the last ad, so nobody sees one in their first few minutes.
// - Never to unlock a game or a power: nothing in the app waits on an ad.
// - Never after "Remove ads" was bought.

export type AdRules = {
  /** Finished matches since the last ad (or since the app opened) before the next ad. */
  minMatches: number;
  /** Least time between two ads, and between opening the app and the first ad. */
  minGapMs: number;
  /** Launches with no ads at all: 1 = the first session on this phone is ad-free. */
  freeLaunches: number;
};

export const AD_RULES: AdRules = { minMatches: 2, minGapMs: 3 * 60_000, freeLaunches: 1 };

export type AdState = {
  /** "Remove ads" bought (or restored). */
  removed: boolean;
  /** Times the app has been opened on this phone, this launch included. */
  launches: number;
  /** Matches finished since the last ad, or since the app opened. */
  matchesSinceAd: number;
  /** When the last ad closed, or when the app opened if none has shown yet (ms). */
  lastAdAt: number;
};

/** True when leaving this result screen may show an ad. */
export function adDue(s: AdState, now: number, rules: AdRules = AD_RULES): boolean {
  if (s.removed) return false;
  if (s.launches <= rules.freeLaunches) return false;
  if (s.matchesSinceAd < rules.minMatches) return false;
  return now - s.lastAdAt >= rules.minGapMs;
}
