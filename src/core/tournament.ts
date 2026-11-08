// The 7-game tournament: best of 7 across different games, first to 4 wins.
// Pure rules (no DOM, no storage), so the app, tests and sims share them.
import { makeRng } from './rng';
import type { PlayerIndex } from './types';

/** Games a tournament draws from: the action, aim and reaction games (board games stay out). */
export const TOURNAMENT_KINDS = ['Action', 'Aim · turns', 'Reaction', 'Timing', 'Frantic'];
export const TOURNAMENT_LENGTH = 7;
export const WINS_NEEDED = 4;
/** Before game 1 a family may swap this many lineup games for games not in it (F113). */
export const MAX_SWAPS = 3;

export type TournamentGame = { game: string; winner: PlayerIndex | null };
export type Tournament = {
  started: number;
  /** Every game in play order. The first 7 are the lineup; draws push the next ones in. */
  lineup: string[];
  played: TournamentGame[];
  /** Lineup games swapped out before game 1 (older saves: none). */
  swaps?: number;
};

/** The pool: games of a tournament kind that can be played, in a fixed order. */
export function tournamentPool(meta: readonly { id: string; kind: string }[], playable: (id: string) => boolean): string[] {
  return meta.filter((m) => TOURNAMENT_KINDS.includes(m.kind) && playable(m.id)).map((m) => m.id);
}

/**
 * A new tournament: the pool shuffled by the seed. With 7 or more games no game
 * repeats in the lineup; a short pool repeats games, never back to back. The
 * lineup runs long enough that draws never run it out.
 */
export function newTournament(pool: readonly string[], seed: number, now = Date.now()): Tournament {
  if (!pool.length) throw new Error('tournament needs at least one game');
  const rng = makeRng(seed);
  const lineup: string[] = [];
  while (lineup.length < TOURNAMENT_LENGTH * 3) {
    const deck = [...pool];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    if (deck.length > 1 && deck[0] === lineup[lineup.length - 1]) [deck[0], deck[1]] = [deck[1], deck[0]];
    lineup.push(...deck);
  }
  return { started: now, lineup, played: [] };
}

export function tournamentWins(t: Tournament): [number, number] {
  const w: [number, number] = [0, 0];
  for (const g of t.played) if (g.winner !== null) w[g.winner]++;
  return w;
}

/** The champion once someone reaches 4 wins, else null. */
export function champion(t: Tournament): PlayerIndex | null {
  const [a, b] = tournamentWins(t);
  return a >= WINS_NEEDED ? 0 : b >= WINS_NEEDED ? 1 : null;
}

/** The game to play next, or null when the tournament is over. */
export function nextGame(t: Tournament): string | null {
  return champion(t) === null ? t.lineup[t.played.length] ?? null : null;
}

/** Record a finished game. A draw counts for nobody, so one more game joins the lineup. */
export function recordGame(t: Tournament, game: string, winner: PlayerIndex | null): void {
  if (nextGame(t) !== game) return;
  t.played.push({ game, winner });
}

/**
 * What the lineup strip shows: the 7 planned games, plus the extra games that
 * draws pulled in. Each slot says who won it, or that it is next.
 */
export function lineupSlots(t: Tournament): { game: string; winner: PlayerIndex | null; state: 'done' | 'next' | 'later' }[] {
  const draws = t.played.filter((g) => g.winner === null).length;
  const over = champion(t) !== null;
  const shown = over ? t.played.length : Math.max(TOURNAMENT_LENGTH + draws, t.played.length + 1);
  return t.lineup.slice(0, shown).map((game, i) => {
    const done = t.played[i];
    if (done) return { game, winner: done.winner, state: 'done' };
    return { game, winner: null, state: i === t.played.length ? 'next' : 'later' };
  });
}

/** Swaps left before game 1 (none once a game is played). */
export function swapsLeft(t: Tournament): number {
  return t.played.length ? 0 : Math.max(0, MAX_SWAPS - (t.swaps ?? 0));
}

/**
 * Swap lineup game i (one of the 7) for the next pool game, in pool order after it, that
 * isn't in the 7, so the 7 stay all different; tapping again keeps cycling. Only before
 * game 1 and while swaps are left. Returns whether it swapped.
 */
export function swapGame(t: Tournament, i: number, pool: readonly string[]): boolean {
  if (swapsLeft(t) <= 0 || i < 0 || i >= TOURNAMENT_LENGTH) return false;
  const seven = t.lineup.slice(0, TOURNAMENT_LENGTH);
  const from = Math.max(0, pool.indexOf(t.lineup[i]));
  for (let k = 1; k <= pool.length; k++) {
    const g = pool[(from + k) % pool.length];
    if (seven.includes(g)) continue;
    // The game after the 7 (a draw's extra) never repeats the 7th back to back.
    if (i === TOURNAMENT_LENGTH - 1 && t.lineup[TOURNAMENT_LENGTH] === g) continue;
    t.lineup[i] = g;
    t.swaps = (t.swaps ?? 0) + 1;
    return true;
  }
  return false;
}
