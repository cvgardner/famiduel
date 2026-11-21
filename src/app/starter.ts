// Who goes first in a turn game. A match's first mover used to be a fresh coin toss
// every match, so a kid could go second three rematches running (and in Tic-Tac-Toe,
// Four in a Row or Penalty going first is an edge). Like families do at a table, starting
// now takes turns: each game remembers who started its last finished match on this phone
// session, and the rematch hands the start to the other seat. The first match of a game
// is still the game's own seeded coin toss.
import { shortName } from '../core/turnline';
import { other, type PlayerIndex } from '../core/types';
import { fitSize, scaledSize, silentSeat, type G } from '../engine/draw';
import { W } from '../engine/world';

export class StarterLog {
  private last = new Map<string, PlayerIndex>();

  /** The seat that should go first in this game's next match (undefined = coin toss). */
  next(gameId: string): PlayerIndex | undefined {
    const p = this.last.get(gameId);
    return p === undefined ? undefined : other(p);
  }

  /** Remember who went first in a finished match (null: the game has no first mover). */
  record(gameId: string, first: PlayerIndex | null | undefined): void {
    if (first === 0 || first === 1) this.last.set(gameId, first);
  }
}

/**
 * What each seat reads under the countdown in a turn game: the starter is told it goes
 * first, the other seat is told who does. Without it a rematch's swap was only visible in
 * the game's small turn line, so a kid could think the app had picked the other player
 * again. Null for a seat (or both) when the game has no first mover yet (Sea Battle picks
 * after placement).
 */
export function starterLines(first: PlayerIndex | null | undefined, names: [string, string]): [string | null, string | null] {
  if (first !== 0 && first !== 1) return [null, null];
  const lines: [string | null, string | null] = [null, null];
  lines[first] = 'You go first!';
  lines[other(first)] = `${shortName(names[first])} goes first`;
  return lines;
}

/**
 * The seats that see the "3 2 1" countdown (F151). Both seats in a match between people;
 * against the bot only the person's seat, since the bot half's copy now turns to face the
 * person and read as a second upright digit.
 */
export function countdownSeats(players: readonly { bot: unknown }[]): PlayerIndex[] {
  return ([0, 1] as const).filter((p) => !silentSeat(players, p));
}

/** The countdown pill's usual width; it grows (up to the screen less PILL_EDGE each side) for a long name. */
export const PILL_W = 260;
export const PILL_EDGE = 8;
const PILL_PAD = 16;

/**
 * Size and pill width for a seat's starter line (F318). "WWWWWWWWWWWW goes first" at a fixed
 * size 20 ran ~35 units off both screen edges on a 320 px phone with Bigger text: the words
 * now shrink to fit (no smaller than MIN_TEXT) and the pill widens to hold them.
 */
export function starterPill(g: G, line: string, mine: boolean): { size: number; w: number } {
  const max = W - 2 * PILL_EDGE;
  const size = fitSize(g, line, max - 2 * PILL_PAD, mine ? 26 : 20);
  g.font = `800 ${scaledSize(size)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const w = Math.min(max, Math.max(PILL_W, g.measureText(line).width + 2 * PILL_PAD));
  return { size, w };
}

/** Where a seat's "goes first" pill sits from the middle line, in world units. */
export const STARTER_DY = 200;

/**
 * F356: the pill sits at STARTER_DY, past the usual digit (COUNT_DY 120). A game that moves
 * its digit out toward the pill (Mini Pool's sits at 190, past the cue ball's spot, with the
 * player's strip just past it) gets the pill on the middle side of the digit instead, so the
 * solid pill never covers "3 2 1" or the strip: the digit is at most ~84 units tall (size
 * 110), the pill 44. In Mini Pool it hides the cue ball for the 3 s of "3 2 1".
 */
export function starterPillDy(digitDy: number): number {
  return digitDy > STARTER_DY - 70 ? digitDy - 68 : STARTER_DY;
}
