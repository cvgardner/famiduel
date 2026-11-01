// Checkers (English draughts) rules: pure and deterministic, so tests can run whole matches.
//
// Board: 8 × 8, squares 0..63 = row * 8 + col, row 0 at the top. Only dark squares
// ((row + col) odd) are used. Player 0 starts on rows 5–7 (bottom) and moves up,
// player 1 starts on rows 0–2 (top) and moves down.
//
// Rules (WCDF English draughts):
// - Men move one square diagonally forward; kings one square diagonally either way.
// - Captures are compulsory. A jump sequence must be completed (no stopping half-way),
//   but any complete sequence may be chosen (no "take the most" rule).
// - A jumped piece stays on the board until the move ends: it cannot be jumped twice
//   and nothing can land on its square.
// - A man reaching the far row is crowned; if that happens during a capture, the move ends.
// - A player with no legal move (no pieces, or all blocked) loses.
// - Draw: 40 moves each (80 plies) without a capture or a man move. Hard cap 400 plies.
import { lerpAssist } from '../../core/handicap';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';

export const RULES = {
  quietPliesDraw: 80,
  maxPlies: 400,
  /** Search depth used for the hint at assist 2 and 3 (no hint below 2). */
  hintDepth: [0, 0, 3, 5],
};

/** Cell values: 0 empty, 1 / 2 = player 0 man / king, -1 / -2 = player 1 man / king. */
export type Cells = Int8Array;

export type Move = {
  from: number;
  /** Landing squares in order; one entry for a simple move. */
  path: number[];
  /** Squares of the jumped pieces, in jump order. */
  caps: number[];
  /** The moving man is crowned at the end of this move. */
  crown: boolean;
};

export type Event =
  | { type: 'move'; p: PlayerIndex; move: Move; before: Cells }
  | { type: 'undo'; p: PlayerIndex }
  | { type: 'win'; p: PlayerIndex }
  | { type: 'draw' };

export const rowOf = (i: number) => i >> 3;
export const colOf = (i: number) => i & 7;
export const sq = (r: number, c: number) => r * 8 + c;
export const isDark = (r: number, c: number) => ((r + c) & 1) === 1;
export const ownerOfCell = (v: number): PlayerIndex | null => (v > 0 ? 0 : v < 0 ? 1 : null);
const forward = (p: PlayerIndex) => (p === 0 ? -1 : 1);
const crownRow = (p: PlayerIndex) => (p === 0 ? 0 : 7);

export function initialCells(): Cells {
  const b = new Int8Array(64);
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      if (!isDark(r, c)) continue;
      if (r <= 2) b[sq(r, c)] = -1;
      else if (r >= 5) b[sq(r, c)] = 1;
    }
  return b;
}

const DIRS: [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

function jumps(b: Cells, p: PlayerIndex, from: number, cur: number, king: boolean, path: number[], caps: number[], out: Move[]): void {
  const r = rowOf(cur);
  const c = colOf(cur);
  let found = false;
  for (const [dr, dc] of DIRS) {
    if (!king && dr !== forward(p)) continue;
    const mr = r + dr;
    const mc = c + dc;
    const lr = r + 2 * dr;
    const lc = c + 2 * dc;
    if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
    const mid = sq(mr, mc);
    const land = sq(lr, lc);
    const mv = b[mid];
    if (mv === 0 || ownerOfCell(mv) === p || caps.includes(mid)) continue;
    if (b[land] !== 0) continue; // the origin is vacated by the caller
    found = true;
    const np = [...path, land];
    const nc = [...caps, mid];
    if (!king && lr === crownRow(p)) out.push({ from, path: np, caps: nc, crown: true });
    else jumps(b, p, from, land, king, np, nc, out);
  }
  if (!found && caps.length > 0) out.push({ from, path, caps, crown: false });
}

/** Every legal move for player p. Captures only, when any capture exists. */
export function legalMoves(b: Cells, p: PlayerIndex): Move[] {
  const caps: Move[] = [];
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (v === 0 || ownerOfCell(v) !== p) continue;
    b[i] = 0;
    jumps(b, p, i, i, Math.abs(v) === 2, [], [], caps);
    b[i] = v;
  }
  if (caps.length) return caps;
  const out: Move[] = [];
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (v === 0 || ownerOfCell(v) !== p) continue;
    const king = Math.abs(v) === 2;
    const r = rowOf(i);
    const c = colOf(i);
    for (const [dr, dc] of DIRS) {
      if (!king && dr !== forward(p)) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      const to = sq(nr, nc);
      if (b[to] !== 0) continue;
      out.push({ from: i, path: [to], caps: [], crown: !king && nr === crownRow(p) });
    }
  }
  return out;
}

export function applyTo(b: Cells, m: Move): Cells {
  const n = b.slice();
  const v = n[m.from];
  n[m.from] = 0;
  for (const c of m.caps) n[c] = 0;
  n[m.path[m.path.length - 1]] = m.crown ? (v > 0 ? 2 : -2) : v;
  return n;
}

export function countPieces(b: Cells, p: PlayerIndex): { men: number; kings: number } {
  let men = 0;
  let kings = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (v === 0 || ownerOfCell(v) !== p) continue;
    if (Math.abs(v) === 2) kings++;
    else men++;
  }
  return { men, kings };
}

/**
 * What the board keeps showing about a move once it has played: every square the piece
 * stood on (its start and each landing, in order) and the squares of the pieces it took.
 * A multi-jump shows its whole path, not just where it started and ended.
 */
export function moveTrail(m: Move): { trail: number[]; taken: number[] } {
  return { trail: [m.from, ...m.path], taken: [...m.caps] };
}

type Snapshot = { cells: Cells; turn: PlayerIndex; quiet: number; ply: number; mover: PlayerIndex };

export class Checkers {
  cells: Cells = initialCells();
  turn: PlayerIndex;
  winner: PlayerIndex | null = null;
  done = false;
  /** Pieces captured by each player. */
  score: [number, number] = [0, 0];
  quiet = 0;
  ply = 0;
  events: Event[] = [];
  /** Undo uses left for each player (= assist level). */
  undos: [number, number];
  lastMove: Move | null = null;
  /** Who moved first this match. */
  readonly starter: PlayerIndex;
  private history: Snapshot[] = [];
  private moves: Move[] | null = null;

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    rng: Rng,
    starter?: PlayerIndex,
  ) {
    const coin: PlayerIndex = rng.chance(0.5) ? 0 : 1;
    this.turn = starter ?? coin;
    this.starter = this.turn;
    this.undos = [Math.round(lerpAssist(players[0].assist, 0, 3)), Math.round(lerpAssist(players[1].assist, 0, 3))];
  }

  legal(): Move[] {
    if (this.done) return [];
    if (!this.moves) this.moves = legalMoves(this.cells, this.turn);
    return this.moves;
  }

  /** Squares whose pieces may move this turn (all of them are capturers when a capture is forced). */
  movable(): Set<number> {
    return new Set(this.legal().map((m) => m.from));
  }

  mustCapture(): boolean {
    const l = this.legal();
    return l.length > 0 && l[0].caps.length > 0;
  }

  /** Apply a full legal move. Returns false (and does nothing) for an illegal one. */
  apply(m: Move): boolean {
    this.events = [];
    if (this.done) return false;
    const legal = this.legal().find((x) => x.from === m.from && x.path.length === m.path.length && x.path.every((s, i) => s === m.path[i]));
    if (!legal) return false;
    const p = this.turn;
    const before = this.cells;
    this.history.push({ cells: before, turn: p, quiet: this.quiet, ply: this.ply, mover: p });
    const wasMan = Math.abs(before[legal.from]) === 1;
    this.cells = applyTo(before, legal);
    this.score[p] += legal.caps.length;
    this.quiet = legal.caps.length || wasMan ? 0 : this.quiet + 1;
    this.ply++;
    this.lastMove = legal;
    this.turn = other(p);
    this.moves = null;
    this.events.push({ type: 'move', p, move: legal, before });
    if (this.legal().length === 0) this.finish(p);
    else if (this.quiet >= RULES.quietPliesDraw || this.ply >= RULES.maxPlies) this.finish(null);
    return true;
  }

  /** Can p undo their own last move right now? */
  canUndo(p: PlayerIndex): boolean {
    return !this.done && this.undos[p] > 0 && this.history.some((h) => h.mover === p);
  }

  /** Take back p's last move (and any reply made since). Uses one undo. */
  undo(p: PlayerIndex): boolean {
    this.events = [];
    if (!this.canUndo(p)) return false;
    let snap = this.history.pop()!;
    while (snap.mover !== p) snap = this.history.pop()!;
    this.cells = snap.cells;
    this.turn = snap.turn;
    this.quiet = snap.quiet;
    this.ply = snap.ply;
    this.moves = null;
    this.lastMove = null;
    this.undos[p]--;
    // Recount captures from the restored position.
    for (const q of [0, 1] as PlayerIndex[]) {
      const left = countPieces(this.cells, other(q));
      this.score[q] = 12 - left.men - left.kings;
    }
    this.events.push({ type: 'undo', p });
    return true;
  }

  /** Best move for the side to move by a quick search; used for the assisted player's hint. */
  hint(p: PlayerIndex): Move | null {
    const depth = RULES.hintDepth[Math.max(0, Math.min(3, Math.round(this.players[p].assist)))];
    if (!depth || this.turn !== p || this.done) return null;
    return search(this.cells, p, depth, 0, null, 20000);
  }

  private finish(w: PlayerIndex | null): void {
    this.done = true;
    this.winner = w;
    this.events.push(w === null ? { type: 'draw' } : { type: 'win', p: w });
  }
}

// ---------- Search (shared by the bot and the hint) ----------

const WIN = 100000;

/** Static evaluation from p's point of view. */
export function evaluate(b: Cells, p: PlayerIndex): number {
  let s = 0;
  let mine = 0;
  let theirs = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (v === 0) continue;
    const o = ownerOfCell(v)!;
    const r = rowOf(i);
    const c = colOf(i);
    let val: number;
    if (Math.abs(v) === 2) {
      val = 165 + (3.5 - Math.abs(3.5 - c)) * 2 + (3.5 - Math.abs(3.5 - r)) * 2;
    } else {
      const adv = o === 0 ? 7 - r : r; // rows advanced, 0..6
      val = 100 + adv * 3 + (c >= 2 && c <= 5 ? 4 : 0) + (adv === 0 ? 6 : 0);
    }
    if (o === p) {
      s += val;
      mine++;
    } else {
      s -= val;
      theirs++;
    }
  }
  // When ahead, trade down: fewer pieces left on the board makes a lead bigger.
  if (mine !== theirs) s += (mine > theirs ? 1 : -1) * (24 - mine - theirs) * 3;
  return s;
}

type SearchCtx = { nodes: number; limit: number };

function negamax(b: Cells, p: PlayerIndex, depth: number, alpha: number, beta: number, ply: number, sc: SearchCtx): number {
  sc.nodes++;
  const moves = legalMoves(b, p);
  if (moves.length === 0) return -WIN + ply;
  // Capture extension: never stop the search in the middle of an exchange.
  if ((depth <= 0 && (moves[0].caps.length === 0 || depth <= -4)) || sc.nodes > sc.limit) return evaluate(b, p);
  // Order: longer captures, then crowning, first.
  moves.sort((a, m) => m.caps.length - a.caps.length || Number(m.crown) - Number(a.crown));
  let best = -Infinity;
  for (const m of moves) {
    const v = -negamax(applyTo(b, m), other(p), depth - 1, -beta, -alpha, ply + 1, sc);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Alpha-beta search to `depth` plies. `noise` adds a random amount to each root
 * move's score (a weaker player misjudges), using the rng so it stays seeded.
 * The node limit keeps every move fast on a phone.
 */
export function search(b: Cells, p: PlayerIndex, depth: number, noise: number, rng: Rng | null, nodeLimit: number): Move | null {
  const moves = legalMoves(b, p);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];
  const jitter = moves.map(() => (noise && rng ? rng.range(-noise, noise) : 0));
  // Iterative deepening: keep the best move of the deepest search that finished
  // inside the node budget, so a cut-off search never biases the choice.
  const sc: SearchCtx = { nodes: 0, limit: nodeLimit };
  let best = moves[0];
  for (let d = 1; d <= depth; d++) {
    let bestV = -Infinity;
    let pick = moves[0];
    for (let i = 0; i < moves.length; i++) {
      const v = -negamax(applyTo(b, moves[i]), other(p), d - 1, -Infinity, Infinity, 1, sc) + jitter[i];
      if (v > bestV) {
        bestV = v;
        pick = moves[i];
      }
    }
    if (sc.nodes > sc.limit && d > 1) break;
    best = pick;
    if (bestV > WIN / 2) break; // found a forced win
  }
  return best;
}

// ---------- Honest bot ----------
// Same rules as a person. Skill changes only search depth, judging noise and
// how often it plays a careless move.
export const BOT = {
  easy: { depth: 2, noise: 70, careless: 0.25, nodes: 3000, think: 0.7 },
  normal: { depth: 4, noise: 12, careless: 0, nodes: 12000, think: 0.6 },
  hard: { depth: 7, noise: 0, careless: 0, nodes: 40000, think: 0.6 },
} satisfies Record<BotLevel, { depth: number; noise: number; careless: number; nodes: number; think: number }>;

export class CheckersBot {
  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  /** Seconds the bot "thinks" before moving, so people can follow the game. */
  get thinkTime(): number {
    return BOT[this.level].think;
  }

  chooseMove(game: Checkers): Move | null {
    const cfg = BOT[this.level];
    const moves = game.legal();
    if (!moves.length) return null;
    if (cfg.careless && this.rng.chance(cfg.careless)) return this.rng.pick(moves);
    return search(game.cells, this.p, cfg.depth, cfg.noise, this.rng, cfg.nodes);
  }
}
