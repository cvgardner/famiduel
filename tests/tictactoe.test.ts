import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { other, type BotLevel } from '../src/core/types';
import { lineWinner, RULES, TicTacToe, TicTacToeBot } from '../src/games/tictactoe/logic';
import { player } from './helpers';

function play(levels: [BotLevel, BotLevel], seed: number, assist: [number, number] = [0, 0]) {
  const rng = makeRng(seed);
  const g = new TicTacToe([player({ bot: levels[0], assist: assist[0] }), player({ bot: levels[1], assist: assist[1] })], rng);
  const bots = [new TicTacToeBot(0, levels[0], rng), new TicTacToeBot(1, levels[1], rng)];
  let guard = 0;
  while (!g.done && guard++ < 200) {
    if (g.between) g.next();
    else expect(g.apply(bots[g.turn].chooseMove(g))).toBe(true);
  }
  return g;
}

describe('tic-tac-toe', () => {
  it('bot vs bot ends: first to 3, or the leader after 9 games', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = play(['normal', 'normal'], seed);
      expect(g.done).toBe(true);
      expect(g.games).toBeLessThanOrEqual(RULES.maxGames);
      if (g.winner !== null) expect(g.score[g.winner]).toBeGreaterThan(g.score[1 - g.winner]);
      else expect(g.score[0]).toBe(g.score[1]);
    }
  });

  it('hard vs hard is all draws, so the 9-game cap ends it as a draw', () => {
    const g = play(['hard', 'hard'], 3);
    expect(g.games).toBe(RULES.maxGames);
    expect(g.winner).toBeNull();
  });

  it('is deterministic for a seed', () => {
    const a = play(['normal', 'easy'], 11);
    const b = play(['normal', 'easy'], 11);
    expect(a.score).toEqual(b.score);
    expect(a.starters).toEqual(b.starters);
  });

  it('a hard bot beats an easy bot most of the time and never loses a game', () => {
    let wins = 0;
    for (let s = 0; s < 8; s++) {
      const g = play(['hard', 'easy'], 50 + s);
      if (g.winner === 0) wins++;
      expect(g.score[1]).toBe(0);
    }
    expect(wins).toBeGreaterThanOrEqual(6);
  });

  it('the starting player alternates without handicap', () => {
    const g = play(['normal', 'normal'], 8);
    for (let i = 1; i < g.starters.length; i++) expect(g.starters[i]).not.toBe(g.starters[i - 1]);
  });

  it('handicap: the assisted player starts more often, every game at assist 2+', () => {
    const g = new TicTacToe([player(), player({ assist: 2 })], makeRng(1));
    for (let n = 0; n < 9; n++) expect(g.starterFor(n)).toBe(1);
    const h = new TicTacToe([player({ assist: 1 }), player()], makeRng(1));
    const starts = Array.from({ length: 9 }, (_, n) => h.starterFor(n)).filter((p) => p === 0).length;
    expect(starts).toBe(6);
  });

  it('wins on rows, columns and diagonals; filled cells are refused', () => {
    expect(lineWinner([0, 0, 0, -1, -1, -1, -1, -1, -1])?.p).toBe(0);
    expect(lineWinner([1, -1, -1, 1, -1, -1, 1, -1, -1])?.p).toBe(1);
    expect(lineWinner([-1, -1, 0, -1, 0, -1, 0, -1, -1])?.line).toEqual([2, 4, 6]);
    const g = new TicTacToe([player(), player()], makeRng(2));
    const first = g.turn;
    expect(g.apply(4)).toBe(true);
    expect(g.apply(4)).toBe(false);
    expect(g.turn).not.toBe(first);
  });

  it('hard always blocks and takes wins', () => {
    const g = new TicTacToe([player(), player()], makeRng(5));
    g.turn = 1;
    g.board = [0, 0, -1, -1, 1, -1, -1, -1, -1];
    expect(new TicTacToeBot(1, 'hard', makeRng(1)).chooseMove(g)).toBe(2);
    g.board = [0, 0, -1, 1, 1, -1, 0, -1, -1];
    expect(new TicTacToeBot(1, 'hard', makeRng(1)).chooseMove(g)).toBe(5);
  });

  it('X always goes first: whoever starts a game plays X', () => {
    for (const seed of [1, 2, 3, 4]) {
      const g = new TicTacToe([player(), player()], makeRng(seed));
      for (let n = 0; n < 4; n++) {
        const p = g.turn;
        expect(g.isX(p)).toBe(true);
        expect(g.isX(other(p))).toBe(false);
        // Play the game out with the first open cell, then start the next one.
        while (!g.between && !g.done) g.apply(g.legal()[0]);
        if (g.done) break;
        g.next();
      }
    }
  });
});
