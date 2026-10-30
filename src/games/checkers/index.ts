// Checkers view: tap a piece, tap where it goes. Bots and the hint use the same search.
import { PLAYERS, other, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, line, noGlow, rrect, shade, text, type G } from '../../engine/draw';
import type { GameContext, GameDef, GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { Button } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { Checkers, CheckersBot, colOf, isDark, ownerOfCell, rowOf, type Cells, type Move } from './logic';

// Board geometry. The board is nudged right so the DOM pause button (left edge,
// vertically centred) never covers a playable square.
const SQ = 39;
const BX = 40;
const BY = MID - SQ * 4;
const HOP = 0.15;

const cx = (i: number) => BX + colOf(i) * SQ + SQ / 2;
const cy = (i: number) => BY + rowOf(i) * SQ + SQ / 2;

function squareAt(x: number, y: number): number | null {
  const c = Math.floor((x - BX) / SQ);
  const r = Math.floor((y - BY) / SQ);
  if (c < 0 || c > 7 || r < 0 || r > 7 || !isDark(r, c)) return null;
  return r * 8 + c;
}

type Anim = { move: Move; before: Cells; p: PlayerIndex; t: number; hopsDone: number };

class CheckersView implements GameInstance {
  readonly game: Checkers;
  private bots: (CheckersBot | null)[];
  private undoBtns: (Button | null)[];
  private t = 0;
  private sel: { from: number; path: number[] } | null = null;
  private anim: Anim | null = null;
  private botWait = 0;
  private idle = 0;
  private hint: { key: string; move: Move | null } | null = null;
  private ended = false;
  private warn = 0;

  constructor(private readonly ctx: GameContext) {
    this.game = new Checkers(ctx.players, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new CheckersBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.undoBtns = PLAYERS.map((p) => {
      if (ctx.players[p].bot || this.game.undos[p] <= 0) return null;
      return p === 0 ? new Button(W - 44, H - 48, 26, 0, '↶', ctx.players[0].color) : new Button(44, 48, 26, 1, '↶', ctx.players[1].color);
    });
  }

  private color(p: PlayerIndex): string {
    return this.ctx.players[p].color;
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    this.warn = Math.max(0, this.warn - dt);
    const g = this.game;
    if (this.anim) {
      this.stepAnim(dt);
      return;
    }
    if (g.done) {
      this.finish();
      return;
    }
    // Undo buttons (assisted human players only).
    for (const p of PLAYERS) {
      const btn = this.undoBtns[p];
      if (!btn) continue;
      // Read the tap directly: a very quick tap can land and lift inside one frame.
      const tapped = input.of(p).some((f) => f.pressed && btn.hit(f.x, f.y));
      if (tapped && g.undo(p)) {
        this.sel = null;
        this.botWait = 0;
        this.idle = 0;
        this.hint = null;
        this.ctx.sfx.play('whoosh');
        this.ctx.fx.pop('Undo!', W / 2, p === 0 ? MID + 200 : MID - 200, COLORS.gold, p, 26);
        return;
      }
    }
    const p = g.turn;
    const bot = this.bots[p];
    if (bot) {
      this.botWait += dt;
      if (this.botWait >= bot.thinkTime) {
        this.botWait = 0;
        const m = bot.chooseMove(g);
        if (m) this.play(m);
      }
      return;
    }
    this.idle += dt;
    const tap = input.all().find((f) => f.pressed);
    if (tap) this.tap(tap.x, tap.y);
  }

  private tap(x: number, y: number): void {
    const g = this.game;
    const p = g.turn;
    const s = squareAt(x, y);
    if (s === null) {
      if (this.sel && this.sel.path.length === 0) this.sel = null;
      return;
    }
    const legal = g.legal();
    if (this.sel) {
      const { from, path } = this.sel;
      const cands = legal.filter((m) => m.from === from && path.every((q, i) => m.path[i] === q));
      const next = cands.filter((m) => m.path[path.length] === s);
      if (next.length) {
        const np = [...path, s];
        const full = next.find((m) => m.path.length === np.length);
        this.ctx.sfx.play(next[0].caps.length ? 'pop' : 'tap');
        if (full) {
          this.sel = null;
          this.play(full);
        } else {
          // Part-way through a multi-jump: show the capture so far and keep going.
          const jumped = next[0].caps[path.length];
          this.ctx.fx.burst(cx(jumped), cy(jumped), this.color(other(p)), 10, 160, 3);
          this.sel = { from, path: np };
        }
        return;
      }
      if (path.length) {
        // Mid-jump: only the piece's origin cancels (the move is not made yet).
        if (s === from) this.sel = null;
        else this.nudge('Keep jumping!');
        return;
      }
    }
    const v = g.cells[s];
    if (v !== 0 && ownerOfCell(v) === p) {
      if (g.movable().has(s)) {
        this.sel = this.sel?.from === s ? null : { from: s, path: [] };
        this.ctx.sfx.play('click');
      } else this.nudge(g.mustCapture() ? 'You must jump!' : "That one can't move");
      return;
    }
    this.sel = null;
  }

  private nudge(msg: string): void {
    if (this.warn > 0) return;
    this.warn = 0.9;
    const p = this.game.turn;
    this.ctx.sfx.play('buzz');
    this.ctx.fx.pop(msg, W / 2, p === 0 ? MID + 196 : MID - 196, COLORS.bad, p, 22);
  }

  private play(m: Move): void {
    const g = this.game;
    const p = g.turn;
    if (!g.apply(m)) return;
    const ev = g.events.find((e) => e.type === 'move');
    if (ev && ev.type === 'move') this.anim = { move: ev.move, before: ev.before, p, t: 0, hopsDone: 0 };
    this.sel = null;
    this.idle = 0;
    this.hint = null;
    this.ctx.sfx.play('thud');
  }

  private stepAnim(dt: number): void {
    const a = this.anim!;
    a.t += dt;
    const { fx, sfx } = this.ctx;
    while (a.hopsDone < a.move.path.length && a.t >= (a.hopsDone + 1) * HOP) {
      const i = a.hopsDone++;
      const land = a.move.path[i];
      if (a.move.caps.length) {
        const c = a.move.caps[i];
        sfx.play('hit');
        fx.burst(cx(c), cy(c), this.color(other(a.p)), 18, 220, 4);
        fx.shake(3 + i * 2, 0.15);
        if (i > 0) fx.pop(i === 1 ? 'Double!' : i === 2 ? 'Triple!' : 'Mega jump!', cx(land), cy(land) + (a.p === 0 ? -26 : 26), COLORS.gold, a.p, 22 + i * 2);
      } else sfx.play('click');
    }
    if (a.t >= a.move.path.length * HOP + 0.08) {
      const land = a.move.path[a.move.path.length - 1];
      if (a.move.crown) {
        sfx.play('coin');
        fx.burst(cx(land), cy(land), COLORS.gold, 26, 200, 4);
        fx.pop('KING!', cx(land), cy(land) + (a.p === 0 ? -30 : 30), COLORS.gold, a.p, 28);
      }
      this.anim = null;
      if (this.game.done) this.finish();
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const g = this.game;
    const { fx, sfx } = this.ctx;
    const score = [...g.score] as [number, number];
    if (g.winner === null) {
      sfx.play('buzz');
      for (const p of PLAYERS) fx.pop('Draw!', W / 2, p === 0 ? MID + 200 : MID - 200, COLORS.gold, p, 34);
      this.ctx.end({ winner: null, score, summary: `Draw · ${score[0]} – ${score[1]} taken` });
      return;
    }
    const w = g.winner;
    sfx.play('win');
    fx.flash(this.color(w), 0.25);
    fx.shake(8, 0.3);
    for (let i = 0; i < 64; i++) if (g.cells[i] !== 0 && ownerOfCell(g.cells[i]) === w) fx.burst(cx(i), cy(i), this.color(w), 10, 200, 4);
    fx.pop('You win!', W / 2, w === 0 ? MID + 200 : MID - 200, COLORS.gold, w, 34);
    fx.pop('Good game!', W / 2, w === 0 ? MID - 200 : MID + 200, '#fff', other(w), 26);
    this.ctx.end({ winner: w, score, summary: `${score[0]} – ${score[1]} pieces taken` });
  }

  private currentHint(): Move | null {
    const g = this.game;
    const p = g.turn;
    if (g.done || this.bots[p] || this.anim || this.idle < 1.2 || this.sel) return null;
    const key = `${g.ply}:${p}:${g.undos.join()}`;
    if (this.hint?.key !== key) this.hint = { key, move: g.hint(p) };
    return this.hint.move;
  }

  // ---------- Drawing ----------

  render(gx: G): void {
    const g = this.game;
    const [c0, c1] = [this.color(0), this.color(1)];
    // Table
    gx.fillStyle = '#2a1f3d';
    gx.fillRect(0, 0, W, H);
    const tint = gx.createLinearGradient(0, 0, 0, H);
    tint.addColorStop(0, alpha(c1, 0.22));
    tint.addColorStop(0.5, 'rgba(0,0,0,0)');
    tint.addColorStop(1, alpha(c0, 0.22));
    gx.fillStyle = tint;
    gx.fillRect(0, 0, W, H);
    this.drawBoard(gx);
    for (const p of PLAYERS) facing(gx, p, W / 2, MID, () => this.drawHud(gx, p));
    for (const p of PLAYERS) {
      const btn = this.undoBtns[p];
      if (!btn || g.undos[p] <= 0) continue;
      const can = g.canUndo(p) && !this.anim;
      btn.render(gx, { disabled: !can });
      text(gx, `×${g.undos[p]}`, btn.x + (p === 0 ? -1 : 1) * 40, btn.y, { size: 14, player: p, color: COLORS.dim });
    }
  }

  private drawBoard(gx: G): void {
    const g = this.game;
    const mover = g.turn;
    // Frame, glowing on the side of whoever moves.
    const fr = 7;
    rrect(gx, BX - fr, BY - fr, SQ * 8 + fr * 2, SQ * 8 + fr * 2, 10, '#5b3a22', '#3b2414', 3);
    if (!g.done) {
      const pulse = 0.55 + 0.45 * Math.sin(this.t * 4);
      glow(gx, this.color(mover), 14 * pulse);
      const y = mover === 0 ? BY + SQ * 8 + 2 : BY - fr + 1;
      rrect(gx, BX, y, SQ * 8, 4, 2, this.color(mover));
      noGlow(gx);
    }
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        gx.fillStyle = isDark(r, c) ? '#8a5a3b' : '#f1dfbd';
        gx.fillRect(BX + c * SQ, BY + r * SQ, SQ, SQ);
      }
    const lm = g.lastMove;
    if (lm && !this.anim) {
      for (const s of [lm.from, lm.path[lm.path.length - 1]]) {
        gx.fillStyle = 'rgba(255,230,120,0.22)';
        gx.fillRect(cx(s) - SQ / 2, cy(s) - SQ / 2, SQ, SQ);
      }
    }
    if (this.anim) {
      this.drawAnim(gx, this.anim);
      return;
    }
    const human = !g.done && !this.bots[mover];
    const legal = human ? g.legal() : [];
    const forced = human && g.mustCapture();
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    // Pieces that must move glow; so do the pieces they can take.
    if (human && !this.sel) {
      const movers = new Set(legal.map((m) => m.from));
      for (const s of movers) {
        if (forced) {
          glow(gx, COLORS.gold, 10 + 8 * pulse);
          circle(gx, cx(s), cy(s), SQ * 0.46, undefined, COLORS.gold, 3);
          noGlow(gx);
        } else circle(gx, cx(s), cy(s), SQ * 0.46, undefined, 'rgba(255,255,255,0.35)', 2);
      }
      if (forced) {
        const targets = new Set(legal.map((m) => m.caps[0]));
        for (const s of targets) {
          glow(gx, COLORS.bad, 8 + 8 * pulse);
          circle(gx, cx(s), cy(s), SQ * 0.47, undefined, COLORS.bad, 3);
          noGlow(gx);
        }
      }
    }
    // Pieces, with the selected piece shown part-way through a jump.
    const sel = this.sel;
    const ghost = new Set<number>();
    let selAt: number | null = null;
    if (sel) {
      selAt = sel.path.length ? sel.path[sel.path.length - 1] : sel.from;
      const cand = legal.find((m) => m.from === sel.from && sel.path.every((q, i) => m.path[i] === q));
      if (cand) for (let i = 0; i < sel.path.length; i++) ghost.add(cand.caps[i]);
    }
    for (let i = 0; i < 64; i++) {
      const v = g.cells[i];
      if (v === 0 || (sel && i === sel.from)) continue;
      this.drawPiece(gx, cx(i), cy(i), v, ghost.has(i) ? 0.3 : 1);
    }
    const hint = this.currentHint();
    if (hint) {
      const a = 0.5 + 0.5 * Math.sin(this.t * 3);
      gx.setLineDash([5, 4]);
      circle(gx, cx(hint.from), cy(hint.from), SQ * 0.48, undefined, alpha(COLORS.gold, 0.5 + 0.5 * a), 3);
      let px = cx(hint.from);
      let py = cy(hint.from);
      for (const s of hint.path) {
        line(gx, px, py, cx(s), cy(s), alpha(COLORS.gold, 0.35 + 0.4 * a), 3);
        px = cx(s);
        py = cy(s);
      }
      circle(gx, px, py, SQ * 0.3, alpha(COLORS.gold, 0.25), alpha(COLORS.gold, 0.8), 2);
      gx.setLineDash([]);
      text(gx, '💡', px, py, { size: 16, player: mover });
    }
    if (sel && selAt !== null) {
      const v = g.cells[sel.from];
      glow(gx, '#ffffff', 14);
      this.drawPiece(gx, cx(selAt), cy(selAt) - 3, v, 1, 1.08);
      noGlow(gx);
      circle(gx, cx(selAt), cy(selAt) - 3, SQ * 0.5, undefined, '#fff', 3);
      // Next landing squares.
      const next = new Set<number>();
      for (const m of legal) if (m.from === sel.from && sel.path.every((q, i) => m.path[i] === q) && m.path.length > sel.path.length) next.add(m.path[sel.path.length]);
      for (const s of next) {
        circle(gx, cx(s), cy(s), SQ * 0.22 + 3 * pulse, alpha(COLORS.good, 0.55), '#ffffff', 2);
      }
    }
  }

  private drawAnim(gx: G, a: Anim): void {
    const m = a.move;
    const k = Math.min(1, a.t / (m.path.length * HOP));
    const hop = Math.min(m.path.length - 1, Math.floor(a.t / HOP));
    const f = Math.min(1, (a.t - hop * HOP) / HOP);
    for (let i = 0; i < 64; i++) {
      const v = a.before[i];
      if (v === 0 || i === m.from) continue;
      const ci = m.caps.indexOf(i);
      if (ci >= 0 && ci < a.hopsDone) continue;
      this.drawPiece(gx, cx(i), cy(i), v, 1);
    }
    const s0 = hop === 0 ? m.from : m.path[hop - 1];
    const s1 = m.path[hop];
    const x = cx(s0) + (cx(s1) - cx(s0)) * f;
    const lift = Math.sin(f * Math.PI) * (m.caps.length ? 14 : 6);
    const y = cy(s0) + (cy(s1) - cy(s0)) * f - lift;
    const v = a.before[m.from];
    const crowned = m.crown && k >= 1 ? (v > 0 ? 2 : -2) : v;
    this.drawPiece(gx, x, y, crowned, 1, 1 + lift / 60);
  }

  private drawPiece(gx: G, x: number, y: number, v: number, a: number, scale = 1): void {
    const p = ownerOfCell(v)!;
    const c = this.color(p);
    const r = SQ * 0.37 * scale;
    gx.globalAlpha = a;
    circle(gx, x, y + 3, r, 'rgba(0,0,0,0.35)');
    const king = Math.abs(v) === 2;
    if (king) circle(gx, x, y + 1, r, shade(c, -0.45));
    circle(gx, x, y - (king ? 2 : 0), r, c, shade(c, -0.4), 2.5);
    circle(gx, x, y - (king ? 2 : 0), r * 0.68, undefined, shade(c, 0.35), 2);
    if (king) {
      circle(gx, x, y - 2, r * 0.68, undefined, COLORS.gold, 2.5);
      facing(gx, p, x, y - 2, () => this.crown(gx, x, y - 2, r * 0.5));
    } else circle(gx, x - r * 0.35, y - r * 0.35, r * 0.15, 'rgba(255,255,255,0.35)');
    gx.globalAlpha = 1;
  }

  /** A small gold crown, drawn upright for whoever is facing it. */
  private crown(gx: G, x: number, y: number, s: number): void {
    gx.beginPath();
    gx.moveTo(x - s, y + s * 0.55);
    gx.lineTo(x - s, y - s * 0.35);
    gx.lineTo(x - s * 0.5, y + s * 0.1);
    gx.lineTo(x, y - s * 0.6);
    gx.lineTo(x + s * 0.5, y + s * 0.1);
    gx.lineTo(x + s, y - s * 0.35);
    gx.lineTo(x + s, y + s * 0.55);
    gx.closePath();
    gx.fillStyle = COLORS.gold;
    gx.fill();
    gx.lineWidth = 1.5;
    gx.strokeStyle = '#a07400';
    gx.stroke();
  }

  /** One player's panel, drawn in player 0's coordinates (bottom); rotated for player 1. */
  private drawHud(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const c = this.color(p);
    const top = BY + SQ * 8 + 10;
    const mine = !g.done && g.turn === p;
    const left = g.cells.reduce((n, v) => n + (v !== 0 && ownerOfCell(v) === p ? 1 : 0), 0);
    text(gx, `${this.ctx.players[p].name}${this.bots[p] ? ' 🤖' : ''}`, 26, top + 22, { size: 16, align: 'left', color: c });
    text(gx, `${left} left`, W - 26, top + 22, { size: 14, align: 'right', color: COLORS.dim, weight: 700 });
    // Turn pill
    const pw = 210;
    const py = top + 64;
    if (mine) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
      glow(gx, c, 10 + 10 * pulse);
      rrect(gx, W / 2 - pw / 2, py - 22, pw, 44, 22, c);
      noGlow(gx);
      const busy = this.anim || this.bots[p];
      const msg = this.bots[p] ? 'Thinking…' : g.mustCapture() && !busy ? 'Your turn · jump!' : 'Your turn!';
      text(gx, msg, W / 2, py, { size: 20, color: '#fff', stroke: alpha('#000000', 0.25) });
    } else {
      rrect(gx, W / 2 - pw / 2, py - 20, pw, 40, 20, 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.15)', 2);
      text(gx, g.done ? (g.winner === p ? 'Winner!' : g.winner === null ? 'Draw' : 'Good game') : 'Waiting…', W / 2, py, { size: 17, color: COLORS.dim, weight: 700 });
    }
    // Pieces this player has taken.
    const n = g.score[p];
    const foe = this.color(other(p));
    for (let i = 0; i < n; i++) {
      const x = 30 + i * 15;
      circle(gx, x, H - 30 + 2, 7, 'rgba(0,0,0,0.3)');
      circle(gx, x, H - 30, 7, foe, shade(foe, -0.4), 1.5);
    }
    if (n === 0) text(gx, 'Taken: none yet', 26, H - 30, { size: 12, align: 'left', color: COLORS.dim, weight: 600 });
  }
}

const def: GameDef = { id: 'checkers', create: (ctx) => new CheckersView(ctx) };
export default def;
