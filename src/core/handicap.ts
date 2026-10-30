import type { PlayerIndex } from './types';

export const MAX_ASSIST = 3;

/**
 * Effective assist for a player: their manual head start (set in the player
 * card, e.g. for a young kid) plus the automatic catch-up from the match-night
 * score. Auto catch-up gives the trailing player 1 level per game they are
 * behind, capped at MAX_ASSIST, so a parent and a kid drift back to even.
 */
export function effectiveAssist(
  base: [number, number],
  wins: [number, number],
  auto: boolean,
  p: PlayerIndex,
): number {
  const behind = auto ? Math.max(0, wins[p === 0 ? 1 : 0] - wins[p]) : 0;
  return Math.max(0, Math.min(MAX_ASSIST, base[p] + behind));
}

/** Linear map of assist 0..3 to a game knob, e.g. lerpAssist(a, 120, 180) for goal width. */
export function lerpAssist(assist: number, at0: number, at3: number): number {
  return at0 + ((at3 - at0) * Math.max(0, Math.min(MAX_ASSIST, assist))) / MAX_ASSIST;
}
