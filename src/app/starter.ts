// Who goes first in a turn game. A match's first mover used to be a fresh coin toss
// every match, so a kid could go second three rematches running (and in Tic-Tac-Toe,
// Four in a Row or Penalty going first is an edge). Like families do at a table, starting
// now takes turns: each game remembers who started its last finished match on this phone
// session, and the rematch hands the start to the other seat. The first match of a game
// is still the game's own seeded coin toss.
import { shortName } from '../core/turnline';
import { other, type PlayerIndex } from '../core/types';

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
