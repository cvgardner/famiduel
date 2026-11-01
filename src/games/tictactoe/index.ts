// Tic-Tac-Toe view: tap a square. Big hand-drawn X and O, first to 3 games.
import { PLAYERS, other, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, noGlow, rrect, text, type G } from '../../engine/draw';
import type { GameContext, GameDef, GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { H, MID, W } from '../../engine/world';
import { RULES, TicTacToe, TicTacToeBot } from './logic';

const CELL = 90;
const GX = W / 2 - CELL * 1.5;
const GY = MID - CELL * 1.5;
const MARK_T = 0.28;
const LINE_T = 0.35;
const BETWEEN = 1.5;

const ccx = (i: number) => GX + (i % 3) * CELL + CELL / 2;
const ccy = (i: number) => GY + Math.floor(i / 3) * CELL + CELL / 2;
const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

class TicTacToeView implements GameInstance {
  readonly game: TicTacToe;
  private bots: (TicTacToeBot | null)[];
  private t = 0;
  private markAt: number[] = Array(9).fill(-1);
  private wobble: number[] = Array(9).fill(0);
  private botWait = 0;
  private betweenT = 0;
  private lineAt = -1;
  private ended = false;
  private banner: { str: string; t: number } | null = null;

  constructor(private readonly ctx: GameContext) {
    this.game = new TicTacToe(ctx.players, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new TicTacToeBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.announceStart();
  }

  private color(p: PlayerIndex): string {
    return this.ctx.players[p].color;
  }

  private announceStart(): void {
    const g = this.game;
    this.banner = { str: `Game ${g.games + 1}`, t: this.t };
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    if (g.between) {
      this.betweenT += dt;
      if (g.done) {
        if (!this.ended && this.betweenT > LINE_T + 0.4) this.finish();
        return;
      }
      if (this.betweenT >= BETWEEN) {
        g.next();
        this.markAt.fill(-1);
        this.lineAt = -1;
        this.botWait = 0;
        this.announceStart();
        this.ctx.sfx.play('whoosh');
      }
      return;
    }
    const p = g.turn;
    const bot = this.bots[p];
    if (bot) {
      this.botWait += dt;
      if (this.botWait >= bot.thinkTime) {
        this.botWait = 0;
        this.mark(bot.chooseMove(g));
      }
      return;
    }
    const tap = input.all().find((f) => f.pressed);
    if (!tap) return;
    const c = Math.floor((tap.x - GX) / CELL);
    const r = Math.floor((tap.y - GY) / CELL);
    if (c < 0 || c > 2 || r < 0 || r > 2) return;
    const cell = r * 3 + c;
    if (g.board[cell] >= 0) {
      this.ctx.sfx.play('buzz');
      this.wobble[cell] = 0.3;
      return;
    }
    this.mark(cell);
  }

  private mark(cell: number): void {
    const g = this.game;
    if (!g.apply(cell)) return;
    const { sfx, fx } = this.ctx;
    for (const e of g.events) {
      if (e.type === 'mark') {
        this.markAt[e.cell] = this.t;
        sfx.play(e.p === 0 ? 'tap' : 'pop');
        fx.burst(ccx(e.cell), ccy(e.cell), this.color(e.p), 8, 120, 3);
      } else if (e.type === 'gameWin') {
        this.lineAt = this.t + MARK_T * 0.8;
        this.betweenT = 0;
        sfx.play('score');
        fx.shake(6, 0.25);
        for (const i of e.line) fx.burst(ccx(i), ccy(i), this.color(e.p), 22, 240, 4);
        const loser = other(e.p);
        fx.pop('Three in a row!', W / 2, e.p === 0 ? MID + 190 : MID - 190, COLORS.gold, e.p, 26);
        fx.pop(`Game to ${this.ctx.players[e.p].name}`, W / 2, loser === 0 ? MID + 190 : MID - 190, '#fff', loser, 22);
      } else if (e.type === 'gameDraw') {
        this.betweenT = 0;
        sfx.play('bounce');
        for (const p of PLAYERS) fx.pop("Draw! It doesn't count", W / 2, p === 0 ? MID + 190 : MID - 190, '#fff', p, 22);
      }
    }
  }

  private finish(): void {
    this.ended = true;
    const g = this.game;
    const { fx, sfx } = this.ctx;
    const score = [...g.score] as [number, number];
    if (g.winner === null) {
      sfx.play('buzz');
      this.ctx.end({ winner: null, score, summary: `${score[0]} – ${score[1]} after ${g.games} games` });
      return;
    }
    const w = g.winner;
    sfx.play('win');
    fx.flash(this.color(w), 0.25);
    for (let i = 0; i < 6; i++) fx.burst(40 + i * 56, w === 0 ? H - 90 : 90, this.color(w), 18, 260, 4);
    fx.pop('Champion!', W / 2, w === 0 ? MID + 230 : MID - 230, COLORS.gold, w, 34);
    this.ctx.end({ winner: w, score, summary: `${score[0]} – ${score[1]} in games` });
  }

  // ---------- Drawing ----------

  render(gx: G): void {
    const g = this.game;
    const [c0, c1] = [this.color(0), this.color(1)];
    gx.fillStyle = '#1b1838';
    gx.fillRect(0, 0, W, H);
    const tint = gx.createLinearGradient(0, 0, 0, H);
    tint.addColorStop(0, alpha(c1, 0.25));
    tint.addColorStop(0.5, 'rgba(0,0,0,0)');
    tint.addColorStop(1, alpha(c0, 0.25));
    gx.fillStyle = tint;
    gx.fillRect(0, 0, W, H);
    // Paper card + grid
    rrect(gx, GX - 14, GY - 14, CELL * 3 + 28, CELL * 3 + 28, 22, '#fffaf0', 'rgba(0,0,0,0.2)', 3);
    gx.lineCap = 'round';
    gx.strokeStyle = '#c9bfae';
    gx.lineWidth = 6;
    for (let k = 1; k <= 2; k++) {
      gx.beginPath();
      gx.moveTo(GX + k * CELL, GY + 8);
      gx.lineTo(GX + k * CELL, GY + CELL * 3 - 8);
      gx.moveTo(GX + 8, GY + k * CELL);
      gx.lineTo(GX + CELL * 3 - 8, GY + k * CELL);
      gx.stroke();
    }
    // Ghost mark under the cursor-less phone: show whose mark goes next faintly in empty cells.
    if (!g.between && !g.done && !this.bots[g.turn]) {
      for (let i = 0; i < 9; i++) if (g.board[i] < 0) circle(gx, ccx(i), ccy(i), 5 + Math.sin(this.t * 4 + i) * 1.5, alpha(this.color(g.turn), 0.35));
    }
    for (let i = 0; i < 9; i++) {
      const v = g.board[i];
      if (v < 0) continue;
      this.wobble[i] = Math.max(0, this.wobble[i] - 1 / 60);
      const k = this.markAt[i] < 0 ? 1 : (this.t - this.markAt[i]) / MARK_T;
      const win = g.winLine?.includes(i) && this.lineAt >= 0 && this.t > this.lineAt;
      const bounce = win ? 1 + 0.08 * Math.sin((this.t - this.lineAt) * 12) * Math.exp(-(this.t - this.lineAt) * 2) : 1;
      this.drawMark(gx, i, v as PlayerIndex, ease(k), bounce);
    }
    // Winning line
    if (g.winLine && this.lineAt >= 0 && this.t > this.lineAt) {
      const k = ease((this.t - this.lineAt) / LINE_T);
      const [a, , b] = g.winLine;
      const x0 = ccx(a);
      const y0 = ccy(a);
      const dx = ccx(b) - x0;
      const dy = ccy(b) - y0;
      const ext = 0.22;
      const sx = x0 - dx * ext;
      const sy = y0 - dy * ext;
      glow(gx, COLORS.gold, 18);
      gx.beginPath();
      gx.moveTo(sx, sy);
      gx.lineTo(sx + dx * (1 + 2 * ext) * k, sy + dy * (1 + 2 * ext) * k);
      gx.strokeStyle = COLORS.gold;
      gx.lineWidth = 10;
      gx.lineCap = 'round';
      gx.stroke();
      noGlow(gx);
    }
    for (const p of PLAYERS) facing(gx, p, W / 2, MID, () => this.drawHud(gx, p));
    // "Game n" banner, readable from both seats.
    if (this.banner) {
      const age = this.t - this.banner.t;
      if (age > 1.1) this.banner = null;
      else {
        const a = Math.min(1, (1.1 - age) * 3);
        const s = 1 + 0.25 * Math.max(0, 1 - age * 5);
        gx.globalAlpha = a * 0.92;
        rrect(gx, GX - 14, MID - 50, CELL * 3 + 28, 100, 16, '#1b1838');
        gx.globalAlpha = 1;
        text(gx, this.banner.str, W / 2, MID - 22, { size: 30 * s, color: '#fff', player: 1, alpha: a });
        text(gx, this.banner.str, W / 2, MID + 22, { size: 30 * s, color: '#fff', player: 0, alpha: a });
      }
    }
  }

  private drawMark(gx: G, i: number, p: PlayerIndex, k: number, scale: number): void {
    const x = ccx(i) + Math.sin(this.wobble[i] * 60) * this.wobble[i] * 10;
    const y = ccy(i);
    const s = CELL * 0.3 * scale;
    const c = this.color(p);
    gx.lineCap = 'round';
    gx.lineJoin = 'round';
    gx.lineWidth = 13;
    gx.strokeStyle = c;
    if (this.game.isX(p)) {
      // X: two strokes, the second starts when the first is half done.
      const k1 = Math.min(1, k * 1.6);
      const k2 = Math.max(0, (k - 0.4) / 0.6);
      gx.beginPath();
      gx.moveTo(x - s, y - s);
      gx.lineTo(x - s + 2 * s * k1, y - s + 2 * s * k1);
      if (k2 > 0) {
        gx.moveTo(x + s, y - s);
        gx.lineTo(x + s - 2 * s * k2, y - s + 2 * s * k2);
      }
      gx.stroke();
    } else {
      gx.beginPath();
      gx.arc(x, y, s * 1.05, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      gx.stroke();
    }
  }

  /** One player's panel in player 0's coordinates; rotated for player 1. */
  private drawHud(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const c = this.color(p);
    const top = GY + CELL * 3 + 42;
    const mine = !g.done && !g.between && g.turn === p;
    // Name and mark
    text(gx, `${g.isX(p) ? '✕' : '◯'}  ${this.ctx.players[p].name}${this.bots[p] ? ' 🤖' : ''}`, W / 2, top, { size: 18, color: c });
    // Game wins as three pips
    for (let i = 0; i < RULES.winGames; i++) {
      const x = W / 2 + (i - 1) * 40;
      const on = i < g.score[p];
      if (on) glow(gx, COLORS.gold, 10);
      circle(gx, x, top + 36, 13, on ? COLORS.gold : 'rgba(255,255,255,0.08)', on ? '#fff3b0' : 'rgba(255,255,255,0.25)', 2);
      noGlow(gx);
      if (on) text(gx, '★', x, top + 37, { size: 14, color: '#7a5600' });
    }
    // Turn pill
    const py = H - 50;
    const pw = 200;
    if (mine) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
      glow(gx, c, 10 + 10 * pulse);
      rrect(gx, W / 2 - pw / 2, py - 22, pw, 44, 22, c);
      noGlow(gx);
      text(gx, this.bots[p] ? 'Thinking…' : g.starters[g.starters.length - 1] === p && g.board.every((v) => v < 0) ? 'You start!' : 'Your turn!', W / 2, py, { size: 20, color: '#fff', stroke: 'rgba(0,0,0,0.25)' });
    } else {
      rrect(gx, W / 2 - pw / 2, py - 20, pw, 40, 20, 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.15)', 2);
      const msg = g.done ? (g.winner === p ? 'Champion!' : g.winner === null ? 'Draw' : 'Good game') : g.between ? `Game ${g.games} done` : 'Waiting…';
      text(gx, msg, W / 2, py, { size: 17, color: COLORS.dim, weight: 700 });
    }
  }
}

const def: GameDef = { id: 'tictactoe', create: (ctx) => new TicTacToeView(ctx) };
export default def;
