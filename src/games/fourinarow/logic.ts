// Four in a Row rules: pure and deterministic, so tests can run whole matches.
// The board is 7 columns × 6 rows; row 0 is the bottom (player 0's edge).
// A match is best of 3 games; the loser of a game starts the next one.
import { Energy } from '../../core/energy';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';

export const COLS = 7;
export const ROWS = 6;
export const EMPTY = -1;

export const RULES = {
  winsNeeded: 2,
  /** Games played before the match is called (draw games make this matter). */
  maxGames: 5,
  energyDrop: 0.11,
  energyLoseGame: 0.35,
  energyBlockThreat: 0.08,
};

export type Board = Int8Array;
export const idx = (c: number, r: number) => c * ROWS + r;

export type Move =
  | { kind: 'drop'; col: number; bomb?: boolean }
  | { kind: 'flip'; col: number; row: number }
  | { kind: 'block'; col: number };

export type Event =
  | { type: 'drop'; p: PlayerIndex; col: number; row: number; id: number; bomb: boolean; bombRow: number; cleared: number[] }
  | { type: 'flip'; p: PlayerIndex; col: number; row: number }
  | { type: 'block'; p: PlayerIndex; col: number }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'roundWin'; p: PlayerIndex; line: number[] }
  | { type: 'roundDraw' }
  | { type: 'matchOver'; winner: PlayerIndex | null };

// ---------- Pure board helpers (shared by the game and the bot) ----------

export function height(b: Board, c: number): number {
  for (let r = 0; r < ROWS; r++) if (b[idx(c, r)] === EMPTY) return r;
  return ROWS;
}

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

/** The four (or longer) line through (c, r) for player p, or null. */
export function lineThrough(b: Board, c: number, r: number, p: number): number[] | null {
  for (const [dc, dr] of DIRS) {
    const cells = [idx(c, r)];
    for (const s of [1, -1]) {
      let cc = c + dc * s;
      let rr = r + dr * s;
      while (cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS && b[idx(cc, rr)] === p) {
        cells.push(idx(cc, rr));
        cc += dc * s;
        rr += dr * s;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

/** Any four for player p anywhere on the board. */
export function findFour(b: Board, p: number): number[] | null {
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++) {
      if (b[idx(c, r)] !== p) continue;
      const l = lineThrough(b, c, r, p);
      if (l) return l;
    }
  return null;
}

/** Let every disc fall to the bottom of its column. ids (optional) move with them. */
export function collapse(b: Board, ids?: Int32Array): void {
  for (let c = 0; c < COLS; c++) {
    let w = 0;
    for (let r = 0; r < ROWS; r++) {
      const v = b[idx(c, r)];
      if (v === EMPTY) continue;
      if (w !== r) {
        b[idx(c, w)] = v;
        b[idx(c, r)] = EMPTY;
        if (ids) {
          ids[idx(c, w)] = ids[idx(c, r)];
          ids[idx(c, r)] = 0;
        }
      }
      w++;
    }
  }
}

/** The cells a bomb landing at (c, r) clears (only the occupied ones). */
export function bombCells(b: Board, c: number, r: number): number[] {
  const out: number[] = [];
  for (let dc = -1; dc <= 1; dc++)
    for (let dr = -1; dr <= 1; dr++) {
      const cc = c + dc;
      const rr = r + dr;
      if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
      if (b[idx(cc, rr)] !== EMPTY) out.push(idx(cc, rr));
    }
  return out;
}

/**
 * Drop a disc for p in column c (in place). With bomb, the disc first clears
 * the 3×3 around where it would land, everything falls, then the disc lands.
 * Returns the final row, or -1 when the column is full.
 */
export function dropInto(b: Board, c: number, p: number, bomb = false, ids?: Int32Array, id = 0): number {
  let r = height(b, c);
  if (r >= ROWS) return -1;
  if (bomb) {
    for (const i of bombCells(b, c, r)) {
      b[i] = EMPTY;
      if (ids) ids[i] = 0;
    }
    collapse(b, ids);
    r = height(b, c);
  }
  b[idx(c, r)] = p;
  if (ids) ids[idx(c, r)] = id;
  return r;
}

export function isFull(b: Board): boolean {
  for (let c = 0; c < COLS; c++) if (b[idx(c, ROWS - 1)] === EMPTY) return false;
  return true;
}

/** Columns where p dropping now makes four. */
export function winningCols(b: Board, p: number, cols: number[] = allCols()): number[] {
  const out: number[] = [];
  for (const c of cols) {
    const r = height(b, c);
    if (r >= ROWS) continue;
    b[idx(c, r)] = p;
    if (lineThrough(b, c, r, p)) out.push(c);
    b[idx(c, r)] = EMPTY;
  }
  return out;
}

const allCols = () => [0, 1, 2, 3, 4, 5, 6];

/** Would flipping (c, r) to p directly give p a four? Such flips are not allowed. */
export function flipMakesFour(b: Board, c: number, r: number, p: number): boolean {
  const old = b[idx(c, r)];
  b[idx(c, r)] = p;
  const l = lineThrough(b, c, r, p);
  b[idx(c, r)] = old;
  return !!l;
}

// ---------- The game ----------

export class FourInARow {
  board: Board = new Int8Array(COLS * ROWS).fill(EMPTY);
  /** Disc identity per cell, so the view can animate discs that move (bomb). */
  ids = new Int32Array(COLS * ROWS);
  turn: PlayerIndex;
  /** Who started the current game. */
  starter: PlayerIndex;
  /** Games won so far. */
  score: [number, number] = [0, 0];
  gamesPlayed = 0;
  /** Set when the current game is decided; the view calls nextRound() after a pause. */
  roundOver: { winner: PlayerIndex | null; line: number[] } | null = null;
  done = false;
  winner: PlayerIndex | null = null;
  energy: [Energy, Energy];
  /** Column the given player may not play on their next turn. */
  blocked: { col: number; p: PlayerIndex } | null = null;
  /** Block already used this turn (it is a free action, once). */
  private blockedThisTurn = false;
  /** Moves made this match (drops and flips). */
  moves = 0;
  events: Event[] = [];
  /**
   * The newest disc this game: who placed it and its cell (a drop's new disc, or the disc
   * a flip turned). The view rings it so the other player can see what changed. A block
   * places no disc, so it leaves this alone. Cleared when the next game starts.
   */
  last: { p: PlayerIndex; cell: number } | null = null;
  private nextId = 1;

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    readonly powersOn: boolean,
    rng: Rng,
  ) {
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    this.starter = rng.chance(0.5) ? 0 : 1;
    this.turn = this.starter;
  }

  powerOf(p: PlayerIndex): string | null {
    return this.powersOn ? (this.players[p].power?.id ?? null) : null;
  }

  canUsePower(p: PlayerIndex, id: string): boolean {
    return !this.roundOver && !this.done && this.turn === p && this.powerOf(p) === id && this.energy[p].ready && !(id === 'block' && this.blockedThisTurn);
  }

  /** Columns the player to move may drop into. */
  legalCols(p: PlayerIndex = this.turn): number[] {
    const open = allCols().filter((c) => height(this.board, c) < ROWS);
    const b = this.blocked;
    if (b && b.p === p) {
      const rest = open.filter((c) => c !== b.col);
      if (rest.length) return rest; // a block never leaves you with no move
    }
    return open;
  }

  /** Opponent discs the mover may flip (never one that completes a four outright). */
  flippable(p: PlayerIndex = this.turn): number[] {
    const out: number[] = [];
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) if (this.board[idx(c, r)] === other(p) && !flipMakesFour(this.board, c, r, p)) out.push(idx(c, r));
    return out;
  }

  /** Columns that can be blocked for the opponent (they must keep at least one other column). */
  blockable(): number[] {
    const open = allCols().filter((c) => height(this.board, c) < ROWS);
    return open.length >= 2 ? open : [];
  }

  apply(m: Move): boolean {
    this.events = [];
    if (this.done || this.roundOver) return false;
    const p = this.turn;
    if (m.kind === 'block') {
      if (!this.canUsePower(p, 'block') || !this.blockable().includes(m.col)) return false;
      this.energy[p].spend();
      this.blocked = { col: m.col, p: other(p) };
      this.blockedThisTurn = true;
      this.events.push({ type: 'power', p, id: 'block' }, { type: 'block', p, col: m.col });
      return true;
    }
    if (m.kind === 'flip') {
      if (!this.canUsePower(p, 'flip') || m.col < 0 || m.col >= COLS || m.row < 0 || m.row >= ROWS) return false;
      if (!this.flippable(p).includes(idx(m.col, m.row))) return false;
      this.energy[p].spend();
      this.board[idx(m.col, m.row)] = p;
      this.events.push({ type: 'power', p, id: 'flip' }, { type: 'flip', p, col: m.col, row: m.row });
      this.last = { p, cell: idx(m.col, m.row) };
      this.endTurn(p);
      return true;
    }
    // drop
    if (!this.legalCols(p).includes(m.col)) return false;
    const bomb = !!m.bomb;
    if (bomb && !this.canUsePower(p, 'bomb')) return false;
    const before = this.board.slice();
    const bombRow = height(this.board, m.col);
    const cleared = bomb ? bombCells(this.board, m.col, bombRow) : [];
    if (bomb) {
      this.energy[p].spend();
      this.events.push({ type: 'power', p, id: 'bomb' });
    }
    const id = this.nextId++;
    const row = dropInto(this.board, m.col, p, bomb, this.ids, id);
    this.events.push({ type: 'drop', p, col: m.col, row, id, bomb, bombRow, cleared });
    this.last = { p, cell: idx(m.col, row) };
    // Small energy reward for blocking an immediate threat.
    if (winningCols(before, other(p)).includes(m.col)) this.energy[p].charge(RULES.energyBlockThreat, this.score[p] < this.score[other(p)]);
    this.endTurn(p);
    return true;
  }

  private endTurn(p: PlayerIndex): void {
    this.moves++;
    this.energy[p].charge(RULES.energyDrop, this.score[p] < this.score[other(p)]);
    if (this.blocked && this.blocked.p === p) this.blocked = null;
    this.blockedThisTurn = false;
    const mine = findFour(this.board, p);
    const theirs = mine ? null : findFour(this.board, other(p));
    if (mine || theirs) {
      const w = mine ? p : other(p);
      this.finishRound(w, (mine ?? theirs)!);
      return;
    }
    if (isFull(this.board)) {
      this.finishRound(null, []);
      return;
    }
    this.turn = other(p);
  }

  private finishRound(w: PlayerIndex | null, line: number[]): void {
    this.gamesPlayed++;
    this.roundOver = { winner: w, line };
    this.blocked = null;
    if (w === null) this.events.push({ type: 'roundDraw' });
    else {
      this.score[w]++;
      this.events.push({ type: 'roundWin', p: w, line });
      this.energy[other(w)].charge(RULES.energyLoseGame, true);
    }
    if (w !== null && this.score[w] >= RULES.winsNeeded) {
      this.done = true;
      this.winner = w;
    } else if (this.gamesPlayed >= RULES.maxGames) {
      this.done = true;
      this.winner = this.score[0] === this.score[1] ? null : this.score[0] > this.score[1] ? 0 : 1;
    }
    if (this.done) this.events.push({ type: 'matchOver', winner: this.winner });
  }

  /** Start the next game: the loser starts (after a draw, the other player starts). */
  nextRound(): void {
    if (!this.roundOver || this.done) return;
    const w = this.roundOver.winner;
    this.starter = w === null ? other(this.starter) : other(w);
    this.turn = this.starter;
    this.board.fill(EMPTY);
    this.ids.fill(0);
    this.last = null;
    this.roundOver = null;
    this.events = [];
  }

  /**
   * Handicap hints for the player to move: columns that win now, columns that
   * block the opponent's immediate win (assist 2+), and columns that hand the
   * opponent a win right on top (assist 3).
   */
  hints(p: PlayerIndex): { win: number[]; block: number[]; avoid: number[] } {
    const a = this.players[p].assist;
    const none = { win: [], block: [], avoid: [] };
    if (a <= 0 || this.turn !== p || this.roundOver) return none;
    const legal = this.legalCols(p);
    const b = this.board.slice();
    const win = winningCols(b, p, legal);
    const block = a >= 2 ? winningCols(b, other(p), legal).filter((c) => !win.includes(c)) : [];
    const avoid: number[] = [];
    if (a >= 3)
      for (const c of legal) {
        if (win.includes(c) || block.includes(c)) continue;
        const r = height(b, c);
        if (r + 1 >= ROWS) continue;
        b[idx(c, r)] = p;
        if (winningCols(b, other(p), [c]).length) avoid.push(c);
        b[idx(c, r)] = EMPTY;
      }
    return { win, block, avoid };
  }
}

// ---------- Honest bot: negamax with alpha-beta ----------
// It sees exactly the board a person sees. Skill changes only search depth and noise.
const BOT = {
  easy: { depth: 2, noise: 60, blunder: 0.25 },
  normal: { depth: 4, noise: 12, blunder: 0.04 },
  hard: { depth: 6, noise: 0, blunder: 0 },
} satisfies Record<BotLevel, { depth: number; noise: number; blunder: number }>;

const ORDER = [3, 2, 4, 1, 5, 0, 6];
const WIN = 1_000_000;
/** Search budget per decision, so a move never takes long on a slow phone. */
const NODE_CAP = 60_000;

// All 69 four-cell windows, precomputed.
const WINDOWS: number[][] = (() => {
  const out: number[][] = [];
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      for (const [dc, dr] of DIRS) {
        const ec = c + dc * 3;
        const er = r + dr * 3;
        if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
        out.push([0, 1, 2, 3].map((k) => idx(c + dc * k, r + dr * k)));
      }
  return out;
})();

/** Static score of the board from p's point of view. */
export function evaluate(b: Board, p: number): number {
  let s = 0;
  const o = 1 - p;
  for (const w of WINDOWS) {
    let mine = 0;
    let theirs = 0;
    for (const i of w) {
      const v = b[i];
      if (v === p) mine++;
      else if (v === o) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 3) s += 50;
    else if (mine === 2) s += 6;
    else if (theirs === 3) s -= 55;
    else if (theirs === 2) s -= 6;
  }
  for (let r = 0; r < ROWS; r++) {
    const v = b[idx(3, r)];
    if (v === p) s += 4;
    else if (v === o) s -= 4;
  }
  return s;
}

export type BotChoice = { move: Move; bomb?: boolean; block?: number };

export class FourInARowBot {
  private nodes = 0;
  /** Turns the power has sat full; the bot gets less picky the longer it waits. */
  private fullFor = 0;

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  private negamax(b: Board, p: number, depth: number, alpha: number, beta: number, exclude = -1): number {
    this.nodes++;
    if (depth === 0 || this.nodes > NODE_CAP) return evaluate(b, p);
    let best = -Infinity;
    let any = false;
    for (const c of ORDER) {
      if (c === exclude) continue;
      const r = height(b, c);
      if (r >= ROWS) continue;
      any = true;
      b[idx(c, r)] = p;
      let v: number;
      if (lineThrough(b, c, r, p)) v = WIN + depth;
      else v = -this.negamax(b, 1 - p, depth - 1, -beta, -alpha);
      b[idx(c, r)] = EMPTY;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    if (!any) {
      // Only the excluded column was open: the block lifts; play it.
      if (exclude >= 0 && height(b, exclude) < ROWS) return this.negamax(b, p, depth, alpha, beta);
      return 0; // full board
    }
    return best;
  }

  /** Value for us after a position where the opponent moves next (optionally with a column blocked). */
  private after(b: Board, depth: number, exclude = -1): number {
    if (findFour(b, this.p)) return WIN + depth;
    if (findFour(b, 1 - this.p)) return -WIN - depth;
    if (isFull(b)) return 0;
    return -this.negamax(b, 1 - this.p, depth, -Infinity, Infinity, exclude);
  }

  /** The bot's whole turn: zero or more free actions (block) then one move. */
  choose(game: FourInARow): Move[] {
    const cfg = BOT[this.level];
    this.nodes = 0;
    const legal = game.legalCols(this.p);
    // Root alpha-beta: moves worse than the best so far only get an upper bound, which is all we need.
    let alpha = -Infinity;
    const scored = ORDER.filter((c) => legal.includes(c)).map((c) => {
      const b = game.board.slice();
      const r = dropInto(b, c, this.p);
      let v: number;
      if (lineThrough(b, c, r, this.p)) v = WIN + cfg.depth;
      else if (isFull(b)) v = 0;
      else v = -this.negamax(b, 1 - this.p, cfg.depth - 1, -Infinity, -alpha);
      if (v > alpha) alpha = v;
      return { c, v: v + (cfg.noise ? this.rng.range(-cfg.noise, cfg.noise) : 0) };
    });
    scored.sort((a, b) => b.v - a.v);
    let best = scored[0];
    if (cfg.blunder && this.rng.chance(cfg.blunder)) best = this.rng.pick(scored);
    const plain: Move[] = [{ kind: 'drop', col: best.c }];
    const pw = game.powerOf(this.p);
    if (!pw || !game.energy[this.p].ready) {
      this.fullFor = 0;
      return plain;
    }
    this.fullFor++;
    const d = Math.min(cfg.depth, 4);
    const base = (() => {
      const b = game.board.slice();
      dropInto(b, best.c, this.p);
      this.nodes = 0;
      return this.after(b, d - 1);
    })();
    let bestPower: { v: number; moves: Move[] } | null = null;
    const consider = (v: number, moves: Move[]) => {
      if (!bestPower || v > bestPower.v) bestPower = { v, moves };
    };
    if (pw === 'bomb' && game.canUsePower(this.p, 'bomb')) {
      for (const c of legal) {
        const b = game.board.slice();
        dropInto(b, c, this.p, true);
        this.nodes = 0;
        consider(this.after(b, d - 1), [{ kind: 'drop', col: c, bomb: true }]);
      }
    } else if (pw === 'flip' && game.canUsePower(this.p, 'flip')) {
      for (const i of game.flippable(this.p)) {
        const b = game.board.slice();
        b[i] = this.p;
        this.nodes = 0;
        consider(this.after(b, d - 1), [{ kind: 'flip', col: Math.floor(i / ROWS), row: i % ROWS }]);
      }
    } else if (pw === 'block' && game.canUsePower(this.p, 'block')) {
      for (const c of legal) {
        const b = game.board.slice();
        dropInto(b, c, this.p);
        for (const x of game.blockable()) {
          if (height(b, x) >= ROWS) continue;
          this.nodes = 0;
          consider(this.after(b, d - 1, x), [{ kind: 'block', col: x }, { kind: 'drop', col: c }]);
        }
      }
    }
    // Use the power when it clearly helps, or when it has been waiting a while.
    const need = this.fullFor > 6 ? 0 : 40;
    const bp = bestPower as { v: number; moves: Move[] } | null;
    if (bp && bp.v > base + need) {
      this.fullFor = 0;
      return bp.moves;
    }
    return plain;
  }
}
