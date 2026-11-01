// Sea Battle view. One shared phone with hidden fleets: between two people a
// full-screen "pass the phone" cover hides everything, and the active player's
// screen is turned to face them. Against a bot the screen always faces the person.
import { other, PLAYERS, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, glow, line, noGlow, rrect, shade, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { PowerButton } from '../../engine/widgets';
import { clamp, H, W } from '../../engine/world';
import { cellsOf, isSunk, MARK, N, radarCells, SeaBattle, SeaBattleBot, SHIP_NAMES, SHIPS, strikeCells, type Move } from './logic';
import { inkOn } from '../../core/contrast';
import { botBeat, botResultTitle } from './beat';

// Layout, in the viewer's frame (the viewer sits at the bottom).
const C = 27;
const GX = (W - N * C) / 2; // big grid, centred so the pause button stays clear in both orientations
const GY = 82;
const SX = 24; // small grid
const SY = 456;
const SC = 14;
const SHOT_T = 0.38; // shell flight time

type Mode =
  | { kind: 'cover'; p: PlayerIndex; next: 'place' | 'fire'; t: number }
  | { kind: 'place'; p: PlayerIndex; t: number }
  | { kind: 'fire'; p: PlayerIndex; t: number }
  | { kind: 'bot'; p: PlayerIndex; t: number; aim: Move | null }
  | { kind: 'after'; p: PlayerIndex; t: number }
  | { kind: 'over'; t: number };

type Shell = { owner: PlayerIndex; cell: number; t: number; result: 'hit' | 'miss' | 'mine' | 'hitBack'; a: PlayerIndex };
type Drag = { i: number; offX: number; offY: number; moved: boolean; sx: number; sy: number; x: number; y: number };
type Btn = { x: number; y: number; w: number; h: number };

const inBtn = (b: Btn, x: number, y: number) => x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6;
const SHUFFLE: Btn = { x: 46, y: 404, w: 140, h: 58 };
const READY: Btn = { x: 204, y: 404, w: 140, h: 58 };

class SeaBattleView implements GameInstance {
  readonly game: SeaBattle;
  private bots: (SeaBattleBot | null)[];
  private humans: PlayerIndex[];
  private mode: Mode = { kind: 'over', t: 0 };
  private shells: Shell[] = [];
  private aim: number | null = null;
  private armed: string | null = null;
  private drag: Drag | null = null;
  private dragId = -1;
  private powerBtn: (PowerButton | null)[];
  private notice: (string | null)[] = [null, null];
  /** Cells the opponent fired at on their last turn, highlighted on your fleet. */
  private lastShots: number[][] = [[], []];
  private turnLog: { hits: number; misses: number; sunk: number }[] = [
    { hits: 0, misses: 0, sunk: 0 },
    { hits: 0, misses: 0, sunk: 0 },
  ];
  private keyCell = 44;
  private ended = false;
  private t = 0;

  constructor(private readonly ctx: GameContext) {
    this.game = new SeaBattle(ctx.players, ctx.powersOn, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new SeaBattleBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.humans = PLAYERS.filter((p) => !this.bots[p]);
    for (const p of PLAYERS) this.bots[p]?.place(this.game);
    this.powerBtn = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      return ctx.powersOn && pw ? new PowerButton(264, 478, 0, pw, ctx.players[p].color) : null;
    });
    this.advance();
  }

  private get twoHumans(): boolean {
    return this.humans.length === 2;
  }

  /** Who the screen faces right now. */
  private get viewer(): PlayerIndex {
    const m = this.mode;
    if (m.kind === 'cover' || m.kind === 'place' || m.kind === 'fire' || m.kind === 'after') return m.p;
    if (this.humans.length === 1) return this.humans[0];
    if (m.kind === 'over' && this.game.winner !== null && this.humans.includes(this.game.winner)) return this.game.winner;
    return 0;
  }

  /** Decide the next screen from the game state. */
  private advance(): void {
    const g = this.game;
    this.aim = null;
    this.armed = null;
    if (g.phase === 'over') {
      this.mode = { kind: 'over', t: 0 };
      return;
    }
    if (g.phase === 'place') {
      const p = this.humans.find((h) => !g.ready[h]);
      if (p === undefined) return;
      this.mode = this.twoHumans ? { kind: 'cover', p, next: 'place', t: 0 } : { kind: 'place', p, t: 0 };
      return;
    }
    const p = g.turn;
    this.turnLog[p] = { hits: 0, misses: 0, sunk: 0 };
    this.lastShots[other(p)] = [];
    if (this.bots[p]) this.mode = { kind: 'bot', p, t: 0, aim: null };
    else this.mode = this.twoHumans ? { kind: 'cover', p, next: 'fire', t: 0 } : { kind: 'fire', p, t: 0 };
    if (this.mode.kind === 'fire') this.ctx.sfx.play('tap');
  }

  // ---------- coordinates ----------

  /** Viewer frame → world, for fx. */
  private world(x: number, y: number): { x: number; y: number } {
    return this.viewer === 1 ? { x: W - x, y: H - y } : { x, y };
  }

  private local(x: number, y: number): { x: number; y: number } {
    return this.viewer === 1 ? { x: W - x, y: H - y } : { x, y };
  }

  private pop(str: string, x: number, y: number, color: string, size = 24): void {
    const w = this.world(x, y);
    this.ctx.fx.pop(str, w.x, w.y, color, this.viewer, size);
  }

  private burst(x: number, y: number, color: string, n: number, speed: number, size = 4): void {
    const w = this.world(x, y);
    this.ctx.fx.burst(w.x, w.y, color, n, speed, size);
  }

  /** Where a sea is drawn right now: big or small grid. */
  private layout(): { big: PlayerIndex; bigShips: boolean; small: PlayerIndex; smallShips: boolean } {
    const m = this.mode;
    const v = this.viewer;
    if (m.kind === 'place') return { big: m.p, bigShips: true, small: other(m.p), smallShips: false };
    if (m.kind === 'over') {
      const w = this.game.winner ?? 0;
      return { big: other(w), bigShips: true, small: w, smallShips: true };
    }
    const a = m.kind === 'cover' ? this.game.turn : m.p;
    if (m.kind !== 'bot' && this.armed === 'mine') return { big: a, bigShips: true, small: other(a), smallShips: false };
    const d = other(a);
    return { big: d, bigShips: d === v, small: a, smallShips: a === v };
  }

  private cellAt(x: number, y: number): number | null {
    const cx = Math.floor((x - GX) / C);
    const cy = Math.floor((y - GY) / C);
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return null;
    return cy * N + cx;
  }

  // ---------- update ----------

  update(dt: number, input: Input): void {
    this.t += dt;
    const m = this.mode;
    m.t += dt;
    for (const s of this.shells) {
      const before = s.t;
      s.t += dt;
      if (before < SHOT_T && s.t >= SHOT_T) this.land(s);
    }
    this.shells = this.shells.filter((s) => s.t < SHOT_T + 0.05);
    const busy = this.shells.length > 0;
    const taps = input
      .all()
      .filter((f) => f.pressed)
      .map((f) => this.local(f.x, f.y));
    if (m.kind === 'cover') {
      if (m.t > 0.5 && (taps.length || input.keyPressed(KEYS[m.p].action))) {
        this.ctx.sfx.play('go');
        this.mode = m.next === 'place' ? { kind: 'place', p: m.p, t: 0 } : { kind: 'fire', p: m.p, t: 0 };
      }
    } else if (m.kind === 'place') this.placeInput(m.p, input);
    else if (m.kind === 'fire') {
      if (!busy) this.fireInput(m.p, input, taps);
    } else if (m.kind === 'bot') this.botStep(m, busy);
    else if (m.kind === 'after') {
      if (!busy && m.t > (this.twoHumans ? 1.3 : 0.8)) this.advance();
    } else if (m.kind === 'over') {
      if (!busy && m.t > 3 && !this.ended) {
        this.ended = true;
        const g = this.game;
        this.ctx.end({ winner: g.winner, score: [...g.score] as [number, number], summary: `${g.score[0]} – ${g.score[1]} ships sunk` });
      }
    }
  }

  private placeInput(p: PlayerIndex, input: Input): void {
    const g = this.game;
    const { sfx } = this.ctx;
    const sea = g.seas[p];
    if (!this.drag) {
      const f = input.all().find((f) => f.pressed);
      if (f) {
        const l = this.local(f.x, f.y);
        const cell = this.cellAt(l.x, l.y);
        if (cell !== null && sea.occ[cell] >= 0) {
          const i = sea.occ[cell];
          const s = sea.ships[i];
          this.drag = { i, offX: (cell % N) - s.x, offY: Math.floor(cell / N) - s.y, moved: false, sx: l.x, sy: l.y, x: l.x, y: l.y };
          this.dragId = f.id;
        } else if (inBtn(SHUFFLE, l.x, l.y)) {
          g.placeRandom(p);
          sfx.play('whoosh');
          this.burst(SHUFFLE.x + SHUFFLE.w / 2, GY + 150, '#7fd3ff', 20, 220, 3);
        } else if (inBtn(READY, l.x, l.y)) {
          sfx.play('coin');
          this.burst(READY.x + READY.w / 2, READY.y + 29, this.ctx.players[p].color, 24, 220, 4);
          g.setReady(p);
          this.advance();
        }
      }
      if (input.keyPressed(KEYS[p].power)) g.placeRandom(p);
      if (input.keyPressed(KEYS[p].action)) {
        g.setReady(p);
        this.advance();
      }
      return;
    }
    const d = this.drag;
    const f = input.pointers.get(this.dragId);
    if (f) {
      const l = this.local(f.x, f.y);
      d.x = l.x;
      d.y = l.y;
      if (Math.hypot(d.x - d.sx, d.y - d.sy) > 10) d.moved = true;
    }
    if (!f || !f.down) {
      const s = sea.ships[d.i];
      if (d.moved) {
        const tx = Math.round((d.x - GX) / C - 0.5) - d.offX;
        const ty = Math.round((d.y - GY) / C - 0.5) - d.offY;
        if (g.setShip(p, d.i, tx, ty, s.horiz)) sfx.play('click');
        else if (!(tx === s.x && ty === s.y)) sfx.play('buzz');
      } else if (g.rotateShip(p, d.i)) sfx.play('pop');
      else {
        sfx.play('buzz');
        this.ctx.fx.shake(3, 0.12);
      }
      this.drag = null;
    }
  }

  private fireInput(p: PlayerIndex, input: Input, taps: { x: number; y: number }[]): void {
    const g = this.game;
    const { sfx } = this.ctx;
    const btn = this.powerBtn[p];
    const pw = g.powerOf(p);
    const k = KEYS[p];
    const flip = p === 1 ? -1 : 1;
    let cmd: 'aim' | 'confirm' | null = null;
    let cell: number | null = null;
    for (const tp of taps) {
      if (btn && btn.button.hit(tp.x, tp.y)) {
        this.togglePower(p);
        return;
      }
      const c = this.cellAt(tp.x, tp.y);
      if (c !== null) {
        cell = c;
        cmd = this.aim === c ? 'confirm' : 'aim';
      }
    }
    // Keys: move a cursor, action fires, power arms.
    if (input.keyPressed(k.power) && pw) {
      this.togglePower(p);
      return;
    }
    const mv = (dx: number, dy: number) => {
      const x = clamp((this.keyCell % N) + dx * flip, 0, N - 1);
      const y = clamp(Math.floor(this.keyCell / N) + dy * flip, 0, N - 1);
      this.keyCell = y * N + x;
      this.aim = this.keyCell;
    };
    if (input.keyPressed(k.left)) mv(-1, 0);
    if (input.keyPressed(k.right)) mv(1, 0);
    if (input.keyPressed(k.up)) mv(0, -1);
    if (input.keyPressed(k.down)) mv(0, 1);
    if (input.keyPressed(k.action)) {
      cell = this.aim ?? this.keyCell;
      cmd = 'confirm';
    }
    if (cell === null || !cmd) return;
    if (cmd === 'aim') {
      this.aim = cell;
      sfx.play('click');
      return;
    }
    const kind = this.armed === 'radar' ? 'radar' : this.armed === 'airstrike' ? 'airstrike' : this.armed === 'mine' ? 'mine' : 'fire';
    this.doMove({ kind, cell });
  }

  private togglePower(p: PlayerIndex): void {
    const g = this.game;
    const pw = g.powerOf(p);
    if (!pw) return;
    if (this.armed) this.armed = null;
    else if (g.canUsePower(p, pw)) {
      this.armed = pw;
      this.ctx.sfx.play('power');
    } else {
      this.ctx.sfx.play('buzz');
      return;
    }
    this.aim = null;
  }

  private botStep(m: Extract<Mode, { kind: 'bot' }>, busy: boolean): void {
    const g = this.game;
    const bot = this.bots[m.p]!;
    if (g.phase !== 'fire') return;
    if (g.turn !== m.p) {
      // Bot's turn is over: the beat starts when its last shell lands, so a kid can
      // see where it went (longer on a hit), then hand over.
      if (busy) m.t = 0;
      else if (m.t > botBeat(this.turnLog[m.p])) this.advance();
      return;
    }
    if (busy) return;
    if (!m.aim && m.t > bot.think * 0.6) {
      m.aim = bot.choose(g);
      m.t = 0;
      if (m.aim.kind === 'airstrike' || m.aim.kind === 'radar' || m.aim.kind === 'mine') this.ctx.sfx.play('power');
    }
    if (m.aim && m.t > 0.45) {
      const mv = m.aim;
      m.aim = null;
      m.t = 0;
      this.doMove(mv);
    }
  }

  private doMove(mv: Move): void {
    const g = this.game;
    const a = g.turn;
    if (!g.apply(mv)) {
      this.ctx.sfx.play('buzz');
      return;
    }
    if (mv.kind === 'fire' || mv.kind === 'airstrike') this.notice[a] = null;
    this.armed = null;
    this.aim = null;
    const { sfx, fx } = this.ctx;
    const d = other(a);
    let delay = 0;
    for (const e of g.events) {
      if (e.type === 'shot') {
        this.shells.push({ owner: d, cell: e.cell, t: -delay, result: e.result, a });
        delay += 0.09;
        this.lastShots[d].push(e.cell);
        sfx.play('whoosh');
      } else if (e.type === 'hitBack') {
        this.shells.push({ owner: e.victim, cell: e.cell, t: -delay - 0.35, result: 'hitBack', a: other(e.victim) });
        this.notice[e.victim] = '💥 You hit a mine! It hit one of your ships back.';
      } else if (e.type === 'power') {
        const pw = this.ctx.players[e.p].power!;
        sfx.play('power');
        fx.flash(COLORS.gold, 0.12);
        this.pop(`${pw.icon} ${pw.name}!`, W / 2, GY + 150, COLORS.gold, 28);
      } else if (e.type === 'radar') {
        sfx.play(e.found ? 'coin' : 'pop');
        const [x, y] = this.cellXY(e.cell);
        this.pop(e.found ? 'Ship nearby!' : 'All clear', x, y - 30, e.found ? COLORS.gold : '#bfe9ff', 22);
        this.burst(x, y, e.found ? COLORS.gold : '#7fd3ff', 20, 160, 3);
        this.notice[d] = `📡 ${this.ctx.players[a].name} scanned your sea.`;
      } else if (e.type === 'mine') {
        sfx.play('thud');
        this.notice[d] = `💥 ${this.ctx.players[a].name} hid a mine somewhere in their sea!`;
      }
    }
    if (g.turn !== a || g.phase === 'over') {
      // Turn over (or match over): pause on the result before handing over.
      if (g.phase === 'over') this.mode = { kind: 'over', t: 0 };
      else if (this.mode.kind === 'fire') this.mode = { kind: 'after', p: this.mode.p, t: 0 };
    }
  }

  private cellXY(cell: number): [number, number] {
    return [GX + (cell % N) * C + C / 2, GY + Math.floor(cell / N) * C + C / 2];
  }

  /** Where a sea's cell is drawn right now, in the viewer frame. */
  private cellPos(owner: PlayerIndex, cell: number): [number, number] {
    const lay = this.layout();
    if (lay.big === owner) return this.cellXY(cell);
    return [SX + (cell % N) * SC + SC / 2, SY + Math.floor(cell / N) * SC + SC / 2];
  }

  private land(s: Shell): void {
    const { sfx, fx } = this.ctx;
    const [x, y] = this.cellPos(s.owner, s.cell);
    const big = this.layout().big === s.owner;
    const log = this.turnLog[s.a];
    if (s.result === 'hit' || s.result === 'hitBack') {
      sfx.play('hit');
      this.burst(x, y, '#ff8a3d', big ? 22 : 10, big ? 240 : 120, big ? 4 : 2);
      this.burst(x, y, '#ffd54a', 8, 120, 3);
      fx.shake(big ? 6 : 3, 0.18);
      if (s.result === 'hit') log.hits++;
      if (big) this.pop(s.result === 'hitBack' ? 'Hit back!' : 'HIT!', x, y + (y < GY + 70 ? 26 : -24), '#ff8a3d', 24);
      const sea = this.game.seas[s.owner];
      const ship = sea.ships[sea.occ[s.cell]];
      if (s.result === 'hit' && isSunk(ship) && cellsOf(ship).every((c) => !this.shells.some((o) => o !== s && o.owner === s.owner && o.cell === c && o.t < SHOT_T))) {
        sfx.play('score');
        log.sunk++;
        fx.flash('#ff8a3d', 0.15);
        for (const c of cellsOf(ship)) {
          const [cx, cy] = this.cellPos(s.owner, c);
          this.burst(cx, cy, '#ffd54a', 8, 160, 3);
        }
        this.pop(`${SHIP_NAMES[sea.occ[s.cell]]} sunk!`, W / 2, big ? GY + 330 : SY - 20, COLORS.gold, 26);
      }
    } else if (s.result === 'mine') {
      sfx.play('thud');
      sfx.play('splash');
      fx.shake(10, 0.3);
      this.burst(x, y, '#ffb020', 30, 300, 5);
      if (big) this.pop('MINE!', x, y + (y < GY + 70 ? 26 : -24), COLORS.bad, 28);
      log.misses++;
    } else {
      sfx.play('splash');
      this.burst(x, y, '#bfe9ff', big ? 12 : 6, big ? 140 : 70, big ? 3 : 2);
      if (big) this.pop('Splash', x, y + (y < GY + 70 ? 24 : -22), '#bfe9ff', 18);
      log.misses++;
    }
  }

  // ---------- drawing ----------

  render(gx: G): void {
    const v = this.viewer;
    gx.save();
    if (v === 1) {
      gx.translate(W, H);
      gx.rotate(Math.PI);
    }
    const m = this.mode;
    if (m.kind === 'cover') this.drawCover(gx, m);
    else this.drawPlay(gx);
    gx.restore();
  }

  private drawCover(gx: G, m: Extract<Mode, { kind: 'cover' }>): void {
    const pl = this.ctx.players[m.p];
    const grd = gx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, shade(pl.color, -0.75));
    grd.addColorStop(1, shade(pl.color, -0.45));
    gx.fillStyle = grd;
    gx.fillRect(0, 0, W, H);
    // Gentle waves
    for (let k = 0; k < 6; k++) {
      gx.beginPath();
      for (let x = 0; x <= W; x += 10) {
        const y = 120 + k * 80 + Math.sin(x / 40 + this.t * 1.5 + k) * 6;
        if (x === 0) gx.moveTo(x, y);
        else gx.lineTo(x, y);
      }
      gx.strokeStyle = 'rgba(255,255,255,0.06)';
      gx.lineWidth = 3;
      gx.stroke();
    }
    const o = other(m.p);
    text(gx, '🙈', W / 2, 150, { size: 64 });
    text(gx, `${this.ctx.players[o].name}, look away!`, W / 2, 222, { size: 20, color: COLORS.dim, weight: 700 });
    text(gx, m.next === 'place' ? 'Hide your fleet' : 'Your turn to fire', W / 2, 300, { size: 22, color: '#fff', weight: 700 });
    text(gx, pl.name, W / 2, 344, { size: 40, color: pl.color, stroke: 'rgba(0,0,0,0.4)' });
    const s = 1 + 0.05 * Math.sin(this.t * 5);
    rrect(gx, W / 2 - 140 * s, 410, 280 * s, 70, 35, pl.color, '#fff', 3);
    text(gx, `Tap when only ${pl.name}`, W / 2, 432, { size: 19, color: inkOn(pl.color) });
    text(gx, 'is looking 👀', W / 2, 458, { size: 19, color: inkOn(pl.color) });
    const n = this.notice[m.p];
    if (m.next === 'fire' && this.game.turnNo[o] > 0) {
      const lg = this.turnLog[o];
      const res = lg.sunk ? `They sank a ship of yours!` : lg.hits ? `They hit you ${lg.hits === 1 ? 'once' : lg.hits + ' times'}.` : 'They missed!';
      text(gx, res, W / 2, 530, { size: 18, color: lg.hits ? '#ffb08a' : '#bfe9ff', weight: 700 });
    }
    if (n) text(gx, n, W / 2, 566, { size: 14, color: COLORS.gold, weight: 700 });
  }

  private drawPlay(gx: G): void {
    const g = this.game;
    const m = this.mode;
    const v = this.viewer;
    const lay = this.layout();
    const vc = this.ctx.players[v].color;
    // Deep sea background with the viewer's colour at their edge.
    const grd = gx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#0a1838');
    grd.addColorStop(1, shade(vc, -0.7));
    gx.fillStyle = grd;
    gx.fillRect(0, 0, W, H);

    // Header
    // The bot's turn ends a beat before the view hands over, so name the seat on screen, not g.turn.
    const a = m.kind === 'place' || m.kind === 'bot' || m.kind === 'after' ? m.p : g.turn;
    const an = this.ctx.players[a].name;
    let title = '';
    let sub = '';
    if (m.kind === 'place') {
      title = `${an}, hide your fleet`;
      sub = 'Tap a ship to turn it · drag to move it';
    } else if (m.kind === 'fire') {
      title = this.armed === 'mine' ? 'Hide a mine' : `${an}, fire!`;
      sub = this.armed === 'radar' ? 'Tap a spot to scan 3×3, tap again to scan' : this.armed === 'airstrike' ? 'Pick a row spot, tap again to strike 5 cells' : this.armed === 'mine' ? 'Tap empty water in your sea, tap again to hide it' : g.shotsLeft > 1 ? `Bonus: ${g.shotsLeft} shots this turn! Tap, tap again to fire` : 'Tap a square, tap it again to fire';
    } else if (m.kind === 'bot') {
      const landed = g.turn !== m.p && this.shells.length === 0;
      title = landed ? botResultTitle(an, this.turnLog[m.p], lay.bigShips) : `${an} is aiming…`;
      sub = landed && lay.bigShips ? 'Look where it landed' : lay.bigShips ? 'Watch your fleet!' : `Firing at ${this.ctx.players[other(a)].name}`;
    } else if (m.kind === 'after') {
      const lg = this.turnLog[m.p];
      title = lg.sunk ? 'You sank a ship!' : lg.hits ? 'Direct hit!' : 'Missed…';
      sub = this.twoHumans ? 'Now pass the phone' : '';
    } else if (m.kind === 'over') {
      const w = g.winner ?? 0;
      title = `${this.ctx.players[w].name} wins! 🏆`;
      sub = 'Every ship sunk. Here is where they all were:';
    }
    const tc = m.kind === 'over' ? this.ctx.players[g.winner ?? 0].color : this.ctx.players[a].color;
    rrect(gx, 12, 8, W - 24, 62, 18, alpha(tc, 0.28), alpha(tc, 0.9), 2);
    text(gx, title, W / 2, 30, { size: 22, color: '#fff', stroke: 'rgba(0,0,0,0.35)' });
    text(gx, sub, W / 2, 55, { size: 13, color: COLORS.dim, weight: 700 });

    // Big grid
    this.drawSea(gx, lay.big, GX, GY, C, lay.bigShips, true);
    // Aim / power previews
    if (m.kind === 'fire' && this.aim !== null) this.drawAim(gx, this.aim, this.armed, this.ctx.players[a].color);
    // A bot's mine goes in its own (hidden) sea, so its aim is never drawn.
    if (m.kind === 'bot' && m.aim && m.aim.kind !== 'mine') this.drawAim(gx, m.aim.cell, m.aim.kind === 'fire' ? null : m.aim.kind, this.ctx.players[a].color);

    if (m.kind === 'place') {
      this.drawPlaceUi(gx, m.p);
      return;
    }
    // Where the bot's shots just landed on your fleet, ringed until the hand-over.
    if (m.kind === 'bot' && g.turn !== m.p && this.shells.length === 0 && lay.big === v) {
      const ring = alpha(this.ctx.players[m.p].color, 0.95);
      for (const c of this.lastShots[lay.big]) {
        const [cx, cy] = this.cellXY(c);
        const r = C / 2 + 3 + 2.5 * Math.sin(this.t * 7);
        circle(gx, cx, cy, r + 2, undefined, 'rgba(0,0,0,0.55)', 4);
        circle(gx, cx, cy, r, undefined, ring, 3);
      }
    }
    // Fleet status of the big sea
    const bigSea = g.seas[lay.big];
    text(gx, lay.big === v ? 'Your ships' : 'Their ships', GX, GY + N * C + 20, { size: 13, color: COLORS.dim, align: 'left', weight: 700 });
    let x = GX + 86;
    bigSea.ships.forEach((s) => {
      const w = s.len * 9;
      rrect(gx, x, GY + N * C + 14, w, 12, 6, isSunk(s) ? 'rgba(255,255,255,0.15)' : alpha(this.ctx.players[lay.big].color, 0.85));
      if (isSunk(s)) line(gx, x, GY + N * C + 20, x + w, GY + N * C + 20, COLORS.bad, 2);
      x += w + 8;
    });
    // Small grid
    text(gx, lay.small === v ? 'Your fleet' : `${this.ctx.players[lay.small].name}'s fleet`, SX, SY - 12, { size: 13, color: COLORS.dim, align: 'left', weight: 700 });
    this.drawSea(gx, lay.small, SX, SY, SC, lay.smallShips, false);
    for (const c of this.lastShots[lay.small]) {
      if (lay.small !== v || m.kind === 'over') break;
      const cx = SX + (c % N) * SC + SC / 2;
      const cy = SY + Math.floor(c / N) * SC + SC / 2;
      circle(gx, cx, cy, SC / 2 + 2 + 1.5 * Math.sin(this.t * 6), undefined, alpha(this.ctx.players[other(v)].color, 0.9), 2);
    }
    // Right panel: score + power
    const sunkBy = (p: PlayerIndex) => g.score[p];
    text(gx, 'Ships sunk', 264, 594, { size: 13, color: COLORS.dim, weight: 700 });
    text(gx, `${sunkBy(v)} – ${sunkBy(other(v))}`, 264, 570, { size: 26, color: '#fff' });
    text(gx, `you`, 236, 548, { size: 13, color: alpha(vc, 0.9) });
    text(gx, `them`, 292, 548, { size: 13, color: alpha(this.ctx.players[other(v)].color, 0.9) });
    const btn = this.powerBtn[v];
    if (btn && m.kind !== 'over') {
      if (this.armed && m.kind === 'fire') {
        glow(gx, COLORS.gold, 20);
        circle(gx, btn.button.x, btn.button.y, 34, undefined, COLORS.gold, 3);
        noGlow(gx);
      }
      btn.render(gx, g.energy[v], this.t);
      const pw = this.ctx.players[v].power!;
      const ready = g.energy[v].ready;
      const mine = m.kind === 'fire' && m.p === v;
      text(gx, ready ? (this.armed ? 'Tap to cancel' : mine ? `Tap: ${pw.name}!` : `${pw.name} ready`) : pw.name, 264, 517, { size: 13, color: ready ? COLORS.gold : COLORS.dim, weight: 800 });
    }
    // Notice for the viewer
    const n = this.notice[v];
    if (n && m.kind !== 'over') {
      rrect(gx, 12, 606, W - 24, 28, 10, 'rgba(0,0,0,0.4)');
      text(gx, n, W / 2, 620, { size: 13, color: COLORS.gold, weight: 700 });
    }
    // Shells in flight
    for (const s of this.shells) {
      if (s.t < 0) continue;
      const [tx, ty] = this.cellPos(s.owner, s.cell);
      const k = clamp(s.t / SHOT_T, 0, 1);
      const sy = ty - (1 - k) * 160;
      const sz = this.layout().big === s.owner ? 1 : 0.5;
      circle(gx, tx, ty, 4 + 10 * (1 - k) * sz, undefined, 'rgba(255,255,255,0.5)', 2);
      circle(gx, tx, sy, 6 * sz + 2, '#2b2b3a', '#fff', 2);
    }
  }

  private drawAim(gx: G, cell: number, kind: string | null, color: string): void {
    const cells = kind === 'radar' ? radarCells(cell) : kind === 'airstrike' ? strikeCells(cell) : [cell];
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 8);
    for (const c of cells) {
      const x = GX + (c % N) * C;
      const y = GY + Math.floor(c / N) * C;
      rrect(gx, x + 2, y + 2, C - 4, C - 4, 6, alpha(kind ? '#ffd54a' : color, 0.25 + 0.2 * pulse), kind ? COLORS.gold : '#fff', 2);
    }
    const [x, y] = this.cellXY(cell);
    line(gx, x - 12, y, x - 5, y, '#fff', 2);
    line(gx, x + 5, y, x + 12, y, '#fff', 2);
    line(gx, x, y - 12, x, y - 5, '#fff', 2);
    line(gx, x, y + 5, x, y + 12, '#fff', 2);
  }

  private drawSea(gx: G, owner: PlayerIndex, x0: number, y0: number, c: number, showShips: boolean, big: boolean): void {
    const g = this.game;
    const sea = g.seas[owner];
    const size = N * c;
    const viewer = this.viewer;
    const attacker = other(owner);
    rrect(gx, x0 - 4, y0 - 4, size + 8, size + 8, big ? 12 : 6, '#0d3a6b', alpha(this.ctx.players[owner].color, 0.8), big ? 3 : 2);
    const wave = gx.createLinearGradient(x0, y0, x0 + size, y0 + size);
    wave.addColorStop(0, '#11508f');
    wave.addColorStop(1, '#0b3566');
    gx.fillStyle = wave;
    gx.fillRect(x0, y0, size, size);
    for (let k = 1; k < N; k++) {
      line(gx, x0 + k * c, y0, x0 + k * c, y0 + size, 'rgba(255,255,255,0.1)', 1);
      line(gx, x0, y0 + k * c, x0 + size, y0 + k * c, 'rgba(255,255,255,0.1)', 1);
    }
    // Radar knowledge of the attacker who is looking at this sea
    if (attacker === viewer || this.mode.kind === 'bot') {
      for (const r of g.radar[attacker]) {
        const box = radarCells(r.cell);
        const bx = x0 + (box[0] % N) * c;
        const by = y0 + Math.floor(box[0] / N) * c;
        if (r.found) {
          gx.setLineDash([5, 4]);
          rrect(gx, bx + 1, by + 1, c * 3 - 2, c * 3 - 2, 6, alpha('#ffd54a', 0.12), COLORS.gold, 2);
          gx.setLineDash([]);
        } else for (const cc of box) if (sea.marks[cc] === MARK.none) circle(gx, x0 + (cc % N) * c + c / 2, y0 + Math.floor(cc / N) * c + c / 2, c * 0.08, 'rgba(191,233,255,0.5)');
      }
    }
    // Ships
    const hidden = new Set(this.shells.filter((s) => s.owner === owner && s.t < SHOT_T).map((s) => s.cell));
    sea.ships.forEach((s, i) => {
      const sunkShown = isSunk(s) && cellsOf(s).every((cc) => !hidden.has(cc));
      if (!showShips && !sunkShown) return;
      const drag = this.drag && this.mode.kind === 'place' && big && i === this.drag.i && this.drag.moved ? this.drag : null;
      let sx = x0 + s.x * c;
      let sy = y0 + s.y * c;
      if (drag) {
        sx = drag.x - (drag.offX + 0.5) * c;
        sy = drag.y - (drag.offY + 0.5) * c;
      }
      const w = (s.horiz ? s.len : 1) * c;
      const h = (s.horiz ? 1 : s.len) * c;
      const col = this.ctx.players[owner].color;
      const inset = big ? 3 : 1.5;
      if (drag) glow(gx, '#fff', 16);
      rrect(gx, sx + inset, sy + inset, w - inset * 2, h - inset * 2, (Math.min(w, h) - inset * 2) / 2, sunkShown ? 'rgba(40,40,60,0.9)' : shade(col, -0.15), sunkShown ? alpha(col, 0.9) : shade(col, 0.35), big ? 2.5 : 1.5);
      noGlow(gx);
      if (big)
        for (let k = 0; k < s.len; k++) {
          const px = sx + (s.horiz ? k * c + c / 2 : c / 2);
          const py = sy + (s.horiz ? c / 2 : k * c + c / 2);
          circle(gx, px, py, 3.2, sunkShown ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.65)');
        }
    });
    // Mines (only the owner sees them)
    if (owner === viewer && this.mode.kind !== 'cover')
      for (const mc of sea.mines) text(gx, '💥', x0 + (mc % N) * c + c / 2, y0 + Math.floor(mc / N) * c + c / 2, { size: big ? 16 : 9, alpha: 0.75 });
    // Marks
    for (let i = 0; i < N * N; i++) {
      const mk = sea.marks[i];
      if (mk === MARK.none || hidden.has(i)) continue;
      const cx = x0 + (i % N) * c + c / 2;
      const cy = y0 + Math.floor(i / N) * c + c / 2;
      if (mk === MARK.miss) {
        circle(gx, cx, cy, c * 0.16, 'rgba(220,240,255,0.85)');
        if (big) circle(gx, cx, cy, c * 0.3, undefined, 'rgba(220,240,255,0.25)', 1.5);
      } else if (mk === MARK.mine) {
        circle(gx, cx, cy, c * 0.36, 'rgba(255,176,32,0.35)', '#ffb020', 1.5);
        text(gx, '💥', cx, cy, { size: big ? 16 : 8 });
      } else {
        const s = sea.ships[sea.occ[i]];
        glow(gx, '#ff8a3d', big ? 10 : 4);
        circle(gx, cx, cy, c * 0.3, isSunk(s) ? '#c0392b' : '#ff6a2b', '#ffd54a', big ? 2 : 1);
        noGlow(gx);
        if (big) {
          line(gx, cx - 5, cy - 5, cx + 5, cy + 5, '#fff', 2.5);
          line(gx, cx + 5, cy - 5, cx - 5, cy + 5, '#fff', 2.5);
        }
      }
    }
  }

  private drawPlaceUi(gx: G, p: PlayerIndex): void {
    const col = this.ctx.players[p].color;
    rrect(gx, SHUFFLE.x, SHUFFLE.y + 4, SHUFFLE.w, SHUFFLE.h, 18, 'rgba(0,0,0,0.35)');
    rrect(gx, SHUFFLE.x, SHUFFLE.y, SHUFFLE.w, SHUFFLE.h, 18, '#2b4c8c', 'rgba(255,255,255,0.5)', 2);
    text(gx, '🔀 Shuffle', SHUFFLE.x + SHUFFLE.w / 2, SHUFFLE.y + SHUFFLE.h / 2, { size: 20, color: '#fff' });
    const s = 1 + 0.04 * Math.sin(this.t * 5);
    rrect(gx, READY.x, READY.y + 4, READY.w, READY.h, 18, 'rgba(0,0,0,0.35)');
    rrect(gx, READY.x - (s - 1) * 70, READY.y, READY.w * s, READY.h, 18, col, '#fff', 3);
    text(gx, 'Ready ✓', READY.x + READY.w / 2, READY.y + READY.h / 2, { size: 22, color: '#fff', stroke: 'rgba(0,0,0,0.3)' });
    text(gx, 'Shuffle until you like it, then Ready.', W / 2, 500, { size: 14, color: COLORS.dim, weight: 700 });
    text(gx, this.twoHumans ? 'No peeking: the phone hides your sea' : 'The bot never sees your ships.', W / 2, 524, { size: 14, color: COLORS.dim, weight: 700 });
    text(gx, 'before it is passed on.', W / 2, 544, { size: 14, color: this.twoHumans ? COLORS.dim : 'transparent', weight: 700 });
    // Fleet legend
    let x = 46;
    SHIPS.forEach((len) => {
      rrect(gx, x, 584, len * 11, 14, 7, alpha(col, 0.85), shade(col, 0.35), 1.5);
      x += len * 11 + 9;
    });
  }
}

const def: GameDef = { id: 'seabattle', create: (ctx) => new SeaBattleView(ctx) };
export default def;
