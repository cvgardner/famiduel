import { describe, expect, it } from 'vitest';
import gamesJson from '../content/games.json';
import { GAMES } from '../src/games/registry';
import {
  TOURNAMENT_LENGTH,
  champion,
  lineupSlots,
  newTournament,
  nextGame,
  recordGame,
  tournamentPool,
  tournamentWins,
} from '../src/core/tournament';
import type { PlayerIndex } from '../src/core/types';

const pool = tournamentPool(gamesJson.games, (id) => id in GAMES);

describe('7-game tournament', () => {
  it('draws from the action and aim games only, never the board games', () => {
    expect(pool.length).toBeGreaterThanOrEqual(TOURNAMENT_LENGTH);
    for (const id of ['checkers', 'fourinarow', 'tictactoe', 'seabattle', 'rps']) expect(pool).not.toContain(id);
    expect(pool).toContain('airhockey');
    expect(pool).toContain('minigolf');
  });

  it('a seed gives the same lineup, the 7 games are all different, and seeds vary it', () => {
    const a = newTournament(pool, 42, 0);
    expect(newTournament(pool, 42, 0)).toEqual(a);
    expect(new Set(a.lineup.slice(0, TOURNAMENT_LENGTH)).size).toBe(TOURNAMENT_LENGTH);
    const firsts = new Set(Array.from({ length: 30 }, (_, s) => newTournament(pool, s).lineup[0]));
    expect(firsts.size).toBeGreaterThan(3);
  });

  it('first to 4 wins, even before all 7 are played', () => {
    const t = newTournament(pool, 1);
    for (const w of [0, 1, 0, 0, 0] as PlayerIndex[]) recordGame(t, nextGame(t)!, w);
    expect(tournamentWins(t)).toEqual([4, 1]);
    expect(champion(t)).toBe(0);
    expect(nextGame(t)).toBeNull();
    expect(lineupSlots(t).map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  it('3-3 goes to a seventh game that decides it', () => {
    const t = newTournament(pool, 2);
    for (const w of [0, 1, 0, 1, 0, 1] as PlayerIndex[]) recordGame(t, nextGame(t)!, w);
    expect(champion(t)).toBeNull();
    recordGame(t, nextGame(t)!, 1);
    expect(champion(t)).toBe(1);
    expect(t.played).toHaveLength(7);
  });

  it('a draw counts for nobody and adds one more game to the lineup', () => {
    const t = newTournament(pool, 3);
    expect(lineupSlots(t)).toHaveLength(7);
    expect(lineupSlots(t)[0].state).toBe('next');
    recordGame(t, nextGame(t)!, null);
    expect(tournamentWins(t)).toEqual([0, 0]);
    expect(lineupSlots(t)).toHaveLength(8);
    // A long run of draws never runs the lineup out.
    for (let i = 0; i < 12; i++) recordGame(t, nextGame(t)!, null);
    expect(nextGame(t)).not.toBeNull();
  });

  it('ignores a result for a game the tournament is not on', () => {
    const t = newTournament(pool, 4);
    const wrong = pool.find((g) => g !== nextGame(t))!;
    recordGame(t, wrong, 0);
    expect(t.played).toHaveLength(0);
  });

  it('a short pool repeats games but never back to back', () => {
    const t = newTournament(['a', 'b', 'c'], 9);
    for (let i = 1; i < t.lineup.length; i++) expect(t.lineup[i]).not.toBe(t.lineup[i - 1]);
  });
});
