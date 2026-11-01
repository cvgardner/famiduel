// Tic-Tac-Toe rules: pure and deterministic. A match is first to 3 game wins;
// draws do not count, and after 9 games whoever leads wins (or it is a draw).
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';

export const RULES = { winGames: 3, maxGames: 9 };

export const LINES: readonly [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/** Cell: -1 empty, else the player who marked it. X always goes first: whoever starts a game plays X. */
export type Board = number[];

export type Event =
  | { type: 'mark'; p: PlayerIndex; cell: number }
  | { type: 'gameWin'; p: PlayerIndex; line: [number, number, number] }
  | { type: 'gameDraw' }
  | { type: 'win'; p: PlayerIndex | null };

export function lineWinner(b: Board): { p: PlayerIndex; line: [number, number, number] } | null {
  for (const l of LINES) {
    const v = b[l[0]];
    if (v >= 0 && v === b[l[1]] && v === b[l[2]]) return { p: v as PlayerIndex, line: l };
  }
  return null;
}

export class TicTacToe {
  board: Board = Array(9).fill(-1);
  turn: PlayerIndex = 0;
  /** Game wins. */
  score: [number, number] = [0, 0];
  games = 0;
  /** Who started each game so far. */
  starters: PlayerIndex[] = [];
  /** True between games: the last game is over and the next has not started. */
  between = false;
  winLine: [number, number, number] | null = null;
  lastGameWinner: PlayerIndex | null = null;
  winner: PlayerIndex | null = null;
  done = false;
  events: Event[] = [];
  private readonly firstStarter: PlayerIndex;

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    rng: Rng,
  ) {
    this.firstStarter = rng.chance(0.5) ? 0 : 1;
    this.startGame();
  }

  /**
   * Who starts game n (0-based). Normally it alternates. Handicap: the more
   * assisted player starts 2 of every 3 games at assist 1, and every game at 2+.
   */
  starterFor(n: number): PlayerIndex {
    const a = this.players.map((pl) => Math.round(pl.assist));
    if (a[0] !== a[1]) {
      const helped: PlayerIndex = a[0] > a[1] ? 0 : 1;
      const lead = Math.abs(a[0] - a[1]);
      if (lead >= 2 || Math.max(a[0], a[1]) >= 2) return helped;
      return n % 3 === 2 ? other(helped) : helped;
    }
    return n % 2 === 0 ? this.firstStarter : other(this.firstStarter);
  }

  private startGame(): void {
    this.board = Array(9).fill(-1);
    this.turn = this.starterFor(this.games);
    this.starters.push(this.turn);
    this.between = false;
    this.winLine = null;
  }

  /** X always goes first, so the starter of the current game plays X. */
  isX(p: PlayerIndex): boolean {
    return this.starters[this.starters.length - 1] === p;
  }

  /** Start the next game after a finished one (the view waits for its animation first). */
  next(): void {
    if (this.between && !this.done) this.startGame();
  }

  legal(): number[] {
    if (this.between || this.done) return [];
    return this.board.flatMap((v, i) => (v < 0 ? [i] : []));
  }

  apply(cell: number): boolean {
    this.events = [];
    if (this.between || this.done || cell < 0 || cell > 8 || this.board[cell] >= 0) return false;
    const p = this.turn;
    this.board[cell] = p;
    this.events.push({ type: 'mark', p, cell });
    const w = lineWinner(this.board);
    if (w) {
      this.score[w.p]++;
      this.winLine = w.line;
      this.lastGameWinner = w.p;
      this.endGame();
      this.events.push({ type: 'gameWin', p: w.p, line: w.line });
    } else if (this.board.every((v) => v >= 0)) {
      this.lastGameWinner = null;
      this.endGame();
      this.events.push({ type: 'gameDraw' });
    } else this.turn = other(p);
    if (this.done) this.events.push({ type: 'win', p: this.winner });
    return true;
  }

  private endGame(): void {
    this.games++;
    this.between = true;
    const [a, b] = this.score;
    if (a >= RULES.winGames || b >= RULES.winGames || this.games >= RULES.maxGames) {
      this.done = true;
      this.winner = a > b ? 0 : b > a ? 1 : null;
    }
  }
}

// ---------- Bot ----------

/** Perfect play: +10 win, -10 loss, 0 draw, sooner wins score higher. */
export function minimax(b: Board, toMove: PlayerIndex, me: PlayerIndex, depth = 0): number {
  const w = lineWinner(b);
  if (w) return w.p === me ? 10 - depth : depth - 10;
  if (b.every((v) => v >= 0)) return 0;
  let best = toMove === me ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i] >= 0) continue;
    b[i] = toMove;
    const v = minimax(b, other(toMove), me, depth + 1);
    b[i] = -1;
    best = toMove === me ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

function completing(b: Board, p: PlayerIndex): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (b[i] >= 0) continue;
    b[i] = p;
    if (lineWinner(b)) out.push(i);
    b[i] = -1;
  }
  return out;
}

const BOT = {
  easy: { win: 0.5, block: 0.25, think: 0.7 },
  normal: { win: 1, block: 0.7, think: 0.55 },
  hard: { win: 1, block: 1, think: 0.5 },
} satisfies Record<BotLevel, { win: number; block: number; think: number }>;

export class TicTacToeBot {
  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  get thinkTime(): number {
    return BOT[this.level].think;
  }

  chooseMove(game: TicTacToe): number {
    const moves = game.legal();
    const b = [...game.board];
    if (this.level === 'hard') {
      // Perfect minimax, random among the equally best moves.
      let best = -Infinity;
      let picks: number[] = [];
      for (const i of moves) {
        b[i] = this.p;
        const v = minimax(b, other(this.p), this.p, 1);
        b[i] = -1;
        if (v > best) {
          best = v;
          picks = [i];
        } else if (v === best) picks.push(i);
      }
      return this.rng.pick(picks);
    }
    const cfg = BOT[this.level];
    const win = completing(b, this.p);
    if (win.length && this.rng.chance(cfg.win)) return this.rng.pick(win);
    const block = completing(b, other(this.p));
    if (block.length && this.rng.chance(cfg.block)) return this.rng.pick(block);
    if (this.level === 'normal') {
      // Sensible shape: centre, then corners, then edges.
      if (game.board[4] < 0 && this.rng.chance(0.7)) return 4;
      const corners = [0, 2, 6, 8].filter((i) => game.board[i] < 0);
      if (corners.length && this.rng.chance(0.6)) return this.rng.pick(corners);
    }
    return this.rng.pick(moves);
  }
}
