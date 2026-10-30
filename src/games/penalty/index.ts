// Penalty Shootout view: the pitch from above, a goal at each end. Each kick
// uses the keeper's goal. The shooter swipes; the keeper taps a dive button.
import { PLAYERS, other, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, line, noGlow, rrect, shade, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { Button, PowerButton } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { Penalty, PenaltyBot, RULES, shotFromSwipe, type Dive, type Flight, type Intent, type KickResult, type Shot, type SwipePoint } from './logic';

const DIVE_X = [104, 180, 256];
const DIVE_Y = [H - 52, 52];
const DIVES: Dive[] = [-1, 0, 1];
/** Kick as soon as the finger has travelled this far toward the goal. */
const AUTO_KICK = 150;

class PenaltyView implements GameInstance {
  readonly game: Penalty;
  private bots: (PenaltyBot | null)[];
  private powerBtns: (PowerButton | null)[];
  private diveBtns: Button[][];
  private swipe: { id: number; pts: SwipePoint[] } | null = null;
  private keyAim = W / 2;
  private t = 0;
  private flash = 0;
  private flashColor = '#fff';
  private poof: { x: number; y: number; t: number } | null = null;

  constructor(private readonly ctx: GameContext) {
    this.game = new Penalty(ctx.players, ctx.powersOn, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new PenaltyBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      return p === 0 ? new PowerButton(34, H - 28, 0, pw, ctx.players[0].color) : new PowerButton(W - 34, 28, 1, pw, ctx.players[1].color);
    });
    this.diveBtns = PLAYERS.map((p) => DIVE_X.map((x) => new Button(x, DIVE_Y[p], 28, p, '', ctx.players[p].color, 8)));
    this.announce();
  }

  private toward(): -1 | 1 {
    return this.game.shooter === 0 ? -1 : 1;
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    const intents = PLAYERS.map((p): Intent => {
      const bot = this.bots[p];
      if (bot) return bot.think(g, dt);
      const btn = this.powerBtns[p];
      const fire = btn ? btn.update(input, g.energy[p], KEYS[p].power) && g.canFire(p) : false;
      const k = KEYS[p];
      let dive: Dive | null = null;
      for (let i = 0; i < 3; i++) {
        const b = this.diveBtns[p][i];
        b.update(input);
        if (b.pressed && p === g.keeper) dive = DIVES[i];
      }
      if (p === g.keeper) {
        if (input.keyPressed(k.left)) dive = -1;
        else if (input.keyPressed(k.right)) dive = 1;
        else if (input.keyPressed(k.action)) dive = 0;
      }
      let shot: Shot | null = null;
      if (p === g.shooter) shot = this.shooterInput(p, input, btn);
      return { shot, dive, power: fire };
    }) as [Intent, Intent];
    g.step(dt, intents);
    this.flash = Math.max(0, this.flash - dt);
    if (this.poof) {
      this.poof.t += dt;
      if (this.poof.t > 0.5) this.poof = null;
    }
    this.handleEvents();
  }

  /** Swipe from anywhere in your half toward the goal. Keys: left/right aim, action kicks. */
  private shooterInput(p: PlayerIndex, input: Input, btn: PowerButton | null): Shot | null {
    const g = this.game;
    const k = KEYS[p];
    if (g.phase !== 'aim' && g.phase !== 'ready') {
      this.swipe = null;
      return null;
    }
    if (input.key(k.left)) this.keyAim -= 120 / 60;
    if (input.key(k.right)) this.keyAim += 120 / 60;
    if (g.phase === 'aim' && input.keyPressed(k.action)) return { aimX: this.keyAim, power: 0.7, bow: 0 };
    if (!this.swipe) {
      const f = input.of(p).find((f) => f.pressed && !(btn && btn.button.hit(f.x, f.y)) && !this.diveBtns[p].some((b) => b.hit(f.x, f.y)));
      if (f) this.swipe = { id: f.id, pts: [{ x: f.x, y: f.y, t: this.t }] };
      return null;
    }
    const f = input.pointers.get(this.swipe.id);
    const pts = this.swipe.pts;
    if (f) {
      const last = pts[pts.length - 1];
      if (f.x !== last.x || f.y !== last.y) pts.push({ x: f.x, y: f.y, t: this.t });
    }
    const fwd = (pts[pts.length - 1].y - pts[0].y) * this.toward();
    const lifted = !f || !f.down;
    if (g.phase === 'aim' && (lifted || fwd >= AUTO_KICK)) {
      this.swipe = null;
      return shotFromSwipe(pts, this.toward());
    }
    if (lifted) this.swipe = null;
    return null;
  }

  private announce(): void {
    const g = this.game;
    const { fx } = this.ctx;
    const s = g.shooter;
    const k = g.keeper;
    const ys = (p: PlayerIndex) => (p === 0 ? MID + 70 : MID - 70);
    fx.pop(g.suddenDeath ? 'Sudden death! Your kick' : 'Your kick!', W / 2, ys(s), this.ctx.players[s].color, s, 26);
    fx.pop(g.suddenDeath ? 'Sudden death! Save it' : 'Save it!', W / 2, ys(k), this.ctx.players[k].color, k, 26);
  }

  private handleEvents(): void {
    const g = this.game;
    const { sfx, fx } = this.ctx;
    const col = (p: PlayerIndex) => this.ctx.players[p].color;
    const both = (str: string, color: string, size = 34, dy = 110) => {
      fx.pop(str, W / 2, MID + dy, color, 0, size);
      fx.pop(str, W / 2, MID - dy, color, 1, size);
    };
    for (const e of g.events) {
      if (e.type === 'ready') {
        sfx.play('click');
        this.keyAim = W / 2;
        this.announce();
      } else if (e.type === 'kick') {
        sfx.play('thud');
        sfx.play('whoosh');
        fx.burst(W / 2, g.spotY(), '#9be37a', 10, 140, 3);
        if (e.timeout) both('Too slow!', COLORS.dim, 22, 60);
      } else if (e.type === 'dive') {
        sfx.play('pop');
        if (e.early) {
          const s = g.shooter;
          fx.pop('Keeper moved early!', W / 2, s === 0 ? MID + 40 : MID - 40, COLORS.gold, s, 20);
        }
      } else if (e.type === 'result') {
        const s = e.shooter;
        const k = other(s);
        if (g.decoy) {
          const d = Penalty.at(g.decoy, g.decoy.T);
          this.poof = { x: d.x, y: d.y, t: 0 };
          fx.burst(d.x, d.y, '#e9e4ff', 18, 160, 3);
        }
        if (e.result === 'goal') {
          sfx.play('score');
          fx.shake(9, 0.3);
          fx.flash(col(s));
          fx.burst(e.x, e.y, col(s), 36, 320, 4);
          fx.burst(e.x, e.y, '#ffffff', 14, 220, 3);
          both('GOAL!', COLORS.gold, 44);
          this.flash = 0.9;
          this.flashColor = col(s);
        } else if (e.result === 'saved') {
          sfx.play('hit');
          sfx.play('thud');
          fx.shake(6, 0.2);
          fx.burst(e.x, e.y, col(k), 26, 260, 4);
          both('SAVED!', col(k), 40);
          this.flash = 0.9;
          this.flashColor = col(k);
        } else {
          sfx.play(e.why === 'post' ? 'bounce' : 'buzz');
          if (e.why === 'post') fx.burst(e.x, e.y, '#ffffff', 12, 200, 3);
          both(e.why === 'post' ? 'POST!' : e.why === 'over' ? 'OVER THE BAR!' : 'WIDE!', COLORS.bad, e.why === 'over' ? 30 : 38);
        }
      } else if (e.type === 'power') {
        sfx.play('power');
        const pw = this.ctx.players[e.p].power!;
        fx.flash('#ffd54a', 0.12);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, e.p === 0 ? MID + 30 : MID - 30, COLORS.gold, e.p, 22);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, e.p === 0 ? MID - 30 : MID + 30, COLORS.gold, other(e.p), 22);
      } else if (e.type === 'win') {
        sfx.play('win');
        const summary = e.p === null ? `Draw ${g.score[0]} – ${g.score[1]}` : `${g.score[0]} – ${g.score[1]}${g.kicks.length > RULES.kicks * 2 ? ' (sudden death)' : ''}`;
        this.ctx.end({ winner: e.p, score: [...g.score] as [number, number], summary });
      }
    }
  }

  render(gx: G): void {
    const g = this.game;
    this.renderPitch(gx);
    for (const p of PLAYERS) this.renderGoal(gx, p);
    this.renderKeeper(gx);
    this.renderShooter(gx);
    this.renderBalls(gx);
    this.renderSwipe(gx);
    for (const p of PLAYERS) {
      this.renderTracker(gx, p);
      this.renderDiveButtons(gx, p);
      const btn = this.powerBtns[p];
      if (btn) {
        const usable = g.canFire(p) || g.armed[p] || !g.energy[p].ready;
        gx.globalAlpha = usable ? 1 : 0.45;
        btn.render(gx, g.energy[p], this.t);
        gx.globalAlpha = 1;
      }
    }
    if (this.flash > 0) {
      gx.globalAlpha = this.flash * 0.2;
      rrect(gx, 0, 0, W, H, 0, this.flashColor);
      gx.globalAlpha = 1;
    }
  }

  private renderPitch(gx: G): void {
    const stripes = 10;
    for (let i = 0; i < stripes; i++) {
      gx.fillStyle = i % 2 ? '#2f9e4f' : '#35ab57';
      gx.fillRect(0, (H / stripes) * i, W, H / stripes + 1);
    }
    const c = [this.ctx.players[0].color, this.ctx.players[1].color];
    for (const p of PLAYERS) {
      const grad = gx.createLinearGradient(0, p === 0 ? H : 0, 0, MID);
      grad.addColorStop(0, alpha(c[p], 0.22));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      gx.fillStyle = grad;
      gx.fillRect(0, p === 0 ? MID : 0, W, MID);
    }
    const ln = 'rgba(255,255,255,0.75)';
    rrect(gx, 8, 8, W - 16, H - 16, 4, undefined, ln, 2.5);
    line(gx, 8, MID, W - 8, MID, ln, 2.5);
    circle(gx, W / 2, MID, 44, undefined, ln, 2.5);
    circle(gx, W / 2, MID, 3, ln);
    for (const k of PLAYERS) {
      const gy = RULES.goalY[k];
      const d = k === 1 ? 1 : -1;
      gx.strokeStyle = ln;
      gx.lineWidth = 2.5;
      gx.strokeRect(W / 2 - 130, Math.min(gy, gy + d * 80), 260, 80);
      gx.beginPath();
      gx.arc(W / 2, gy + d * 80, 40, k === 1 ? 0 : Math.PI, k === 1 ? Math.PI : Math.PI * 2);
      gx.stroke();
      circle(gx, W / 2, gy + d * RULES.spotDist, 4, ln);
    }
  }

  private renderGoal(gx: G, k: PlayerIndex): void {
    const g = this.game;
    const active = g.keeper === k && g.phase !== 'done';
    const gw = g.goalW(other(k));
    const gy = RULES.goalY[k];
    const back = k === 1 ? -30 : 30;
    const x0 = W / 2 - gw / 2;
    gx.globalAlpha = active ? 1 : 0.55;
    rrect(gx, x0, Math.min(gy, gy + back), gw, Math.abs(back), 4, 'rgba(255,255,255,0.18)');
    gx.strokeStyle = 'rgba(255,255,255,0.45)';
    gx.lineWidth = 1;
    gx.beginPath();
    for (let x = x0; x <= x0 + gw; x += 10) {
      gx.moveTo(x, gy);
      gx.lineTo(x, gy + back);
    }
    for (let i = 1; i < 3; i++) {
      gx.moveTo(x0, gy + (back * i) / 3);
      gx.lineTo(x0 + gw, gy + (back * i) / 3);
    }
    gx.stroke();
    // Frame: crossbar along the goal line and two posts, in the defender's colour
    const col = this.ctx.players[k].color;
    line(gx, x0, gy, x0 + gw, gy, '#ffffff', 5);
    line(gx, x0, gy, x0, gy + back, shade(col, 0.5), 3);
    line(gx, x0 + gw, gy, x0 + gw, gy + back, shade(col, 0.5), 3);
    circle(gx, x0, gy, 5, '#ffffff', shade(col, -0.3), 2);
    circle(gx, x0 + gw, gy, 5, '#ffffff', shade(col, -0.3), 2);
    gx.globalAlpha = 1;
  }

  private renderKeeper(gx: G): void {
    const g = this.game;
    const k = g.keeper;
    const col = this.ctx.players[k].color;
    const box = g.keeperBox();
    const gy = RULES.goalY[k] + (k === 1 ? 8 : -8);
    const wide = g.armed[k] && this.ctx.players[k].power?.id === 'widekeeper';
    const stretch = g.dive !== null && g.dive !== 0;
    circle(gx, box.x + 3, gy + 5, Math.max(14, box.half * 0.6), 'rgba(0,0,0,0.22)');
    if (wide) glow(gx, COLORS.gold, 18 + 6 * Math.sin(this.t * 10));
    // Arms span the save reach; gloves at the tips
    rrect(gx, box.x - box.half, gy - 5, box.half * 2, 10, 5, shade(col, -0.15));
    noGlow(gx);
    const bodyX = stretch ? box.x + g.dive! * box.half * 0.15 : box.x;
    rrect(gx, bodyX - 14, gy - 10, 28, 20, 9, col, shade(col, -0.4), 2);
    circle(gx, bodyX, gy, 8, '#f3c9a0', '#b98a5e', 1.5);
    circle(gx, box.x - box.half, gy, 7, '#ffe066', '#b8901a', 2);
    circle(gx, box.x + box.half, gy, 7, '#ffe066', '#b8901a', 2);
    if (wide) text(gx, '🧤', box.x, gy + (k === 1 ? 26 : -26), { size: 18, player: k });
  }

  private renderShooter(gx: G): void {
    const g = this.game;
    const s = g.shooter;
    if (g.phase === 'done') return;
    const col = this.ctx.players[s].color;
    const sy = g.spotY() + (s === 0 ? 26 : -26);
    const run = g.phase === 'flight' || g.phase === 'result' ? 12 : 0;
    const y = sy + (s === 0 ? -run : run);
    circle(gx, W / 2 + 3, y + 4, 13, 'rgba(0,0,0,0.25)');
    circle(gx, W / 2, y, 13, col, shade(col, -0.4), 2);
    circle(gx, W / 2, y, 6, '#f3c9a0');
    // Aim clock: a ring around the ball that runs down
    if (g.phase === 'aim') {
      const left = 1 - g.phaseT / g.aimTime();
      gx.beginPath();
      gx.lineWidth = 4;
      gx.lineCap = 'round';
      gx.strokeStyle = left < 0.3 ? COLORS.bad : alpha(col, 0.95);
      const a0 = s === 0 ? -Math.PI / 2 : Math.PI / 2;
      gx.arc(W / 2, g.spotY(), 22, a0, a0 + Math.PI * 2 * left);
      gx.stroke();
      const arrowY = g.spotY() + this.toward() * (34 + 6 * Math.sin(this.t * 6));
      const human = !this.bots[s];
      if (human) {
        facing(gx, s, W / 2, arrowY, () => {
          gx.fillStyle = 'rgba(255,255,255,0.8)';
          gx.beginPath();
          gx.moveTo(W / 2, arrowY - 8);
          gx.lineTo(W / 2 - 9, arrowY + 4);
          gx.lineTo(W / 2 + 9, arrowY + 4);
          gx.fill();
        });
        text(gx, 'Swipe to shoot!', W / 2, g.spotY() - this.toward() * 62, { size: 16, player: s, color: '#fff', stroke: 'rgba(0,0,0,0.4)' });
      }
      if (g.armed[s]) {
        const pw = this.ctx.players[s].power!;
        text(gx, `${pw.icon} ${pw.name} ready`, W / 2, g.spotY() - this.toward() * 86, { size: 14, player: s, color: COLORS.gold, stroke: 'rgba(0,0,0,0.5)' });
        // The keeper sees it coming too.
        const k = g.keeper;
        text(gx, `${pw.icon} ${pw.name} coming!`, W / 2, RULES.goalY[k] + (k === 1 ? 62 : -62), { size: 14, player: k, color: COLORS.gold, stroke: 'rgba(0,0,0,0.5)' });
      }
    }
  }

  private renderBalls(gx: G): void {
    const g = this.game;
    if (g.phase === 'done') return;
    if (g.phase === 'flight' && g.decoy) {
      const d = Penalty.at(g.decoy, Math.min(g.flightT, g.decoy.T));
      this.drawBall(gx, d.x, d.y, d.z);
    }
    this.drawBall(gx, g.ball.x, g.ball.y, g.ball.z);
    if (this.poof) {
      const k = this.poof.t / 0.5;
      circle(gx, this.poof.x, this.poof.y, 10 + 20 * k, `rgba(240,235,255,${0.6 * (1 - k)})`);
      text(gx, '👻', this.poof.x, this.poof.y - 18 * k, { size: 18, alpha: 1 - k });
    }
    if (g.phase === 'flight') {
      const f: Flight = g.flight!;
      // Short trail behind the real ball
      for (let i = 1; i <= 5; i++) {
        const tt = Math.max(0, g.flightT - i * 0.025);
        const p = Penalty.at(f, tt);
        circle(gx, p.x, p.y, RULES.ballR * (1 - i / 7), `rgba(255,255,255,${0.25 - i * 0.04})`);
      }
    }
  }

  private drawBall(gx: G, x: number, y: number, z: number): void {
    const r = RULES.ballR * (1 + z / 110);
    circle(gx, x + z * 0.3, y + z * 0.45, RULES.ballR, `rgba(0,0,0,${Math.max(0.1, 0.3 - z / 300)})`);
    circle(gx, x, y, r, '#ffffff', '#222', 1.5);
    const a = this.t * 4;
    for (let i = 0; i < 3; i++) {
      const ang = a + (i * Math.PI * 2) / 3;
      circle(gx, x + Math.cos(ang) * r * 0.45, y + Math.sin(ang) * r * 0.45, r * 0.25, '#222');
    }
  }

  private renderSwipe(gx: G): void {
    const pts = this.swipe?.pts;
    if (!pts || pts.length < 2) return;
    gx.beginPath();
    gx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) gx.lineTo(p.x, p.y);
    gx.strokeStyle = 'rgba(255,255,255,0.6)';
    gx.lineWidth = 5;
    gx.lineCap = 'round';
    gx.lineJoin = 'round';
    gx.stroke();
  }

  private renderDiveButtons(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const keeping = g.keeper === p && (g.phase === 'aim' || g.phase === 'flight' || g.phase === 'ready');
    const live = keeping && g.dive === null && g.phase !== 'ready';
    const col = this.ctx.players[p].color;
    for (let i = 0; i < 3; i++) {
      const b = this.diveBtns[p][i];
      const chosen = keeping && g.dive === DIVES[i];
      gx.globalAlpha = live || chosen ? 1 : 0.3;
      circle(gx, b.x, b.y + 4, b.r, 'rgba(0,0,0,0.3)');
      if (live) glow(gx, col, 8 + 4 * Math.sin(this.t * 8));
      circle(gx, b.x, b.y, b.held ? b.r * 0.92 : b.r, chosen ? COLORS.gold : col, 'rgba(255,255,255,0.6)', 2);
      noGlow(gx);
      gx.fillStyle = '#fff';
      gx.beginPath();
      const d = DIVES[i];
      if (d === 0) {
        // Jump: an upward chevron toward the shooter
        const s = p === 0 ? -1 : 1;
        gx.moveTo(b.x, b.y + s * 10);
        gx.lineTo(b.x - 10, b.y - s * 6);
        gx.lineTo(b.x + 10, b.y - s * 6);
      } else {
        gx.moveTo(b.x + d * 12, b.y);
        gx.lineTo(b.x - d * 6, b.y - 10);
        gx.lineTo(b.x - d * 6, b.y + 10);
      }
      gx.fill();
      gx.globalAlpha = 1;
    }
    if (live && !this.bots[p]) {
      const y = RULES.goalY[p] + (p === 0 ? -44 : 44);
      text(gx, 'Tap a button to dive!', W / 2, y, { size: 14, player: p, color: '#fff', stroke: 'rgba(0,0,0,0.45)' });
    }
  }

  /** Kick dots for both players, readable from p's seat, between their goal and buttons. */
  private renderTracker(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const cy = p === 0 ? H - 108 : 108;
    facing(gx, p, W / 2, cy, () => {
      rrect(gx, W / 2 - 112, cy - 19, 224, 38, 10, 'rgba(10,30,15,0.45)');
      const rows: PlayerIndex[] = [p, other(p)];
      rows.forEach((who, r) => {
        const y = cy - 9 + r * 18;
        const res = g.kicks.filter((k) => k.shooter === who).map((k) => k.result);
        const n = Math.max(RULES.kicks, res.length);
        const start = Math.max(0, n - 8);
        const col = this.ctx.players[who].color;
        circle(gx, W / 2 - 100, y, 5, col);
        for (let i = start; i < n; i++) {
          const x = W / 2 - 80 + (i - start) * 18;
          drawDot(gx, x, y, res[i] ?? null, col, i >= RULES.kicks);
        }
        const turn = g.phase !== 'done' && g.shooter === who;
        text(gx, String(g.score[who]), W / 2 + 96, y, { size: 16, color: turn ? COLORS.gold : '#fff' });
      });
    });
  }
}

function drawDot(gx: G, x: number, y: number, r: KickResult | null, col: string, sudden: boolean): void {
  if (r === 'goal') {
    circle(gx, x, y, 6, COLORS.good, '#fff', 1.5);
  } else if (r === 'saved') {
    circle(gx, x, y, 6, COLORS.bad, '#fff', 1.5);
    line(gx, x - 3, y - 3, x + 3, y + 3, '#fff', 2);
    line(gx, x - 3, y + 3, x + 3, y - 3, '#fff', 2);
  } else if (r === 'miss') {
    circle(gx, x, y, 6, '#8a8a8a', '#fff', 1.5);
    line(gx, x - 3, y, x + 3, y, '#fff', 2);
  } else {
    circle(gx, x, y, 5.5, undefined, sudden ? alpha('#ffd54a', 0.6) : alpha(col, 0.7), 1.5);
  }
}

const def: GameDef = { id: 'penalty', create: (ctx) => new PenaltyView(ctx) };
export default def;
