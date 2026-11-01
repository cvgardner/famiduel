// Four in a Row view: the board sits in the middle; each player taps (or slides
// and lets go) in their own half to drop a disc in that column.
import { PLAYERS, type PlayerIndex } from '../../core/types';
import { waitingLine } from '../../core/turnline';
import { alpha, circle, COLORS, fitSize, glow, line, noGlow, rrect, shade, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { PowerButton } from '../../engine/widgets';
import { clamp, H, MID, W } from '../../engine/world';
import { COLS, FourInARow, FourInARowBot, idx, ROWS, RULES, type Move } from './logic';

const S = 43; // cell size
const BX = 48; // board left (leaves the pause button clear)
const BY = MID - (ROWS * S) / 2;
const BW = COLS * S;
const BH = ROWS * S;
const GRAV = 70; // rows / s²

const cx = (c: number) => BX + c * S + S / 2;
const cy = (r: number) => BY + BH - r * S - S / 2;
const colAt = (x: number) => clamp(Math.floor((x - BX) / S), 0, COLS - 1);

type Disc = { c: number; y: number; vy: number; target: number; p: PlayerIndex; flipT: number; settled: boolean; bomb: boolean };

class FourInARowView implements GameInstance {
  readonly game: FourInARow;
  private bots: (FourInARowBot | null)[];
  private powerBtns: (PowerButton | null)[];
  private discs = new Map<number, Disc>();
  private drain: Disc[] = [];
  /** While a bomb disc falls, the board picture is frozen until it explodes. */
  private hold: { id: number; row: number; col: number; cleared: number[] } | null = null;
  private armed: (string | null)[] = [null, null];
  private hover: (number | null)[] = [null, null];
  private keyCol = [3, 3];
  private botTimer = 0;
  private botQueue: Move[] = [];
  private roundShow = 0;
  private roundPending = false;
  private ended = false;
  private t = 0;
  private turnFlash = 0;
  private lastTurn: PlayerIndex;

  constructor(private readonly ctx: GameContext) {
    this.game = new FourInARow(ctx.players, ctx.powersOn, ctx.rng, ctx.starter);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new FourInARowBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      return p === 0 ? new PowerButton(40, H - 42, 0, pw, ctx.players[0].color) : new PowerButton(W - 40, 42, 1, pw, ctx.players[1].color);
    });
    this.lastTurn = this.game.turn;
  }

  private get busy(): boolean {
    if (this.hold || this.roundPending || this.roundShow > 0) return true;
    for (const d of this.discs.values()) if (!d.settled) return true;
    return false;
  }

  firstMover(): PlayerIndex | null {
    return this.game.firstStarter;
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    this.turnFlash = Math.max(0, this.turnFlash - dt);
    const g = this.game;
    this.physics(dt);
    if (this.roundPending && !this.busyDiscs()) this.showRound();
    if (this.roundShow > 0) {
      this.roundShow -= dt;
      if (this.roundShow <= 0) this.afterRound();
    }
    if (g.done || g.roundOver) return;
    if (g.turn !== this.lastTurn) {
      this.lastTurn = g.turn;
      this.turnFlash = 0.6;
      this.botTimer = 0;
    }
    const p = g.turn;
    const bot = this.bots[p];
    if (bot) {
      if (this.busy) return;
      this.botTimer += dt;
      if (!this.botQueue.length && this.botTimer > 0.55) {
        this.botQueue = bot.choose(g);
        this.botTimer = 0;
      }
      if (this.botQueue.length && this.botTimer > 0.35) {
        const m = this.botQueue.shift()!;
        if (m.kind === 'drop' && m.bomb) this.armed[p] = 'bomb';
        this.doMove(m);
        this.botTimer = 0;
      }
      return;
    }
    this.humanInput(p, input);
  }

  private busyDiscs(): boolean {
    if (this.hold) return true;
    for (const d of this.discs.values()) if (!d.settled) return true;
    return false;
  }

  private humanInput(p: PlayerIndex, input: Input): void {
    const g = this.game;
    const btn = this.powerBtns[p];
    if (btn) {
      // Read the press straight from the fingers, so even a very quick tap counts.
      const tapped = input.of(p).some((f) => f.pressed && btn.button.hit(f.x, f.y)) || input.keyPressed(KEYS[p].power);
      btn.button.held = input.of(p).some((f) => f.down && btn.button.hit(f.x, f.y));
      if (tapped) {
        const id = g.powerOf(p)!;
        if (this.armed[p]) this.armed[p] = null;
        else if (g.canUsePower(p, id)) {
          this.armed[p] = id;
          this.ctx.sfx.play('power');
        } else this.ctx.sfx.play('buzz');
      }
    }
    if (this.busy) return;
    const onBtn = (x: number, y: number) => !!btn && btn.button.hit(x, y);
    // Flip: tap an opponent disc (either half, since it may sit on their side).
    if (this.armed[p] === 'flip') {
      const f = input.all().find((f) => f.pressed && !onBtn(f.x, f.y));
      if (f && f.x >= BX && f.x < BX + BW && f.y >= BY && f.y < BY + BH) {
        const c = colAt(f.x);
        const r = clamp(Math.floor((BY + BH - f.y) / S), 0, ROWS - 1);
        if (g.flippable(p).includes(idx(c, r))) this.doMove({ kind: 'flip', col: c, row: r });
        else this.ctx.sfx.play('buzz');
      }
      return;
    }
    // Drop / block: slide in your own half to pick a column, let go to drop.
    const finger = input.of(p).find((f) => !onBtn(f.startX, f.startY));
    this.hover[p] = finger && finger.down ? colAt(finger.x) : null;
    if (finger && finger.released) this.chooseCol(p, colAt(finger.x));
    const k = KEYS[p];
    const dir = p === 0 ? 1 : -1;
    if (input.keyPressed(k.left)) this.keyCol[p] = clamp(this.keyCol[p] - dir, 0, COLS - 1);
    if (input.keyPressed(k.right)) this.keyCol[p] = clamp(this.keyCol[p] + dir, 0, COLS - 1);
    if (input.key(k.left) || input.key(k.right)) this.hover[p] = this.keyCol[p];
    if (input.keyPressed(k.action)) this.chooseCol(p, this.keyCol[p]);
  }

  private chooseCol(p: PlayerIndex, c: number): void {
    const g = this.game;
    this.hover[p] = null;
    if (this.armed[p] === 'block') {
      if (g.blockable().includes(c)) this.doMove({ kind: 'block', col: c });
      else this.ctx.sfx.play('buzz');
      return;
    }
    if (!g.legalCols(p).includes(c)) {
      this.ctx.sfx.play('buzz');
      this.ctx.fx.pop(g.blocked?.col === c ? 'Blocked!' : 'Full!', cx(c), p === 0 ? BY + BH + 20 : BY - 20, COLORS.bad, p, 18);
      return;
    }
    this.doMove({ kind: 'drop', col: c, bomb: this.armed[p] === 'bomb' });
  }

  private doMove(m: Move): void {
    const g = this.game;
    const p = g.turn;
    if (!g.apply(m)) {
      this.ctx.sfx.play('buzz');
      return;
    }
    this.armed[p] = null;
    const { sfx, fx } = this.ctx;
    for (const e of g.events) {
      if (e.type === 'power') {
        const pw = this.ctx.players[e.p].power!;
        sfx.play('power');
        fx.flash(COLORS.gold, 0.12);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, MID + 175, COLORS.gold, 0, 24);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, MID - 175, COLORS.gold, 1, 24);
      } else if (e.type === 'block') {
        sfx.play('thud');
        fx.burst(cx(e.col), MID, COLORS.bad, 18, 160, 4);
      } else if (e.type === 'flip') {
        sfx.play('whoosh');
        fx.burst(cx(e.col), cy(e.row), this.ctx.players[e.p].color, 22, 200, 4);
      } else if (e.type === 'drop') {
        sfx.play('whoosh');
        if (e.bomb) {
          this.hold = { id: e.id, row: e.bombRow, col: e.col, cleared: e.cleared };
          this.discs.set(e.id, { c: e.col, y: ROWS + 0.6, vy: 0, target: e.bombRow, p: e.p, flipT: 0, settled: false, bomb: true });
        }
      } else if (e.type === 'roundWin' || e.type === 'roundDraw') {
        this.roundPending = true;
      }
    }
    if (!this.hold) this.sync();
  }

  /** Match the animated discs to the board: new discs fall in, removed ones pop, moved ones fall. */
  private sync(): void {
    const g = this.game;
    const seen = new Set<number>();
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) {
        const id = g.ids[idx(c, r)];
        if (!id) continue;
        seen.add(id);
        const owner = g.board[idx(c, r)] as PlayerIndex;
        let d = this.discs.get(id);
        if (!d) {
          d = { c, y: ROWS + 0.6, vy: 0, target: r, p: owner, flipT: 0, settled: false, bomb: false };
          this.discs.set(id, d);
        }
        if (d.target !== r) {
          d.target = r;
          d.settled = false;
        }
        if (d.p !== owner) {
          d.p = owner;
          d.flipT = 1;
        }
      }
    for (const [id, d] of this.discs) {
      if (seen.has(id)) continue;
      this.ctx.fx.burst(cx(d.c), cy(d.y), this.ctx.players[d.p].color, 14, 220, 4);
      this.discs.delete(id);
    }
  }

  private physics(dt: number): void {
    for (const d of this.discs.values()) {
      d.flipT = Math.max(0, d.flipT - dt * 2);
      if (d.settled) continue;
      d.vy += GRAV * dt;
      d.y -= d.vy * dt;
      if (d.y <= d.target) {
        d.y = d.target;
        if (this.hold && this.discs.get(this.hold.id) === d && d.target === this.hold.row) {
          this.explode();
          continue;
        }
        if (d.vy > 6) {
          if (d.vy > 10) {
            // The disc clacking into place: a hit (and a short buzz), so a drop is felt.
            this.ctx.sfx.play('hit');
            this.ctx.fx.burst(cx(d.c), cy(d.y) + (S / 2 - 4), 'rgba(255,255,255,0.7)', 4, 70, 2);
          }
          d.vy = -d.vy * 0.28;
        } else {
          d.vy = 0;
          d.settled = true;
        }
      }
    }
    for (const d of this.drain) {
      d.vy += GRAV * dt;
      d.y -= d.vy * dt;
    }
    this.drain = this.drain.filter((d) => d.y > -12);
  }

  private explode(): void {
    const h = this.hold!;
    const { sfx, fx } = this.ctx;
    sfx.play('thud');
    sfx.play('splash');
    fx.shake(10, 0.35);
    fx.flash('#ffb020', 0.15);
    fx.burst(cx(h.col), cy(h.row), '#ffb020', 40, 320, 5);
    fx.burst(cx(h.col), cy(h.row), '#ffffff', 16, 200, 3);
    fx.pop('BOOM!', cx(h.col), cy(h.row) + 30, COLORS.gold, 0, 30);
    fx.pop('BOOM!', cx(h.col), cy(h.row) - 30, COLORS.gold, 1, 30);
    const d = this.discs.get(h.id);
    if (d) {
      d.bomb = false;
      d.vy = 0;
    }
    this.hold = null;
    this.sync();
  }

  private showRound(): void {
    const g = this.game;
    this.roundPending = false;
    const ro = g.roundOver;
    if (!ro) return;
    const { sfx, fx } = this.ctx;
    this.roundShow = g.done ? 2.0 : 2.4;
    if (ro.winner === null) {
      sfx.play('buzz');
      fx.pop('Full board: draw game', W / 2, BY + BH + 40, '#fff', 0, 22);
      fx.pop('Full board: draw game', W / 2, BY - 40, '#fff', 1, 22);
      return;
    }
    const w = ro.winner;
    const col = this.ctx.players[w].color;
    sfx.play(g.done ? 'win' : 'score');
    fx.shake(6, 0.3);
    fx.flash(col, 0.18);
    for (const i of ro.line) fx.burst(cx(Math.floor(i / ROWS)), cy(i % ROWS), COLORS.gold, 16, 220, 4);
    const msg = (p: PlayerIndex) => (p === w ? 'Four in a row!' : `${this.ctx.players[w].name} got four`);
    fx.pop(msg(0), W / 2, BY + BH + 40, col, 0, 26);
    fx.pop(msg(1), W / 2, BY - 40, col, 1, 26);
  }

  private afterRound(): void {
    const g = this.game;
    if (g.done) {
      if (!this.ended) {
        this.ended = true;
        this.ctx.end({ winner: g.winner, score: [...g.score] as [number, number], summary: `${g.score[0]} – ${g.score[1]} games` });
      }
      return;
    }
    for (const d of this.discs.values()) this.drain.push({ ...d, vy: 4 + Math.random() * 3, target: -99 });
    this.discs.clear();
    this.ctx.sfx.play('whoosh');
    g.nextRound();
    this.lastTurn = g.turn;
    this.turnFlash = 0.8;
    this.botTimer = -0.4;
    this.ctx.sfx.play('go');
  }

  /**
   * The cell of the newest disc once it has landed (and finished turning, for a flip),
   * while the game is live; null otherwise. The playtest reads this too.
   */
  ringCell(): number | null {
    const g = this.game;
    const last = g.last;
    if (!last || g.roundOver || g.done || this.hold) return null;
    const c = Math.floor(last.cell / ROWS);
    const r = last.cell % ROWS;
    for (const d of this.discs.values()) if (d.c === c && d.target === r) return d.settled && d.flipT < 0.5 ? last.cell : null;
    return null;
  }

  // ---------- drawing ----------

  render(gx: G): void {
    const g = this.game;
    // Each half tinted in its owner's colour; the active half glows.
    const live = !g.roundOver && !g.done;
    for (const p of PLAYERS) {
      const col = this.ctx.players[p].color;
      const on = live && g.turn === p;
      const grd = gx.createLinearGradient(0, p === 0 ? H : 0, 0, MID);
      grd.addColorStop(0, alpha(col, on ? 0.38 + 0.08 * Math.sin(this.t * 4) : 0.1));
      grd.addColorStop(1, alpha(col, 0));
      gx.fillStyle = grd;
      gx.fillRect(0, p === 0 ? MID : 0, W, MID);
    }
    this.drawPanels(gx);
    this.drawBoard(gx);
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, g.energy[p], this.t);
  }

  private drawPanels(gx: G): void {
    const g = this.game;
    for (const p of PLAYERS) {
      const pl = this.ctx.players[p];
      const mine = !g.roundOver && !g.done && g.turn === p;
      // Anchor: the player's own edge. y grows toward the middle for both.
      const edge = p === 0 ? H : 0;
      const s = p === 0 ? -1 : 1;
      const yName = edge + s * 30;
      const yTurn = edge + s * 112;
      text(gx, pl.name, W / 2, yName, { size: 18, color: alpha(pl.color, 0.95), player: p, weight: 800 });
      // Win pips (best of 3)
      for (let i = 0; i < RULES.winsNeeded; i++) {
        const x = W / 2 + (i - (RULES.winsNeeded - 1) / 2) * 26 * (p === 0 ? 1 : -1);
        const y = edge + s * 56;
        circle(gx, x, y, 9, i < g.score[p] ? pl.color : 'rgba(255,255,255,0.1)', i < g.score[p] ? '#fff' : 'rgba(255,255,255,0.3)', 2);
        if (i < g.score[p]) text(gx, '★', x, y + 0.5, { size: 11, player: p, color: '#fff' });
      }
      if (g.done || g.roundOver) continue;
      const pulse = 1 + 0.06 * Math.sin(this.t * 6) + this.turnFlash * 0.3;
      if (mine) {
        const label = this.armed[p] === 'bomb' ? '💣 Drop your bomb!' : this.armed[p] === 'flip' ? '🔄 Tap a disc to flip' : this.armed[p] === 'block' ? '🚧 Pick a column to block' : this.bots[p] ? 'Thinking…' : 'Your turn!';
        rrect(gx, W / 2 - 120, yTurn - 22, 240, 44, 22, alpha(pl.color, 0.9), '#fff', 3);
        text(gx, label, W / 2, yTurn, { size: Math.round(22 * Math.min(1.25, pulse)), player: p, color: '#fff', stroke: 'rgba(0,0,0,0.3)' });
      } else {
        // Same quiet pill as Checkers and Tic-Tac-Toe: "Waiting…", or who is thinking.
        const msg = waitingLine(this.ctx.players[g.turn]);
        rrect(gx, W / 2 - 110, yTurn - 20, 220, 40, 20, 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.15)', 2);
        text(gx, msg, W / 2, yTurn, { size: fitSize(gx, msg, 196, 17, 700), player: p, color: COLORS.dim, weight: 700 });
      }
      // Arrow from the active player's panel toward the board.
      if (mine && !this.bots[p]) {
        const ay = edge + s * 144 + s * 4 * Math.sin(this.t * 6);
        gx.fillStyle = alpha(pl.color, 0.9);
        gx.beginPath();
        gx.moveTo(W / 2 - 12, ay);
        gx.lineTo(W / 2 + 12, ay);
        gx.lineTo(W / 2, ay + s * 12);
        gx.closePath();
        gx.fill();
      }
    }
  }

  private drawBoard(gx: G): void {
    const g = this.game;
    const turnCol = this.ctx.players[g.turn].color;
    const live = !g.roundOver && !g.done;
    // Frame
    rrect(gx, BX - 8, BY - 8 + 5, BW + 16, BH + 16, 16, 'rgba(0,0,0,0.35)');
    if (live) glow(gx, turnCol, 18);
    rrect(gx, BX - 8, BY - 8, BW + 16, BH + 16, 16, '#363c66', live ? alpha(turnCol, 0.9) : 'rgba(255,255,255,0.3)', 3);
    noGlow(gx);
    // Hints for an assisted human player
    const p = g.turn;
    if (live && !this.bots[p] && !this.busy) {
      const h = g.hints(p);
      const band = (c: number, color: string) => {
        gx.globalAlpha = 0.35 + 0.2 * Math.sin(this.t * 5);
        rrect(gx, BX + c * S + 2, BY + 2, S - 4, BH - 4, 10, color);
        gx.globalAlpha = 1;
      };
      for (const c of h.win) band(c, COLORS.good);
      for (const c of h.block) band(c, '#ffb020');
      for (const c of h.avoid) {
        const yy = p === 0 ? BY + BH + 16 : BY - 16;
        text(gx, '✕', cx(c), yy, { size: 18, color: COLORS.bad, player: p });
      }
      for (const c of h.win) text(gx, '★', cx(c), p === 0 ? BY + BH + 16 : BY - 16, { size: 18, color: COLORS.good, player: p });
      for (const c of h.block) text(gx, '!', cx(c), p === 0 ? BY + BH + 16 : BY - 16, { size: 20, color: '#ffb020', player: p });
    }
    // Hover column
    const hv = this.hover[p];
    if (live && hv !== null && !this.bots[p]) {
      gx.globalAlpha = 0.18;
      rrect(gx, BX + hv * S + 2, BY + 2, S - 4, BH - 4, 10, '#fff');
      gx.globalAlpha = 1;
    }
    // Holes (empty look) and discs
    const disc = (x: number, y: number, p: PlayerIndex, flipT: number, bomb: boolean) => {
      const col = this.ctx.players[p].color;
      const r = S / 2 - 5;
      const sx = flipT > 0 ? Math.abs(Math.cos(flipT * Math.PI)) : 1;
      gx.save();
      gx.translate(x, y);
      gx.scale(Math.max(0.08, sx), 1);
      if (bomb) {
        circle(gx, 0, 0, r, '#222', '#000', 3);
        line(gx, 4, -r + 2, 10, -r - 6, '#c8a165', 3);
        circle(gx, 11, -r - 7, 3 + Math.sin(this.t * 30), '#ffd54a');
        text(gx, '💣', 0, 1, { size: 20 });
      } else {
        circle(gx, 0, 0, r, col, shade(col, -0.35), 3);
        circle(gx, 0, 0, r * 0.62, undefined, shade(col, 0.25), 3);
        circle(gx, -r * 0.35, -r * 0.35, 3.5, 'rgba(255,255,255,0.45)');
      }
      gx.restore();
    };
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) circle(gx, cx(c), cy(r), S / 2 - 5, '#141033', 'rgba(0,0,0,0.4)', 2);
    gx.save();
    gx.beginPath();
    gx.rect(BX - 8, BY - S * 2, BW + 16, BH + S * 2 + 8);
    gx.clip();
    for (const d of this.drain) disc(cx(d.c), cy(d.y), d.p, 0, false);
    for (const d of this.discs.values()) disc(cx(d.c), cy(d.y), d.p, d.flipT, d.bomb);
    gx.restore();
    // The newest disc wears a white ring until the next move, so the player looking back
    // at the board (often a kid after the bot's quick drop) can see what changed.
    const ring = this.ringCell();
    if (ring !== null) {
      const x = cx(Math.floor(ring / ROWS));
      const y = cy(ring % ROWS);
      const rr = S / 2 - 1.5 + 1.2 * Math.sin(this.t * 5);
      circle(gx, x, y, rr, undefined, 'rgba(0,0,0,0.55)', 6);
      circle(gx, x, y, rr, undefined, '#ffffff', 3);
    }
    // Flip targets
    if (live && this.armed[p] === 'flip' && !this.bots[p]) {
      for (const i of g.flippable(p)) circle(gx, cx(Math.floor(i / ROWS)), cy(i % ROWS), S / 2 - 2 + 2 * Math.sin(this.t * 8), undefined, COLORS.gold, 3);
    }
    // Blocked column
    const b = g.blocked;
    if (b && live) {
      gx.globalAlpha = 0.5;
      rrect(gx, BX + b.col * S + 3, BY + 3, S - 6, BH - 6, 10, 'rgba(255,92,122,0.5)', COLORS.bad, 3);
      gx.globalAlpha = 1;
      for (let k = 0; k < 4; k++) line(gx, BX + b.col * S + 6, BY + 20 + k * 66, BX + b.col * S + S - 6, BY + 44 + k * 66, COLORS.bad, 4);
      text(gx, '🚧', cx(b.col), MID, { size: 26, player: b.p });
    }
    // Armed bomb telegraph, visible to both players: a bomb hovering over the board.
    if (live && this.armed[p] === 'bomb') {
      const c = hv ?? 3;
      text(gx, '💣', cx(c), BY - 26 + 3 * Math.sin(this.t * 6), { size: 26 });
    } else if (live && hv !== null && !this.bots[p]) {
      gx.globalAlpha = 0.6;
      disc(cx(hv), BY - 26, p, 0, false);
      gx.globalAlpha = 1;
    }
    // Winning four
    const ro = g.roundOver;
    if (ro && ro.winner !== null && this.roundShow > 0) {
      const pts = ro.line.map((i) => ({ x: cx(Math.floor(i / ROWS)), y: cy(i % ROWS) }));
      pts.sort((a, b) => a.x - b.x || a.y - b.y);
      glow(gx, COLORS.gold, 20);
      line(gx, pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y, alpha('#ffd54a', 0.85), 8);
      for (const q of pts) circle(gx, q.x, q.y, S / 2 - 3 + 2 * Math.sin(this.t * 10), undefined, COLORS.gold, 4);
      noGlow(gx);
    }
  }
}

const def: GameDef = { id: 'fourinarow', create: (ctx) => new FourInARowView(ctx) };
export default def;
