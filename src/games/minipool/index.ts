// Mini Pool view: the phone lies flat, the table runs end to end, each player shoots
// from their own half. Pull back anywhere in your half and let go: the cue ball goes the
// other way, harder the further you pulled (the same slingshot as Minigolf).
import { other, PLAYERS, type PlayerIndex } from '../../core/types';
import { waitingLine } from '../../core/turnline';
import { alpha, circle, COLORS, facing, fitFirst, line, rrect, shade, silentSeat, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { PowerButton, powerSpot } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { MiniPool, MiniPoolBot, RULES, type Intent, type Shot } from './logic';
import { castAim, PHYS, POCKETS, pocketR, TABLE, tracePaths, type Ball } from './physics';

const FLOOR = '#1a1626';
const CLOTH = '#1f8f6a';
const RAIL = '#6b3f22';
/** The colours most of the play area is painted in (tests read pops against them). */
export const SURFACES: readonly string[] = [CLOTH, FLOOR];
const ICE = '#9fe3ff';

/** Screen units of pull for a full-power shot, and the least pull that counts. */
const MAX_PULL = 130;
const MIN_PULL = 14;
const STRIP = 62;
const STRIP_CARD = 'rgba(10,12,28,0.85)';
const CARD = 'rgba(10,12,28,0.88)';
/** The "3 2 1" digit sits past the cue ball's spot so it never covers the ball or the rack. */
const COUNT_DY = 190;

type Aim = { id: number; sx: number; sy: number; x: number; y: number };

class MiniPoolView implements GameInstance {
  readonly game: MiniPool;
  private bots: (MiniPoolBot | null)[];
  readonly powerBtns: (PowerButton | null)[];
  private aim: (Aim | null)[] = [null, null];
  private keyAim = [
    { angle: -Math.PI / 2, power: 0.6, on: false },
    { angle: Math.PI / 2, power: 0.6, on: false },
  ];
  private t = 0;
  private lastHitSfx = 0;
  private lastCushionSfx = 0;
  /** Pocket flashes: index → time left. */
  private pocketFlash: number[] = POCKETS.map(() => 0);
  /** Balls on their way down a pocket: shrink and fade where they dropped. */
  private sinking: { b: Ball; x: number; y: number; t: number }[] = [];
  /** Where each ball was last frame (sinking balls keep drawing from there). */
  private trail: { x: number; y: number }[] = [];
  private ended = false;

  constructor(private readonly ctx: GameContext) {
    this.game = new MiniPool(ctx.players, ctx.powersOn, ctx.rng, ctx.starter);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new MiniPoolBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      const [x, y] = powerSpot(p, 38, 31, !!ctx.players[p].lefty);
      return new PowerButton(x, y, p, pw, ctx.players[p].color, silentSeat(ctx.players, p));
    });
  }

  firstMover(): PlayerIndex | null {
    return this.game.firstBreaker;
  }

  countdownDy(): number {
    return COUNT_DY;
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    const before = g.balls.map((b) => ({ x: b.x, y: b.y }));
    const intents = PLAYERS.map((p): Intent => {
      const bot = this.bots[p];
      if (bot) return bot.think(g, dt);
      const btn = this.powerBtns[p];
      const fire = btn ? btn.update(input, g.energy[p], KEYS[p].power) && g.canFire(p) : false;
      return { shot: this.humanShot(p, input), power: fire };
    }) as [Intent, Intent];
    g.step(dt, intents);
    this.trail = before;
    for (let i = 0; i < this.pocketFlash.length; i++) this.pocketFlash[i] = Math.max(0, this.pocketFlash[i] - dt);
    for (const s of this.sinking) s.t += dt;
    this.sinking = this.sinking.filter((s) => s.t < 0.35);
    this.juice();
  }

  /** A person's pull (or keys) this frame; a shot on release. */
  private humanShot(p: PlayerIndex, input: Input): Shot | null {
    const g = this.game;
    if (g.phase !== 'aim' || g.shooter !== p) {
      this.aim[p] = null;
      this.keyAim[p].on = false;
      return null;
    }
    const btn = this.powerBtns[p];
    let a = this.aim[p];
    if (!a) {
      const f = input.of(p).find((f) => f.pressed && !(btn && btn.button.hit(f.x, f.y)));
      if (f) a = this.aim[p] = { id: f.id, sx: f.x, sy: f.y, x: f.x, y: f.y };
    }
    if (a) {
      const f = input.pointers.get(a.id);
      if (f) {
        a.x = f.x;
        a.y = f.y;
      }
      if (!f || !f.down) {
        this.aim[p] = null;
        return pullShot(a);
      }
      return null;
    }
    // Desktop keys: left/right turn the aim, up/down set power, action shoots.
    const k = KEYS[p];
    const ka = this.keyAim[p];
    if (input.key(k.left)) ((ka.angle -= 0.03), (ka.on = true));
    if (input.key(k.right)) ((ka.angle += 0.03), (ka.on = true));
    if (input.key(k.up)) ((ka.power = Math.min(1, ka.power + 0.012)), (ka.on = true));
    if (input.key(k.down)) ((ka.power = Math.max(RULES.minPower, ka.power - 0.012)), (ka.on = true));
    if (ka.on && input.keyPressed(k.action)) {
      ka.on = false;
      return { angle: ka.angle, power: ka.power };
    }
    return null;
  }

  /** The shot being lined up right now (for the guide and the cue stick), if any. */
  pendingShot(): Shot | null {
    const g = this.game;
    if (g.phase !== 'aim') return null;
    const a = this.aim[g.shooter];
    if (a) return pullShot(a);
    const ka = this.keyAim[g.shooter];
    return ka.on ? { angle: ka.angle, power: ka.power } : null;
  }

  // ---------- juice ----------
  private juice(): void {
    const g = this.game;
    const { sfx, fx, players } = this.ctx;
    // A pop for each seat, near their own edge, rising toward the middle.
    const pop = (p: PlayerIndex, str: string, color: string, size = 24, dy = 150) =>
      fx.pop(str, W / 2, p === 0 ? MID + dy : MID - dy, color, p, size);
    const both = (str: string, color: string, size = 24, dy = 150) => {
      for (const p of PLAYERS) pop(p, str, color, size, dy);
    };
    for (const e of g.events) {
      if (e.type === 'rack') sfx.play('whoosh');
      else if (e.type === 'turn') {
        sfx.play('pop');
        if (e.again && !silentSeat(players, e.p)) pop(e.p, 'Go again!', players[e.p].color, 22, 190);
      } else if (e.type === 'shot') {
        sfx.play('hit');
        fx.burst(e.x, e.y, '#ffffff', Math.round(4 + e.power * 10), 80 + e.power * 160, 2.5);
        if (e.power > 0.85) fx.shake(3, 0.12);
      } else if (e.type === 'hit') {
        if (this.t - this.lastHitSfx > 0.05 && e.speed > 40) {
          sfx.play(e.speed > 500 ? 'thud' : 'click');
          this.lastHitSfx = this.t;
        }
        if (e.speed > 300) fx.burst(e.x, e.y, '#ffffff', Math.round(2 + e.speed / 150), 60 + e.speed * 0.15, 2);
      } else if (e.type === 'cushion') {
        if (this.t - this.lastCushionSfx > 0.06 && e.speed > 60) {
          sfx.play('bounce');
          this.lastCushionSfx = this.t;
        }
      } else if (e.type === 'pocket') {
        this.pocketFlash[e.pocket] = 0.6;
        const was = this.trail[e.id] ?? { x: e.x, y: e.y };
        this.sinking.push({ b: { ...g.balls[e.id] }, x: (was.x + e.x) / 2, y: (was.y + e.y) / 2, t: 0 });
        const col = this.ballColor(g.balls[e.id]);
        if (e.kind === 'cue') {
          sfx.play('buzz');
          fx.burst(e.x, e.y, '#ffffff', 12, 140, 3);
        } else if (e.kind === 'eight') {
          sfx.play('thud');
          fx.burst(e.x, e.y, COLORS.gold, 24, 260, 4);
          fx.shake(7, 0.35);
        } else {
          sfx.play('coin');
          fx.burst(e.x, e.y, col, 16, 220, 3.5);
          fx.burst(e.x, e.y, '#ffffff', 6, 140, 2.5);
          fx.shake(3, 0.15);
          if (e.kind === g.shooter) {
            const left = g.left(e.kind);
            if (!silentSeat(players, e.kind)) pop(e.kind, left ? `${left} to go!` : 'Now the 8!', col, 24);
          } else if (!silentSeat(players, e.kind)) pop(e.kind, 'One of yours! ✓', col, 20);
        }
      } else if (e.type === 'retry') {
        // Head start: a plain miss forgiven, so the helped player shoots again.
        if (!silentSeat(players, e.p)) pop(e.p, e.left ? `Another go! (${e.left} left)` : 'Another go!', players[e.p].color, 22);
      } else if (e.type === 'scratch') {
        both('Scratch! Turn over', '#ffffff', 22);
        fx.shake(4, 0.2);
      } else if (e.type === 'power') {
        sfx.play('power');
        const pw = players[e.p].power!;
        fx.flash('#ffd54a', 0.15);
        both(`${pw.icon} ${pw.name}!`, COLORS.gold, 24, 110);
      } else if (e.type === 'frozen') {
        sfx.play('chop');
        const b = g.balls[e.id];
        fx.burst(b.x, b.y, ICE, 18, 160, 3);
      } else if (e.type === 'rackWon') {
        sfx.play('win');
        fx.flash(COLORS.gold, 0.25);
        const name = players[e.p].name;
        const lines: Record<string, string> = {
          eight: `${name} sank the 8!`,
          early8: 'The 8 went down too soon!',
          scratch8: 'Scratch on the 8!',
          cap: `${name} has fewer left`,
        };
        both(lines[e.how], e.how === 'eight' ? COLORS.gold : '#ffffff', 24, 60);
      } else if (e.type === 'win' && !this.ended) {
        this.ended = true;
        const score = this.resultScore();
        const how = g.lastRack?.how;
        const loser = this.ctx.players[other(e.p)].name;
        const summary = how === 'eight' ? 'Sank the 8' : how === 'cap' ? 'Fewer balls left' : `${loser} sank the 8 too soon`;
        this.ctx.end({ winner: e.p, score, summary: how === 'scratch8' ? `${loser} scratched on the 8` : summary, unit: 'balls sunk' });
      }
    }
  }

  /** Each player's own balls off the table, and the 8 for whoever won with it. */
  resultScore(): [number, number] {
    const g = this.game;
    const s = PLAYERS.map((p) => RULES.ballsEach - g.left(p)) as [number, number];
    if (g.winner !== null && g.lastRack?.how === 'eight') s[g.winner]++;
    return s;
  }

  private ballColor(b: Ball): string {
    if (b.kind === 'cue') return '#f7f4ea';
    if (b.kind === 'eight') return '#16141c';
    return this.ctx.players[b.kind].color;
  }

  // ---------- render ----------
  render(gx: G): void {
    const g = this.game;
    gx.fillStyle = FLOOR;
    gx.fillRect(0, 0, W, H);
    this.drawTable(gx);
    this.drawGuide(gx);
    for (const s of this.sinking) {
      const k = 1 - s.t / 0.35;
      gx.globalAlpha = k;
      this.drawBall(gx, s.b, s.x, s.y, PHYS.r * (0.5 + 0.5 * k));
      gx.globalAlpha = 1;
    }
    for (const b of g.balls) if (b.on) this.drawBall(gx, b, b.x, b.y, PHYS.r);
    this.drawCue(gx);
    for (const p of PLAYERS) facing(gx, p, W / 2, MID, () => this.drawStrip(gx, p));
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, g.energy[p], this.t);
    const seats = PLAYERS.filter((p) => !silentSeat(this.ctx.players, p));
    if (g.phase === 'intro') for (const p of seats) facing(gx, p, W / 2, MID, () => this.drawIntro(gx, p));
  }

  private drawTable(gx: G): void {
    const g = this.game;
    const { left, right, top, bottom } = TABLE;
    const rail = 16;
    rrect(gx, left - rail, top - rail, right - left + rail * 2, bottom - top + rail * 2, 14, RAIL);
    rrect(gx, left - rail + 3, top - rail + 3, right - left + rail * 2 - 6, bottom - top + rail * 2 - 6, 12, undefined, shade(RAIL, 0.25), 2);
    gx.fillStyle = CLOTH;
    gx.fillRect(left, top, right - left, bottom - top);
    // Each half's end, faintly tinted in its owner's colour.
    for (const p of PLAYERS) {
      gx.fillStyle = alpha(this.ctx.players[p].color, 0.07);
      gx.fillRect(left, p === 0 ? MID : top, right - left, p === 0 ? bottom - MID : MID - top);
    }
    line(gx, left, MID, right, MID, 'rgba(255,255,255,0.14)', 2);
    // Diamonds on the rails.
    gx.fillStyle = 'rgba(255,240,210,0.6)';
    for (let k = 1; k < 4; k++) {
      const x = left + ((right - left) * k) / 4;
      gx.fillRect(x - 1.5, top - rail / 2 - 1.5, 3, 3);
      gx.fillRect(x - 1.5, bottom + rail / 2 - 1.5, 3, 3);
    }
    // The cue ball's spot in each half.
    for (const p of PLAYERS) {
      const s = MiniPool.spot(p);
      circle(gx, s.x, s.y, 2.5, 'rgba(255,255,255,0.3)');
    }
    // Pockets: bigger (and gold-rimmed) while Big Pockets or the handicap helps the shooter.
    const shooting = g.phase === 'aim' || g.phase === 'roll' || g.phase === 'settle';
    const mods = g.phase === 'roll' || g.phase === 'settle' ? g.shotMods : g.modsFor(g.shooter);
    const big = shooting && (g.phase === 'aim' ? g.bigPocket[g.shooter] : mods.pocketBonus >= RULES.bigPocket);
    POCKETS.forEach((pk, i) => {
      const r = shooting ? pocketR(pk, mods) : pocketR(pk, { pocketBonus: 0, frozenId: null });
      const drawR = r - 3;
      circle(gx, pk.x, pk.y, drawR + 3, '#2a1a0e');
      circle(gx, pk.x, pk.y, drawR, '#07060a');
      if (big) circle(gx, pk.x, pk.y, drawR + 1, undefined, alpha(COLORS.gold, 0.6 + 0.3 * Math.sin(this.t * 6)), 3);
      if (this.pocketFlash[i] > 0) circle(gx, pk.x, pk.y, drawR + 6 * (1 - this.pocketFlash[i]), undefined, alpha('#ffffff', this.pocketFlash[i]), 3);
    });
  }

  private drawBall(gx: G, b: Ball, x: number, y: number, r: number): void {
    const g = this.game;
    const col = this.ballColor(b);
    circle(gx, x + 1.5, y + 2, r, 'rgba(0,0,0,0.3)');
    circle(gx, x, y, r, col, b.kind === 'eight' ? '#55506a' : shade(col, -0.35), 1.5);
    if (b.kind === 0 || b.kind === 1) circle(gx, x, y, r * 0.45, '#ffffff');
    if (b.kind === 'eight') {
      circle(gx, x, y, r * 0.5, '#ffffff');
      gx.fillStyle = '#16141c';
      gx.font = `900 ${Math.round(r * 0.8)}px system-ui, sans-serif`;
      gx.textAlign = 'center';
      gx.textBaseline = 'middle';
      gx.fillText('8', x, y + 0.5);
    }
    circle(gx, x - r * 0.35, y - r * 0.35, r * 0.22, 'rgba(255,255,255,0.55)');
    // The ball a player should sink next glows on their shot (helps small kids).
    if (g.phase === 'aim' && b.on && b.id === g.frozenId) {
      circle(gx, x, y, r + 3, alpha(ICE, 0.35), ICE, 2.5);
      text(gx, '❄', x, y, { size: 12, color: '#ffffff', player: g.shooter });
    }
  }

  /** The cue stick behind the cue ball, pulled back as far as the shot is strong. */
  private drawCue(gx: G): void {
    const g = this.game;
    const s = this.pendingShot();
    if (!s || !g.cue.on) return;
    const c = g.cue;
    const dx = Math.cos(s.angle);
    const dy = Math.sin(s.angle);
    const back = PHYS.r + 4 + s.power * 46;
    const x1 = c.x - dx * back;
    const y1 = c.y - dy * back;
    const x2 = c.x - dx * (back + 115);
    const y2 = c.y - dy * (back + 115);
    line(gx, x1, y1, x2, y2, '#3b2414', 7);
    line(gx, x1, y1, x2, y2, '#e6c690', 5);
    line(gx, x1, y1, x1 - dx * 6, y1 - dy * 6, '#5aa0ff', 5);
    // Power: the stick's far end tints from white to the shooter's colour.
    line(gx, x2 + dx * 30, y2 + dy * 30, x2, y2, shade(this.ctx.players[g.shooter].color, -0.1), 6);
  }

  private drawGuide(gx: G): void {
    const g = this.game;
    const s = this.pendingShot();
    if (!s || !g.cue.on) return;
    const p = g.shooter;
    const c = g.cue;
    const col = 'rgba(255,255,255,0.75)';
    if (g.longAim[p]) {
      // Long Aim: the real paths, bounces and all.
      const tr = tracePaths(g.balls, s.angle, s.power, g.modsFor(p), 1 / 60);
      gx.setLineDash([6, 5]);
      this.path(gx, tr.cue, 'rgba(255,255,255,0.85)');
      if (tr.hitId !== null) this.path(gx, tr.hit, alpha(COLORS.gold, 0.9));
      gx.setLineDash([]);
      return;
    }
    const len = g.guideLen(p);
    const hit = castAim(g.balls, s.angle, len);
    gx.setLineDash([6, 5]);
    line(gx, c.x, c.y, hit.x, hit.y, col, 2);
    gx.setLineDash([]);
    const reached = Math.hypot(hit.x - c.x, hit.y - c.y) < len - 0.5;
    if (reached && hit.hit) {
      circle(gx, hit.x, hit.y, PHYS.r, undefined, col, 1.5);
      // Where the ball it hits will head.
      const nx = hit.hit.x - hit.x;
      const ny = hit.hit.y - hit.y;
      const nl = Math.hypot(nx, ny) || 1;
      const out = Math.min(70, len * 0.4);
      line(gx, hit.hit.x, hit.hit.y, hit.hit.x + (nx / nl) * out, hit.hit.y + (ny / nl) * out, alpha(COLORS.gold, 0.85), 2.5);
    }
  }

  private path(gx: G, pts: { x: number; y: number }[], color: string): void {
    if (pts.length < 2) return;
    gx.strokeStyle = color;
    gx.lineWidth = 2;
    gx.beginPath();
    pts.forEach((q, i) => (i ? gx.lineTo(q.x, q.y) : gx.moveTo(q.x, q.y)));
    gx.stroke();
  }

  /** A player's strip at their own end, drawn as seat 0 sees it (facing() turns it for seat 1). */
  private drawStrip(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const pl = this.ctx.players[p];
    const c = pl.color;
    const myTurn = g.phase === 'aim' && g.shooter === p;
    const y0 = H - STRIP;
    gx.fillStyle = myTurn ? alpha(c, 0.28 + 0.08 * Math.sin(this.t * 5)) : STRIP_CARD;
    gx.fillRect(0, y0, W, STRIP);
    gx.fillStyle = c;
    gx.fillRect(0, y0, W, myTurn ? 4 : 2);
    gx.fillRect(0, H - 3, W, 3);
    const btn = this.powerBtns[p];
    const lefty = !!btn && !!pl.lefty;
    // Name and status on the left (right of a power button), balls left on the right.
    const x0 = btn && !lefty ? 74 : 20;
    const quiet = silentSeat(this.ctx.players, p);
    let status: string;
    let sc: string = COLORS.dim;
    let shorter: string[] = [];
    if (g.phase === 'over') status = 'Rack over';
    else if (g.phase === 'intro') status = g.breaker === p ? (quiet ? 'Breaks' : 'You break!') : `${this.ctx.players[other(p)].name} breaks`;
    else if (myTurn) {
      status = this.bots[p] ? 'Lining up…' : g.left(p) ? 'Your shot! Pull back, let go' : 'Your shot! Sink the 8';
      if (!this.bots[p]) shorter = g.left(p) ? ['Pull back, let go', 'Your shot!'] : ['Sink the 8!'];
      sc = '#ffffff';
    } else if (g.shooter === p) status = 'Rolling…';
    else if (this.bots[other(p)] && g.phase === 'aim') status = waitingLine(this.ctx.players[other(p)]);
    else {
      status = `Wait · ${this.ctx.players[other(p)].name} shoots`;
      shorter = [`${this.ctx.players[other(p)].name} shoots`, 'Wait…'];
    }
    const badges: string[] = [];
    if (g.longAim[p]) badges.push('🔭');
    if (g.bigPocket[p]) badges.push('🕳️');
    if (g.freezeOn[p]) badges.push(quiet ? '❄ frozen' : '❄ on you');
    if (g.retries[p] > 0) badges.push(`↺${g.retries[p]}`);
    // Name, then one dot per ball still on the table (the 8 once they're all down), on the
    // top line; the status gets the whole second line.
    const right = lefty ? W - 74 : W - 16;
    text(gx, pl.name, x0, y0 + 20, { size: 17, color: c, align: 'left', weight: 900 });
    const left = g.left(p);
    for (let i = 0; i < Math.max(1, left); i++) {
      const x = right - 10 - i * 22;
      const y = y0 + 20;
      if (left) {
        circle(gx, x, y, 8, c, shade(c, -0.35), 1.5);
        circle(gx, x, y, 3.5, '#ffffff');
      } else {
        circle(gx, x, y, 8, '#16141c', '#55506a', 1.5);
        circle(gx, x, y, 4, '#ffffff');
      }
    }
    // The longest wording that fits before the far edge (or a left-handed power button).
    const room = (lefty ? W - 74 : W - 16) - x0;
    const tail = badges.length ? ` ${badges.join(' ')}` : '';
    const lines = [status + tail, ...shorter.map((l) => l + tail), (shorter[shorter.length - 1] ?? status) + (badges.length ? ` ${badges[badges.length - 1]}` : '')];
    const fit = fitFirst(gx, lines, room, 14);
    text(gx, fit.str, x0, y0 + 44, { size: fit.size, color: sc, align: 'left' });
  }

  private drawIntro(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const k = Math.min(1, (RULES.introTime - g.timer) / 0.25, g.timer / 0.25);
    const y = MID + 175;
    gx.globalAlpha = Math.max(0, k);
    rrect(gx, 30, y - 34, W - 60, 68, 14, CARD);
    text(gx, `Sink your ${RULES.ballsEach}, then the 8`, W / 2, y - 12, { size: 20, color: this.ctx.players[p].color, weight: 900 });
    text(gx, g.breaker === p ? 'You break first' : `${this.ctx.players[g.breaker].name} breaks first`, W / 2, y + 14, { size: 15, color: '#ffffff' });
    gx.globalAlpha = 1;
  }
}

/** Pull back from where the finger landed: the shot goes the other way. */
function pullShot(a: Aim): Shot | null {
  const dx = a.x - a.sx;
  const dy = a.y - a.sy;
  const d = Math.hypot(dx, dy);
  if (d < MIN_PULL) return null;
  return { angle: Math.atan2(-dy, -dx), power: Math.min(1, d / MAX_PULL) };
}

const def: GameDef = {
  id: 'minipool',
  create: (ctx) => new MiniPoolView(ctx),
};
export default def;
