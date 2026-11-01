import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerIndex } from '../src/core/types';
import { Checkers, CheckersBot, legalMoves, moveTrail, RULES, sq, type Cells } from '../src/games/checkers/logic';
import { player } from './helpers';

function play(levels: [BotLevel, BotLevel], seed: number) {
  const rng = makeRng(seed);
  const g = new Checkers([player({ bot: levels[0] }), player({ bot: levels[1] })], rng);
  const bots = [new CheckersBot(0, levels[0], rng), new CheckersBot(1, levels[1], rng)];
  let guard = 0;
  while (!g.done && guard++ < 1000) {
    const m = bots[g.turn].chooseMove(g)!;
    expect(g.apply(m)).toBe(true);
  }
  return g;
}

function empty(): Cells {
  return new Int8Array(64);
}

function gameWith(cells: Cells, turn: PlayerIndex, assist: [number, number] = [0, 0]) {
  const g = new Checkers([player({ assist: assist[0] }), player({ assist: assist[1] })], makeRng(1));
  g.cells = cells;
  g.turn = turn;
  return g;
}

describe('checkers rules', () => {
  it('starts with 12 men each, 7 opening moves for whoever starts', () => {
    const g = new Checkers([player(), player()], makeRng(1));
    expect([...g.cells].filter((v) => v === 1)).toHaveLength(12);
    expect([...g.cells].filter((v) => v === -1)).toHaveLength(12);
    expect(g.legal()).toHaveLength(7);
    // Every piece sits on a dark square; player 0 at the bottom.
    expect(g.cells[sq(7, 0)]).toBe(1);
    expect(g.cells[sq(0, 1)]).toBe(-1);
  });

  it('men move diagonally forward only; kings both ways', () => {
    const b = empty();
    b[sq(4, 3)] = 1;
    b[sq(2, 5)] = 2;
    const moves = legalMoves(b, 0);
    const man = moves.filter((m) => m.from === sq(4, 3)).map((m) => m.path[0]);
    expect(man.sort()).toEqual([sq(3, 2), sq(3, 4)].sort());
    const king = moves.filter((m) => m.from === sq(2, 5)).map((m) => m.path[0]);
    expect(king.sort()).toEqual([sq(1, 4), sq(1, 6), sq(3, 4), sq(3, 6)].sort());
  });

  it('captures are compulsory', () => {
    const b = empty();
    b[sq(5, 2)] = 1;
    b[sq(5, 6)] = 1;
    b[sq(4, 3)] = -1;
    const moves = legalMoves(b, 0);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from: sq(5, 2), path: [sq(3, 4)], caps: [sq(4, 3)] });
    const g = gameWith(b, 0);
    expect(g.apply({ from: sq(5, 6), path: [sq(4, 7)], caps: [], crown: false })).toBe(false);
  });

  it('multi-jumps chain and must be completed', () => {
    const b = empty();
    b[sq(7, 0)] = 1;
    b[sq(6, 1)] = -1;
    b[sq(4, 3)] = -1;
    b[sq(2, 3)] = -1;
    b[sq(0, 7)] = -1;
    const moves = legalMoves(b, 0);
    expect(moves).toHaveLength(1);
    expect(moves[0].path).toEqual([sq(5, 2), sq(3, 4), sq(1, 2)]);
    expect(moves[0].caps).toHaveLength(3);
    const g = gameWith(b, 0);
    // Stopping half-way is not a legal move.
    expect(g.apply({ from: sq(7, 0), path: [sq(5, 2)], caps: [sq(6, 1)], crown: false })).toBe(false);
    expect(g.apply(moves[0])).toBe(true);
    expect(g.score[0]).toBe(3);
  });

  it('the last move shows its whole path and every piece it took', () => {
    const b = empty();
    b[sq(7, 0)] = 1;
    b[sq(6, 1)] = -1;
    b[sq(4, 3)] = -1;
    b[sq(2, 3)] = -1;
    b[sq(0, 7)] = -1;
    const g = gameWith(b, 0);
    expect(g.apply(legalMoves(b, 0)[0])).toBe(true);
    const m = moveTrail(g.lastMove!);
    // Start, then each landing in order (not just start and end).
    expect(m.trail).toEqual([sq(7, 0), sq(5, 2), sq(3, 4), sq(1, 2)]);
    expect(m.taken).toEqual([sq(6, 1), sq(4, 3), sq(2, 3)]);
    // The taken squares are empty now; the mover stands on the trail's end.
    for (const s of m.taken) expect(g.cells[s]).toBe(0);
    expect(g.cells[m.trail[m.trail.length - 1]]).toBe(1);
    // A simple move: start and end, nothing taken.
    const q = moveTrail({ from: sq(0, 7), path: [sq(1, 6)], caps: [], crown: false });
    expect(q).toEqual({ trail: [sq(0, 7), sq(1, 6)], taken: [] });
  });

  it('a man crowned during a capture ends its move there', () => {
    const b = empty();
    b[sq(2, 1)] = 1;
    b[sq(1, 2)] = -1;
    b[sq(1, 4)] = -1; // a king could continue 0,3 -> 2,5, a fresh king may not
    b[sq(7, 6)] = -1;
    const moves = legalMoves(b, 0);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ path: [sq(0, 3)], crown: true });
    const g = gameWith(b, 0);
    g.apply(moves[0]);
    expect(g.cells[sq(0, 3)]).toBe(2);
    expect(g.turn).toBe(1);
  });

  it('kings capture backwards, and a jumped piece cannot be jumped twice', () => {
    const b = empty();
    b[sq(3, 2)] = 2;
    b[sq(4, 3)] = -1;
    b[sq(6, 3)] = -1;
    b[sq(4, 1)] = -1;
    b[sq(2, 1)] = -1;
    const moves = legalMoves(b, 0);
    // A square route: every sequence takes each piece at most once.
    for (const m of moves) expect(new Set(m.caps).size).toBe(m.caps.length);
    expect(Math.max(...moves.map((m) => m.caps.length))).toBeGreaterThanOrEqual(2);
    expect(moves.some((m) => m.caps.includes(sq(4, 3)))).toBe(true);
  });

  it('no legal moves loses: blocked pieces count', () => {
    const b = empty();
    b[sq(0, 1)] = -1;
    b[sq(1, 0)] = 1;
    b[sq(1, 2)] = 1;
    b[sq(2, 3)] = 1;
    b[sq(6, 1)] = 1;
    const g = gameWith(b, 0);
    expect(g.apply({ from: sq(6, 1), path: [sq(5, 0)], caps: [], crown: false })).toBe(true);
    expect(g.done).toBe(true);
    expect(g.winner).toBe(0);
  });

  it('40 moves each with no capture and no man move is a draw', () => {
    const b = empty();
    b[sq(7, 0)] = 2;
    b[sq(0, 7)] = -2;
    const g = gameWith(b, 0);
    let guard = 0;
    const spots = new Set([sq(7, 0), sq(6, 1), sq(0, 7), sq(1, 6)]);
    while (!g.done && guard++ < 200) g.apply(g.legal().find((m) => spots.has(m.path[0]))!);
    expect(g.done).toBe(true);
    expect(g.winner).toBeNull();
    expect(g.ply).toBe(RULES.quietPliesDraw);
  });
});

describe('checkers match', () => {
  it('bot vs bot always ends', () => {
    for (const seed of [1, 2, 3, 4]) {
      const g = play(['normal', 'normal'], seed);
      expect(g.done).toBe(true);
      expect(g.ply).toBeLessThanOrEqual(RULES.maxPlies);
    }
  });

  it('is deterministic for a seed', () => {
    const a = play(['hard', 'easy'], 9);
    const b = play(['hard', 'easy'], 9);
    expect(a.ply).toBe(b.ply);
    expect(a.winner).toBe(b.winner);
    expect([...a.cells]).toEqual([...b.cells]);
  });

  it('a hard bot beats an easy bot most of the time', () => {
    let hard = 0;
    for (let s = 0; s < 4; s++) {
      if (play(['hard', 'easy'], 200 + s).winner === 0) hard++;
      if (play(['easy', 'hard'], 300 + s).winner === 1) hard++;
    }
    expect(hard).toBeGreaterThanOrEqual(6);
  }, 30000);

  it('handicap: undo uses = assist, hint only at assist 2+', () => {
    const g = new Checkers([player({ assist: 2 }), player({ assist: 0 })], makeRng(4));
    g.turn = 0;
    expect(g.undos).toEqual([2, 0]);
    expect(g.hint(0)).not.toBeNull();
    const before = [...g.cells];
    g.apply(g.legal()[0]);
    g.apply(g.legal()[0]);
    expect(g.canUndo(1)).toBe(false);
    expect(g.undo(0)).toBe(true);
    expect([...g.cells]).toEqual(before);
    expect(g.turn).toBe(0);
    expect(g.undos[0]).toBe(1);
    const weak = new Checkers([player({ assist: 1 }), player()], makeRng(4));
    weak.turn = 0;
    expect(weak.hint(0)).toBeNull();
    expect(weak.undos[0]).toBe(1);
  });

  it('hint does not hand over a free piece', () => {
    const b = empty();
    b[sq(5, 4)] = 1;
    b[sq(7, 0)] = 1;
    b[sq(3, 6)] = -1;
    b[sq(0, 1)] = -1;
    const g = gameWith(b, 0, [3, 0]);
    const h = g.hint(0)!;
    expect(h).not.toBeNull();
    expect(h.from === sq(5, 4) && h.path[0] === sq(4, 5)).toBe(false);
  });
});
