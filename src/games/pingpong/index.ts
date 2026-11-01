// Ping Pong view: a table seen from above. Fingers and bots become paddle
// targets: finger x is where the paddle goes, pushing the finger toward the net
// lunges the paddle forward (drives and smashes), pulling it back chops, and a
// sideways swipe through the ball curves it. The ball shows its spin, a shadow,
// a bounce ring on the table and a trail that heats up as the rally grows.
import { PLAYERS, other, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, line, noGlow, rrect, shade, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { PowerButton } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { fwdSign, PingPong, PingPongBot, RULES, type Intent, type Shot } from './logic';
import { inkOn } from '../../core/contrast';

const TABLE = { x0: 22, x1: W - 22, y0: RULES.tableY0, y1: RULES.tableY1 };
const TABLE_GREEN = '#1d7a52';

type Ring = { x: number; y: number; t: number; color: string };
type Trail = { x: number; y: number; color: string };

/** Trail and glow colour for each kind of shot. */
const SHOT_COLOR: Record<Shot, string> = { serve: '#ffffff', block: '#ffffff', drive: '#ffd54a', smash: '#ff7a3d', chop: '#6ad1ff' };
const CURVE_COLOR = '#c08bff';
/** Relative-drag gain: finger travel toward the net → paddle lunge. */
const LUNGE_GAIN = 1.3;
/** How fast a held lunge drifts back home (units/s of anchor creep). */
const ANCHOR_CREEP = 70;

class PingPongView implements GameInstance {
  readonly game: PingPong;
  private bots: (PingPongBot | null)[];
  private powerBtns: (PowerButton | null)[];
  private targets: number[] = [W / 2, W / 2];
  private keyMove = [false, false];
  /** Per player: the finger steering the paddle and its rear-most y (lunge = distance in front of it). */
  private steer: ({ id: number; anchor: number } | null)[] = [null, null];
  private spinAngle = 0;
  private trail: Trail[] = [];
  private rings: Ring[] = [];
  private t = 0;
  private pointFlash = 0;
  private lastScorer: PlayerIndex = 0;
  private curving = false;

  constructor(private readonly ctx: GameContext) {
    this.game = new PingPong(ctx.players, ctx.powersOn, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new PingPongBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      return p === 0 ? new PowerButton(38, H - 26, 0, pw, ctx.players[0].color) : new PowerButton(W - 38, 26, 1, pw, ctx.players[1].color);
    });
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    const intents = PLAYERS.map((p): Intent => {
      const bot = this.bots[p];
      if (bot) return bot.think(g, dt);
      const btn = this.powerBtns[p];
      const fire = btn ? btn.update(input, g.energy[p], KEYS[p].power) : false;
      // Drag anywhere in your half: the paddle follows your finger's x, and pushing the
      // finger toward the net lunges the paddle forward.
      const finger = input.of(p).find((f) => f.down && !(btn && btn.button.hit(f.startX, f.startY)));
      const fs = fwdSign(p);
      let lunge = 0;
      if (finger) {
        this.targets[p] = finger.x;
        let st = this.steer[p];
        if (!st || st.id !== finger.id) st = this.steer[p] = { id: finger.id, anchor: finger.y };
        // Distance the finger is in front of its anchor; pulling back past it moves the anchor.
        let ahead = (finger.y - st.anchor) * fs;
        if (ahead < 0) {
          st.anchor = finger.y;
          ahead = 0;
        }
        // A held lunge drifts home slowly (too slowly to count as a chop).
        st.anchor += fs * Math.min(ahead, ANCHOR_CREEP * dt);
        lunge = ahead * LUNGE_GAIN;
      } else this.steer[p] = null;
      const k = KEYS[p];
      const keyDir = (input.key(k.right) ? 1 : 0) - (input.key(k.left) ? 1 : 0);
      if (keyDir) this.targets[p] = g.paddles[p].x + keyDir * 60;
      else if (this.keyMove[p]) this.targets[p] = g.paddles[p].x;
      this.keyMove[p] = keyDir !== 0;
      if (input.key(k.up)) lunge = RULES.reach;
      return { tx: this.targets[p], ty: RULES.paddleY[p] + fs * lunge, power: fire };
    }) as [Intent, Intent];
    g.step(dt, intents);
    this.pointFlash = Math.max(0, this.pointFlash - dt);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < 0.5);
    const { sfx, fx } = this.ctx;
    const col = (p: PlayerIndex) => this.ctx.players[p].color;
    for (const e of g.events) {
      if (e.type === 'hit') {
        const big = e.shot === 'smash';
        sfx.play(big ? 'thud' : 'hit');
        fx.burst(e.x, e.y, col(e.p), big ? 22 : e.shot === 'drive' ? 12 : 8, big ? 320 : 150, big ? 4 : 2.5);
        fx.burst(e.x, e.y, e.curve || Math.abs(e.spin) > 120 ? CURVE_COLOR : SHOT_COLOR[e.shot], 6, 140, 2);
        this.curving = e.curve || Math.abs(e.spin) > 60;
        if (big) {
          fx.shake(7, 0.2);
          this.popBoth('SMASH!', '#ff7a3d', 28);
        } else if (e.curve) this.popBoth('CURVE!', CURVE_COLOR, 26);
        else if (Math.abs(e.spin) > 190) this.popBoth('Curve!', CURVE_COLOR, 20);
        else if (e.shot === 'chop') this.popBoth('Chop!', '#6ad1ff', 18);
      } else if (e.type === 'rally') {
        sfx.play('power');
        const words: Record<number, string> = { 5: 'Rally x5!', 10: 'Rally x10! 🔥', 15: 'On fire! x15', 20: 'Legendary x20!' };
        this.popBoth(words[e.hits] ?? `Rally x${e.hits}!`, COLORS.gold, e.hits >= 10 ? 24 : 20);
        if (e.hits >= 10) fx.shake(3, 0.15);
      } else if (e.type === 'table') {
        sfx.play('tap');
        this.rings.push({ x: e.x, y: e.y, t: 0, color: e.top > 0.3 ? '#ffd54a' : e.top < -0.3 ? '#6ad1ff' : '#ffffff' });
      } else if (e.type === 'wall') {
        sfx.play('bounce');
        this.curving = false;
        fx.burst(e.x, e.y, '#cfe3ff', 4, 80, 2);
      } else if (e.type === 'serve') {
        sfx.play('click');
      } else if (e.type === 'point') {
        sfx.play('score');
        this.lastScorer = e.scorer;
        this.pointFlash = 0.8;
        this.curving = false;
        fx.shake(5, 0.2);
        fx.flash(col(e.scorer), 0.14);
        fx.burst(e.x, e.y, col(e.scorer), 26, 260, 4);
        fx.pop('POINT!', W / 2, MID + 90, col(e.scorer), 0, 34);
        fx.pop('POINT!', W / 2, MID - 90, col(e.scorer), 1, 34);
        if (e.rally >= 10) this.popBoth(`What a rally! ${e.rally} hits`, COLORS.gold, 18);
        this.matchPointPops();
      } else if (e.type === 'power') {
        sfx.play('power');
        const pw = this.ctx.players[e.p].power!;
        fx.flash('#ffd54a', 0.12);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, e.p === 0 ? MID + 50 : MID - 50, COLORS.gold, e.p, 24);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, e.p === 0 ? MID - 50 : MID + 50, COLORS.gold, other(e.p), 20);
      } else if (e.type === 'win') {
        sfx.play('win');
        this.ctx.end({ winner: e.p, score: [...g.score] as [number, number], summary: `${g.score[0]} – ${g.score[1]}` });
      }
    }
    const b = g.ball;
    this.spinAngle += dt * (b.ax / 25 + b.top * 14 + 4);
    if (!g.serving && g.pointT <= 0) {
      const color = this.curving ? CURVE_COLOR : g.hits >= 10 && b.shot === 'block' ? '#ff9a3d' : SHOT_COLOR[b.shot];
      this.trail.push({ x: b.x, y: b.y, color });
      // The trail grows with the rally.
      const len = 10 + Math.min(g.hits, 12);
      while (this.trail.length > len) this.trail.shift();
    } else this.trail = [];
  }

  private popBoth(str: string, color: string, size: number): void {
    this.ctx.fx.pop(str, W / 2, MID + 130, color, 0, size);
    this.ctx.fx.pop(str, W / 2, MID - 130, color, 1, size);
  }

  private matchPointPops(): void {
    const s = this.game.score;
    for (const p of PLAYERS) {
      const mine = s[p] + 1;
      const theirs = s[other(p)];
      const wouldWin = (mine >= RULES.winScore && mine - theirs >= RULES.winBy) || mine >= RULES.hardCap;
      if (wouldWin && this.game.winner === null) this.popBoth('Match point!', this.ctx.players[p].color, 22);
    }
  }

  render(gx: G): void {
    const g = this.game;
    const c = [this.ctx.players[0].color, this.ctx.players[1].color];
    // Floor
    gx.fillStyle = '#2a2350';
    gx.fillRect(0, 0, W, H);
    for (const p of PLAYERS) {
      const grad = gx.createLinearGradient(0, p === 0 ? H : 0, 0, MID);
      grad.addColorStop(0, alpha(c[p], 0.28));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      gx.fillStyle = grad;
      gx.fillRect(0, p === 0 ? MID : 0, W, MID);
    }
    // Side rails the ball bounces off
    rrect(gx, 0, 0, RULES.wallX0, H, 0, '#171233');
    rrect(gx, RULES.wallX1, 0, W - RULES.wallX1, H, 0, '#171233');
    // Slow-mo zone on the player's half
    for (const p of PLAYERS) {
      const s = g.paddles[p].slowmo;
      if (s > 0) {
        gx.globalAlpha = 0.18 + 0.06 * Math.sin(this.t * 6);
        rrect(gx, 0, p === 0 ? MID : 0, W, MID, 0, '#6ad1ff');
        gx.globalAlpha = 1;
      }
    }
    // Table: legs shadow, top, white lines, net
    rrect(gx, TABLE.x0 + 6, TABLE.y0 + 8, TABLE.x1 - TABLE.x0, TABLE.y1 - TABLE.y0, 6, 'rgba(0,0,0,0.35)');
    rrect(gx, TABLE.x0, TABLE.y0, TABLE.x1 - TABLE.x0, TABLE.y1 - TABLE.y0, 6, TABLE_GREEN);
    const sheen = gx.createLinearGradient(TABLE.x0, 0, TABLE.x1, 0);
    sheen.addColorStop(0, 'rgba(255,255,255,0.0)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.07)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.0)');
    gx.fillStyle = sheen;
    gx.fillRect(TABLE.x0, TABLE.y0, TABLE.x1 - TABLE.x0, TABLE.y1 - TABLE.y0);
    rrect(gx, TABLE.x0 + 3, TABLE.y0 + 3, TABLE.x1 - TABLE.x0 - 6, TABLE.y1 - TABLE.y0 - 6, 4, undefined, 'rgba(255,255,255,0.9)', 3);
    line(gx, W / 2, TABLE.y0 + 4, W / 2, TABLE.y1 - 4, 'rgba(255,255,255,0.55)', 2);
    // Lunge line: how far toward the net each paddle can reach
    for (const p of PLAYERS) {
      const y = RULES.paddleY[p] + fwdSign(p) * (RULES.reach + RULES.paddleH / 2);
      gx.setLineDash([6, 8]);
      line(gx, TABLE.x0 + 10, y, TABLE.x1 - 10, y, alpha(c[p], 0.45), 2);
      gx.setLineDash([]);
    }
    // Bounce rings, tinted by spin
    for (const r of this.rings) {
      const k = r.t / 0.5;
      circle(gx, r.x, r.y, 6 + 18 * k, undefined, alpha(r.color, 0.75 * (1 - k)), 2);
    }
    // Scores, each on its owner's side of the net, readable from that seat
    for (const p of PLAYERS) {
      const x = p === 0 ? W - 58 : 58;
      const y = p === 0 ? MID + 62 : MID - 62;
      facing(gx, p, x, y, () => {
        rrect(gx, x - 30, y - 34, 60, 68, 14, c[p], 'rgba(255,255,255,0.7)', 2);
        text(gx, String(g.score[p]), x, y - 6, { size: 36, color: '#fff', stroke: 'rgba(0,0,0,0.25)' });
        text(gx, `vs ${g.score[other(p)]}`, x, y + 21, { size: 13, color: inkOn(c[p]) });
      });
    }
    // Net: posts stick out over the rails, mesh band across the middle
    rrect(gx, 4, MID - 4, W - 8, 8, 3, 'rgba(0,0,0,0.3)');
    rrect(gx, TABLE.x0 - 10, MID - 3, TABLE.x1 - TABLE.x0 + 20, 6, 3, '#f4f4f8');
    for (let x = TABLE.x0; x < TABLE.x1; x += 8) line(gx, x, MID - 2, x, MID + 2, 'rgba(40,40,70,0.35)', 1);
    circle(gx, TABLE.x0 - 10, MID, 5, '#d0d0dc', '#555', 1.5);
    circle(gx, TABLE.x1 + 10, MID, 5, '#d0d0dc', '#555', 1.5);
    this.renderBall(gx);
    // Paddles
    for (const p of PLAYERS) this.renderPaddle(gx, p);
    // Rally counter by the net, readable from both seats
    if (g.hits >= 3 && g.pointT <= 0 && !g.serving) {
      const hot = g.hits >= 10 ? '#ff9a3d' : g.hits >= 5 ? COLORS.gold : '#ffffff';
      text(gx, `Rally ${g.hits}`, 72, MID + 24, { size: 15, color: hot, stroke: 'rgba(0,0,0,0.8)' });
      text(gx, `Rally ${g.hits}`, W - 72, MID - 24, { size: 15, color: hot, stroke: 'rgba(0,0,0,0.8)', player: 1 });
    }
    // How-to hint for people at the start of the match
    if (g.score[0] + g.score[1] === 0 && g.t < 7) {
      const a = Math.min(1, (7 - g.t) / 0.8);
      for (const p of PLAYERS) {
        if (this.ctx.players[p].bot) continue;
        const y = p === 0 ? MID + 150 : MID - 150;
        const d = p === 0 ? 1 : -1;
        text(gx, 'Push up as you hit: SMASH', W / 2, y, { size: 15, color: '#ffd54a', stroke: 'rgba(0,0,0,0.85)', player: p, alpha: a });
        text(gx, 'Swipe sideways: curve', W / 2, y + d * 22, { size: 15, color: '#e2ccff', stroke: 'rgba(0,0,0,0.85)', player: p, alpha: a });
      }
    }
    // Serve hint
    if (g.serving) {
      const p = g.server;
      const y = g.paddles[p].y + fwdSign(p) * 44;
      text(gx, 'SERVE', g.paddles[p].x, y, { size: 14, color: c[p], player: p, stroke: 'rgba(0,0,0,0.75)' });
    }
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, g.energy[p], this.t);
    if (this.pointFlash > 0) {
      gx.globalAlpha = this.pointFlash * 0.22;
      rrect(gx, 0, this.lastScorer === 0 ? MID : 0, W, MID, 0, c[this.lastScorer]);
      gx.globalAlpha = 1;
    }
  }

  private renderBall(gx: G): void {
    const g = this.game;
    if (g.pointT > 0) return;
    const b = g.ball;
    const z = g.height();
    const r = RULES.ballR * (1 + z / 70);
    // Trail, coloured by the shot (gold drive, orange smash, blue chop, purple curve)
    this.trail.forEach((p, i) => {
      const k = i / this.trail.length;
      const hot = p.color !== '#ffffff';
      circle(gx, p.x, p.y, RULES.ballR * (0.4 + 0.6 * k) * (b.smash ? 1.3 : 1), alpha(p.color, (hot ? 0.5 : 0.18) * k));
    });
    // Shadow on the table drifts away from the ball as it rises
    circle(gx, b.x + z * 0.35, b.y + z * 0.55, RULES.ballR * (1 - z / 120), `rgba(0,0,0,${0.35 - z / 200})`);
    const tint = this.curving ? CURVE_COLOR : b.shot === 'block' || b.shot === 'serve' ? null : SHOT_COLOR[b.shot];
    if (tint) glow(gx, tint, b.smash ? 16 : 12);
    circle(gx, b.x, b.y, r, b.smash ? '#ffd2a8' : '#fffdf5', tint ?? '#d9d2bf', 1.5);
    noGlow(gx);
    // Spinning seam so you can see the spin
    const sa = this.spinAngle;
    gx.save();
    gx.beginPath();
    gx.arc(b.x, b.y, r * 0.95, 0, Math.PI * 2);
    gx.clip();
    gx.strokeStyle = tint ? alpha(tint, 0.9) : 'rgba(170,150,120,0.6)';
    gx.lineWidth = 1.6;
    gx.beginPath();
    gx.ellipse(b.x, b.y, r * 0.9, r * 0.35 * Math.abs(Math.cos(sa)) + 0.5, sa * 0.5, 0, Math.PI * 2);
    gx.stroke();
    gx.restore();
    circle(gx, b.x - r * 0.35, b.y - r * 0.35, r * 0.3, 'rgba(255,255,255,0.9)');
    if (g.serving) circle(gx, b.x, b.y, r + 6 + 4 * Math.sin(this.t * 10), undefined, 'rgba(255,255,255,0.5)', 2);
  }

  private renderPaddle(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const pd = g.paddles[p];
    const col = this.ctx.players[p].color;
    const y = pd.y;
    const hh = RULES.paddleH;
    const dir = p === 0 ? 1 : -1;
    const fwd = pd.vy * fwdSign(p);
    // Speed streaks behind a paddle lunging forward
    if (fwd > 200) {
      for (let i = 1; i <= 3; i++) {
        rrect(gx, pd.x - pd.w / 2, y - hh / 2 + dir * i * 7, pd.w, hh, 6, alpha(fwd >= RULES.smashFwd ? '#ff7a3d' : col, 0.22 / i));
      }
    }
    // The paddle tilts with a sideways swipe
    const tilt = Math.max(-1, Math.min(1, pd.vx / RULES.paddleSpeed)) * 0.22 * dir;
    gx.save();
    gx.translate(pd.x, y);
    gx.rotate(tilt);
    gx.translate(-pd.x, -y);
    // Handle toward the player's own edge
    rrect(gx, pd.x - 7, y + (dir > 0 ? 2 : -18), 14, 16, 4, '#c8935a', '#8a5a2b', 1.5);
    rrect(gx, pd.x - pd.w / 2 + 3, y - hh / 2 + 5, pd.w, hh, 6, 'rgba(0,0,0,0.3)');
    if (pd.smash) glow(gx, '#ff7a3d', 18 + 6 * Math.sin(this.t * 12));
    else if (pd.curve) glow(gx, '#c08bff', 18 + 6 * Math.sin(this.t * 12));
    rrect(gx, pd.x - pd.w / 2, y - hh / 2, pd.w, hh, 6, col, shade(col, -0.4), 2.5);
    noGlow(gx);
    // Rubber face stripe on the net side
    rrect(gx, pd.x - pd.w / 2 + 4, y - dir * (hh / 2 - 2) - 1.5, pd.w - 8, 3, 2, shade(col, 0.4));
    gx.restore();
    const badge = pd.smash ? '💥' : pd.curve ? '🌀' : pd.slowmo > 0 ? '🐢' : '';
    if (badge) text(gx, badge, pd.x, y - dir * 26, { size: 18, player: p });
  }
}

const def: GameDef = { id: 'pingpong', create: (ctx) => new PingPongView(ctx) };
export default def;
