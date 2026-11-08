// Ping Pong view: a table seen from above. Fingers and bots become paddle
// targets: finger x is where the paddle goes, pushing the finger toward the net
// lunges the paddle forward (a push drives, a hard straight flick smashes), pulling
// it back chops, and a sideways or diagonal swipe through the ball curves it. The ball shows its spin, a shadow,
// a bounce ring on the table and a trail that heats up as the rally grows.
import { PLAYERS, other, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, line, noGlow, rrect, shade, silentSeat, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { PowerButton, powerSpot } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { FingerPaddle, fwdSign, PingPong, PingPongBot, RULES, type Intent, type Shot } from './logic';
import { inkOn } from '../../core/contrast';
import { liftOn } from '../../engine/fx';
import { BounceMark, type Spot } from './bouncemark';
const FLOOR = '#2a2350';

const TABLE = { x0: 22, x1: W - 22, y0: RULES.tableY0, y1: RULES.tableY1 };
export const TABLE_GREEN = '#1d7a52';
/** Outline of the SERVE hint; Purple on it over the table was 4.0:1, so the word is lifted (liftOn). */
export const SERVE_OUTLINE = 'rgba(0,0,0,0.75)';
/** The colours most of the play area is painted in (tests read pops against them). */
export const SURFACES: readonly string[] = [FLOOR, TABLE_GREEN];
/**
 * Pop lanes, measured from the net into each seat's half. Words born on the same hit or point
 * take different lanes (F149: "Rally x5!" printed over SMASH!/Curve!, "What a rally!" over
 * "Match point!"): POINT! 90, shot words and "What a rally!" 130, rally count and
 * "Match point!" 170, a second "Match point!" 210 (the paddles sit at 574).
 */
export const POINT_LANE = 90;
export const SHOT_LANE = 130;
export const LANE_GAP = 40;
export const RALLY_LANE = SHOT_LANE + LANE_GAP;

type Trail = { x: number; y: number; color: string };

/** Trail and glow colour for each kind of shot. */
const SHOT_COLOR: Record<Shot, string> = { serve: '#ffffff', block: '#ffffff', drive: '#ffd54a', smash: '#ff7a3d', chop: '#6ad1ff' };
const CURVE_COLOR = '#c08bff';

class PingPongView implements GameInstance {
  readonly game: PingPong;
  private bots: (PingPongBot | null)[];
  private powerBtns: (PowerButton | null)[];
  private targets: number[] = [W / 2, W / 2];
  private keyMove = [false, false];
  /** Per player: turns the steering finger into a paddle target. */
  private fingers = [new FingerPaddle(0), new FingerPaddle(1)];
  private spinAngle = 0;
  private trail: Trail[] = [];
  /** Where the ball last landed; stays until it is hit back. */
  private mark = new BounceMark();
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
      const [x, y] = powerSpot(p, 38, 26, !!ctx.players[p].lefty);
      return new PowerButton(x, y, p, pw, ctx.players[p].color);
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
      const finger = input.steering(p, (f) => !!btn && btn.button.hit(f.startX, f.startY));
      const fs = fwdSign(p);
      if (finger) this.targets[p] = finger.x;
      let lunge = this.fingers[p].lunge(finger, dt);
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
    this.mark.tick(dt);
    const { sfx, fx } = this.ctx;
    const col = (p: PlayerIndex) => this.ctx.players[p].color;
    for (const e of g.events) {
      if (e.type === 'hit') {
        this.mark.release();
        const big = e.shot === 'smash';
        sfx.play(big ? 'thud' : 'hit');
        fx.burst(e.x, e.y, col(e.p), big ? 22 : e.shot === 'drive' ? 12 : 8, big ? 320 : 150, big ? 4 : 2.5);
        fx.burst(e.x, e.y, e.curve || Math.abs(e.spin) >= RULES.curveCall ? CURVE_COLOR : SHOT_COLOR[e.shot], 6, 140, 2);
        this.curving = e.curve || Math.abs(e.spin) > 60;
        if (big) {
          fx.shake(7, 0.2);
          this.popBoth('SMASH!', '#ff7a3d', 28);
        } else if (e.curve) this.popBoth('CURVE!', CURVE_COLOR, 26);
        else if (Math.abs(e.spin) >= RULES.curveCall) this.popBoth('Curve!', CURVE_COLOR, 20);
        else if (e.shot === 'chop') this.popBoth('Chop!', '#6ad1ff', 18);
      } else if (e.type === 'rally') {
        sfx.play('power');
        const words: Record<number, string> = { 5: 'Rally x5!', 10: 'Rally x10! 🔥', 15: 'On fire! x15', 20: 'Legendary x20!' };
        // F149: the rally count lands on the same hit as SMASH!/Curve!, so it gets its own lane.
        this.popBoth(words[e.hits] ?? `Rally x${e.hits}!`, COLORS.gold, e.hits >= 10 ? 24 : 20, RALLY_LANE);
        if (e.hits >= 10) fx.shake(3, 0.15);
      } else if (e.type === 'table') {
        sfx.play('tap');
        this.mark.land(e.x, e.y, e.top > 0.3 ? '#ffd54a' : e.top < -0.3 ? '#6ad1ff' : '#ffffff');
      } else if (e.type === 'wall') {
        sfx.play('bounce');
        this.curving = false;
        fx.burst(e.x, e.y, '#cfe3ff', 4, 80, 2);
      } else if (e.type === 'serve') {
        sfx.play('click');
      } else if (e.type === 'point') {
        this.mark.clear();
        sfx.play('score');
        this.lastScorer = e.scorer;
        this.pointFlash = 0.8;
        this.curving = false;
        fx.shake(5, 0.2);
        fx.flash(col(e.scorer), 0.14);
        fx.burst(e.x, e.y, col(e.scorer), 26, 260, 4);
        fx.pop('POINT!', W / 2, MID + POINT_LANE, col(e.scorer), 0, 34);
        fx.pop('POINT!', W / 2, MID - POINT_LANE, col(e.scorer), 1, 34);
        if (e.rally >= 10) this.popBoth(`What a rally! ${e.rally} hits`, COLORS.gold, 18);
        this.matchPointPops(RALLY_LANE);
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

  private popBoth(str: string, color: string, size: number, dy = SHOT_LANE): void {
    this.ctx.fx.pop(str, W / 2, MID + dy, color, 0, size);
    this.ctx.fx.pop(str, W / 2, MID - dy, color, 1, size);
  }

  /** At the hard cap both seats can be a point from winning: the second line sits a lane further out. */
  private matchPointPops(dy: number): void {
    const s = this.game.score;
    for (const p of PLAYERS) {
      const mine = s[p] + 1;
      const theirs = s[other(p)];
      const wouldWin = (mine >= RULES.winScore && mine - theirs >= RULES.winBy) || mine >= RULES.hardCap;
      if (wouldWin && this.game.winner === null) {
        this.popBoth('Match point!', this.ctx.players[p].color, 22, dy);
        dy += LANE_GAP;
      }
    }
  }

  render(gx: G): void {
    const g = this.game;
    const c = [this.ctx.players[0].color, this.ctx.players[1].color];
    // Floor
    gx.fillStyle = FLOOR;
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
    // Where the ball landed: a ring bursts out, and a spot (tinted by spin) stays on the
    // table until the ball is hit back. Both get a dark edge so they read on the green.
    const spot = this.mark.spot;
    if (spot) this.renderMark(gx, spot, this.mark.alpha(), this.mark.ring());
    // Scores, each on its owner's side of the net, readable from that seat
    for (const p of PLAYERS) {
      const x = p === 0 ? W - 58 : 58;
      const y = p === 0 ? MID + 62 : MID - 62;
      // F163: a bot's card facing the one person shows just its points. Its "vs N" (the
      // person's points) turned upright above the number, and the person's own card already
      // says "vs" the bot.
      const quiet = silentSeat(this.ctx.players, p);
      facing(gx, p, x, y, () => {
        rrect(gx, x - 30, y - 34, 60, 68, 14, c[p], 'rgba(255,255,255,0.7)', 2);
        text(gx, String(g.score[p]), x, quiet ? y : y - 6, { size: 36, color: '#fff', stroke: 'rgba(0,0,0,0.25)' });
        if (!quiet) text(gx, `vs ${g.score[other(p)]}`, x, y + 21, { size: 13, color: inkOn(c[p]) });
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
    // F158: the hints wait for GO; under the countdown "Flick up hard" sat on the "3 2 1" digit.
    if (g.score[0] + g.score[1] === 0 && g.t > 0 && g.t < 7) {
      const a = Math.min(1, (7 - g.t) / 0.8);
      for (const p of PLAYERS) {
        if (this.ctx.players[p].bot) continue;
        const y = p === 0 ? MID + 150 : MID - 150;
        const d = p === 0 ? 1 : -1;
        text(gx, 'Flick up hard: SMASH', W / 2, y, { size: 15, color: '#ffd54a', stroke: 'rgba(0,0,0,0.85)', player: p, alpha: a });
        text(gx, 'Swipe across the ball: curve', W / 2, y + d * 22, { size: 15, color: '#e2ccff', stroke: 'rgba(0,0,0,0.85)', player: p, alpha: a });
      }
    }
    // Serve hint
    if (g.serving && !this.ctx.players[g.server].bot) {
      const p = g.server;
      const y = g.paddles[p].y + fwdSign(p) * 44;
      text(gx, 'SERVE', g.paddles[p].x, y, { size: 14, color: liftOn(c[p], SERVE_OUTLINE, TABLE_GREEN), player: p, stroke: SERVE_OUTLINE });
    }
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, g.energy[p], this.t);
    if (this.pointFlash > 0) {
      gx.globalAlpha = this.pointFlash * 0.22;
      rrect(gx, 0, this.lastScorer === 0 ? MID : 0, W, MID, 0, c[this.lastScorer]);
      gx.globalAlpha = 1;
    }
  }

  private renderMark(gx: G, s: Spot, a: number, ring: number | null): void {
    if (ring !== null) {
      const r = 7 + 20 * ring;
      const k = 1 - ring;
      circle(gx, s.x, s.y, r, undefined, `rgba(0,0,0,${0.45 * k})`, 5);
      circle(gx, s.x, s.y, r, undefined, alpha(s.color, 0.95 * k), 2.5);
    }
    gx.globalAlpha = a;
    circle(gx, s.x, s.y, 7, 'rgba(0,0,0,0.4)');
    circle(gx, s.x, s.y, 5, undefined, alpha(s.color, 0.95), 2);
    circle(gx, s.x, s.y, 1.8, alpha(s.color, 0.95));
    gx.globalAlpha = 1;
  }

  /** For the playtest: where the ball's landing spot is, if one shows. */
  bounceSpot(): { x: number; y: number; held: boolean; alpha: number } | null {
    const s = this.mark.spot;
    return s ? { x: s.x, y: s.y, held: s.fade === null, alpha: this.mark.alpha() } : null;
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
    const fwd = pd.swingY * fwdSign(p);
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
