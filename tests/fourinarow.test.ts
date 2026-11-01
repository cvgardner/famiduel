import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerIndex } from '../src/core/types';
import { COLS, EMPTY, FourInARow, FourInARowBot, findFour, height, idx, ROWS, RULES } from '../src/games/fourinarow/logic';
import { player, power } from './helpers';

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: [string, string]; assist?: [number, number] } = {}) {
  const rng = makeRng(seed);
  const pw = (p: PlayerIndex) => (opts.powers ? power('fourinarow', opts.powers[p]) : null);
  const g = new FourInARow(
    [player({ bot: levels[0], power: pw(0), assist: opts.assist?.[0] ?? 0 }), player({ bot: levels[1], power: pw(1), assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    rng,
  );
  const bots = [new FourInARowBot(0, levels[0], rng), new FourInARowBot(1, levels[1], rng)];
  let moves = 0;
  let maxMs = 0;
  while (!g.done && moves < 400) {
    if (g.roundOver) {
      g.nextRound();
      continue;
    }
    const t0 = performance.now();
    const plan = bots[g.turn].choose(g);
    maxMs = Math.max(maxMs, performance.now() - t0);
    for (const m of plan) expect(g.apply(m)).toBe(true);
    moves++;
  }
  return { g, moves, maxMs };
}

/** Build a board from rows written top row first: '.', '0', '1'. */
function setBoard(g: FourInARow, rows: string[]) {
  g.board.fill(EMPTY);
  rows.forEach((line, k) => {
    const r = ROWS - 1 - k;
    for (let c = 0; c < COLS; c++) if (line[c] !== '.') g.board[idx(c, r)] = Number(line[c]);
  });
  let id = 1;
  for (let i = 0; i < g.board.length; i++) g.ids[i] = g.board[i] === EMPTY ? 0 : id++;
}

describe('four in a row', () => {
  it('bot vs bot finishes a best-of-3 match', () => {
    for (const seed of [1, 2, 3]) {
      const { g, moves } = play(['normal', 'normal'], seed);
      expect(g.done).toBe(true);
      expect(moves).toBeLessThan(400);
      if (g.winner !== null) expect(g.score[g.winner]).toBe(RULES.winsNeeded);
    }
  });

  it('bot moves stay fast even when hard', () => {
    const { maxMs } = play(['hard', 'hard'], 5);
    expect(maxMs).toBeLessThan(250); // < 100 ms on a desktop; slack for CI
  });

  it('is deterministic for a seed', () => {
    const a = play(['hard', 'easy'], 7);
    const b = play(['hard', 'easy'], 7);
    expect(a.g.score).toEqual(b.g.score);
    expect(a.moves).toBe(b.moves);
  });

  it('a hard bot beats an easy bot most of the time', () => {
    let wins = 0;
    for (let s = 0; s < 6; s++) {
      const hardSeat = (s % 2) as PlayerIndex;
      const lv: [BotLevel, BotLevel] = hardSeat === 0 ? ['hard', 'easy'] : ['easy', 'hard'];
      if (play(lv, 50 + s).g.winner === hardSeat) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(5);
  });

  it('detects diagonal and vertical wins', () => {
    const g = new FourInARow([player(), player()], false, makeRng(1));
    setBoard(g, ['.......', '.......', '...0...', '..01...', '.011...', '0111...']);
    expect(findFour(g.board, 0)).toHaveLength(4);
    setBoard(g, ['.......', '.......', '.......', '1......', '1......', '1......']);
    g.turn = 1;
    expect(g.apply({ kind: 'drop', col: 0 })).toBe(true);
    expect(g.roundOver?.winner).toBe(1);
    expect(g.score).toEqual([0, 1]);
  });

  it('a full board is a draw game, and the loser of a game starts the next', () => {
    const g = new FourInARow([player(), player()], false, makeRng(1));
    // A full board pattern with no four, missing the top-right cell.
    setBoard(g, ['001100.', '110011' + '0', '001100' + '1', '110011' + '0', '001100' + '1', '110011' + '0']);
    expect(findFour(g.board, 0)).toBeNull();
    expect(findFour(g.board, 1)).toBeNull();
    g.turn = 1;
    g.starter = 0;
    expect(g.apply({ kind: 'drop', col: 6 })).toBe(true);
    expect(g.roundOver).toEqual({ winner: null, line: [] });
    g.nextRound();
    expect(g.turn).toBe(1); // after a draw, the other player starts
    // Player 0 wins a game: player 1 starts the next.
    setBoard(g, ['.......', '.......', '.......', '0......', '0......', '0......']);
    g.turn = 0;
    g.apply({ kind: 'drop', col: 0 });
    g.nextRound();
    expect(g.turn).toBe(1);
    expect(g.board.every((v) => v === EMPTY)).toBe(true);
  });

  it('hints show winning columns at assist 1, blocks at 2, traps at 3', () => {
    const rows = ['.......', '.......', '.......', '.......', '.1.....', '.100...'];
    const make = (a: number) => {
      const g = new FourInARow([player({ assist: a }), player()], false, makeRng(1));
      setBoard(g, rows);
      g.board[idx(4, 0)] = 0;
      g.board[idx(1, 2)] = 1;
      g.turn = 0;
      return g.hints(0);
    };
    expect(make(0)).toEqual({ win: [], block: [], avoid: [] });
    expect(make(1).win).toEqual([5]);
    expect(make(1).block).toEqual([]);
    expect(make(2).block).toEqual([1]);
    expect(make(3).win).toEqual([5]);
  });

  it('bomb clears the 3×3 where it lands, then the disc drops into place', () => {
    const g = new FourInARow([player({ power: power('fourinarow', 'bomb') }), player({ power: power('fourinarow', 'block') })], true, makeRng(1));
    setBoard(g, ['.......', '.......', '.......', '.111...', '.101...', '.1010..']);
    g.turn = 0;
    g.energy[0].value = 1;
    expect(g.apply({ kind: 'drop', col: 2, bomb: true })).toBe(true);
    // The bomb would land at (2,3): clears columns 1..3, rows 2..4, so the three discs on row 2 go.
    expect(g.board[idx(1, 2)]).toBe(EMPTY);
    expect(g.board[idx(3, 2)]).toBe(EMPTY);
    expect(g.board[idx(1, 1)]).toBe(1);
    expect(g.board[idx(2, 1)]).toBe(0);
    expect(g.board[idx(2, 2)]).toBe(0); // the bomb disc, landed after the blast
    expect(height(g.board, 2)).toBe(3);
    expect(g.energy[0].value).toBeLessThan(1);
    // Can't bomb without a full bar.
    g.turn = 0;
    expect(g.apply({ kind: 'drop', col: 4, bomb: true })).toBe(false);
  });

  it('flip turns an opponent disc but never completes four by itself', () => {
    const g = new FourInARow([player({ power: power('fourinarow', 'flip') }), player()], true, makeRng(1));
    setBoard(g, ['.......', '.......', '.......', '.......', '.......', '0001.1.']);
    g.turn = 0;
    g.energy[0].value = 1;
    expect(g.flippable(0)).not.toContain(idx(3, 0)); // would make 0000
    expect(g.apply({ kind: 'flip', col: 3, row: 0 })).toBe(false);
    expect(g.apply({ kind: 'flip', col: 5, row: 0 })).toBe(true);
    expect(g.board[idx(5, 0)]).toBe(0);
    expect(g.turn).toBe(1); // flipping uses your turn
  });

  it('remembers the newest disc (drop, bomb or flip) so the view can ring it', () => {
    const g = new FourInARow([player({ power: power('fourinarow', 'bomb') }), player({ power: power('fourinarow', 'flip') })], true, makeRng(1));
    g.turn = 0;
    expect(g.last).toBeNull();
    expect(g.apply({ kind: 'drop', col: 3 })).toBe(true);
    expect(g.last).toEqual({ p: 0, cell: idx(3, 0) });
    expect(g.apply({ kind: 'drop', col: 3 })).toBe(true);
    expect(g.last).toEqual({ p: 1, cell: idx(3, 1) });
    // A rejected move changes nothing.
    expect(g.apply({ kind: 'drop', col: 9 })).toBe(false);
    expect(g.last).toEqual({ p: 1, cell: idx(3, 1) });
    // A bomb's disc is marked where it ends up, after the blast.
    g.energy[0].value = 1;
    expect(g.apply({ kind: 'drop', col: 3, bomb: true })).toBe(true);
    expect(g.last).toEqual({ p: 0, cell: idx(3, height(g.board, 3) - 1) });
    expect(g.board[g.last!.cell]).toBe(0);
    // A flip marks the disc it turned.
    expect(g.apply({ kind: 'drop', col: 0 })).toBe(true); // player 1
    expect(g.apply({ kind: 'drop', col: 6 })).toBe(true); // player 0
    g.energy[1].value = 1;
    const target = g.flippable(1)[0];
    expect(g.apply({ kind: 'flip', col: Math.floor(target / ROWS), row: target % ROWS })).toBe(true);
    expect(g.last).toEqual({ p: 1, cell: target });
    // A new game starts with nothing marked.
    g.roundOver = { winner: 1, line: [] };
    g.nextRound();
    expect(g.last).toBeNull();
  });

  it('block stops the opponent playing one column for their next turn only', () => {
    const g = new FourInARow([player({ power: power('fourinarow', 'block') }), player()], true, makeRng(1));
    g.turn = 0;
    g.energy[0].value = 1;
    expect(g.apply({ kind: 'block', col: 3 })).toBe(true);
    expect(g.turn).toBe(0); // free action
    expect(g.apply({ kind: 'block', col: 2 })).toBe(false); // once
    expect(g.apply({ kind: 'drop', col: 0 })).toBe(true);
    expect(g.legalCols(1)).not.toContain(3);
    expect(g.apply({ kind: 'drop', col: 3 })).toBe(false);
    expect(g.apply({ kind: 'drop', col: 4 })).toBe(true);
    expect(g.legalCols(0)).toContain(3);
    expect(g.legalCols(1)).toContain(3);
  });

  it('bots use their powers and still finish', () => {
    for (const powers of [['bomb', 'flip'], ['block', 'bomb'], ['flip', 'block']] as [string, string][]) {
      const { g } = play(['normal', 'normal'], 11, { powers });
      expect(g.done).toBe(true);
    }
  });
});
