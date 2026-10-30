// Sumo view: one big hold button per player becomes intents; state becomes a
// bouncy top-down ring with squash/stretch wrestlers, dust and shockwaves.
import { PLAYERS, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, noGlow, shade, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { Button, PowerButton } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { RULES, Sumo, SumoBot, type Intent } from './logic';

const SAND = '#e9cf98';
const SAND_DARK = '#c9a865';
const ROPE = '#b8893e';
const SKIN = '#f6d3ad';
const DUST = '#d8bb84';

type Body = {
  /** Squash/stretch: >1 = longer along `axis`. Springs back to 1. */
  stretch: number;
  sv: number;
  axis: number;
  /** View-only fall animation once out of the ring. */
  fall: number;
};

type Ring = { x: number; y: number; r: number; life: number; max: number; color: string; width: number };

class SumoView implements GameInstance {
  readonly game: Sumo;
  private bots: (SumoBot | null)[];
  private powerBtns: (PowerButton | null)[];
  private buttons: Button[];
  private bodies: Body[] = [0, 1].map(() => ({ stretch: 1, sv: 0, axis: 0, fall: 0 }));
  private rings: Ring[] = [];
  private t = 0;
  private banner = 0;
  private bannerText = '';
  private bannerColor = '#fff';
  private dustT = [0, 0];
  private ended = false;
  private shownRound = 1;

  constructor(private readonly ctx: GameContext) {
    this.game = new Sumo(ctx.players, ctx.powersOn, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new SumoBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      return p === 0 ? new PowerButton(40, H - 42, 0, pw, ctx.players[0].color) : new PowerButton(W - 40, 42, 1, pw, ctx.players[1].color);
    });
    this.buttons = PLAYERS.map((p) => new Button(W / 2, p === 0 ? H - 66 : 66, 46, p, 'HOLD', ctx.players[p].color, 20));
    this.showBanner(`Round ${this.game.round}`, '#fff', RULES.readyTime);
  }

  private showBanner(str: string, color: string, time = 1): void {
    this.bannerText = str;
    this.bannerColor = color;
    this.banner = time;
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    const intents = PLAYERS.map((p): Intent => {
      const bot = this.bots[p];
      const btn = this.buttons[p];
      if (bot) {
        const it = bot.think(g, dt);
        btn.set(it.hold);
        return it;
      }
      const pb = this.powerBtns[p];
      const fire = pb ? pb.update(input, g.energy[p], KEYS[p].power) : false;
      btn.update(input, KEYS[p].action);
      // Any finger in your own half counts (except one on the power button): easy for small hands.
      const anywhere = input.of(p).some((f) => f.down && !(pb && pb.button.hit(f.startX, f.startY)));
      return { hold: btn.held || anywhere, power: fire };
    }) as [Intent, Intent];
    g.step(dt, intents);
    this.banner = Math.max(0, this.banner - dt);
    if (g.round !== this.shownRound && g.phase === 'ready') {
      this.shownRound = g.round;
      const final = g.score[0] === RULES.roundsToWin - 1 && g.score[1] === RULES.roundsToWin - 1;
      this.showBanner(final ? 'Final round!' : `Round ${g.round}`, final ? COLORS.gold : '#fff', RULES.readyTime);
      this.ctx.sfx.play('count');
    }
    this.events();
    this.animate(dt);
  }

  private events(): void {
    const g = this.game;
    const { sfx, fx, players } = this.ctx;
    for (const e of g.events) {
      if (e.type === 'dash') {
        sfx.play('whoosh');
        const w = g.wrestlers[e.p];
        const b = this.bodies[e.p];
        b.axis = w.angle;
        b.sv += 4 + e.power * 6;
        // Dust kicked out behind the wrestler.
        const bx = e.x - Math.cos(w.angle) * g.radius(e.p);
        const by = e.y - Math.sin(w.angle) * g.radius(e.p);
        fx.burst(bx, by, DUST, Math.round(6 + e.power * 10), 90 + e.power * 120, 4 + e.power * 2);
        if (e.power > 0.8) fx.shake(2, 0.08);
      } else if (e.type === 'bump') {
        const big = e.strength > 380;
        sfx.play(big ? 'thud' : 'hit');
        fx.burst(e.x, e.y, '#fff7d6', Math.round(6 + e.strength / 40), 120 + e.strength * 0.4, 3.5);
        fx.burst(e.x, e.y, DUST, 8, 140, 4);
        for (const p of PLAYERS) {
          const b = this.bodies[p];
          b.axis = Math.atan2(e.ny, e.nx);
          b.sv -= 3 + e.strength / 90; // squash along the hit
        }
        this.rings.push({ x: e.x, y: e.y, r: 6, life: 0.3, max: 0.3, color: 'rgba(255,255,255,0.9)', width: 4 });
        if (big) {
          fx.shake(Math.min(12, 4 + e.strength / 80), 0.25);
          const word = e.strength > 600 ? 'KA-BOOM!' : 'BONK!';
          fx.pop(word, e.x, e.y - 30, COLORS.gold, 0, 26);
          fx.pop(word, e.x, e.y + 30, COLORS.gold, 1, 26);
        }
      } else if (e.type === 'out') {
        sfx.play('splash');
        fx.burst(e.x, e.y, DUST, 26, 220, 5);
        fx.burst(e.x, e.y, players[e.p].color, 12, 160, 4);
        fx.shake(9, 0.3);
      } else if (e.type === 'round') {
        if (e.winner === null) {
          sfx.play('buzz');
          this.showBanner('Both out! Again', '#fff', RULES.overTime);
        } else {
          sfx.play('score');
          fx.flash(players[e.winner].color, 0.2);
          this.showBanner(`${players[e.winner].name} wins the round!`, players[e.winner].color, RULES.overTime);
          const y = e.winner === 0 ? H - 150 : 150;
          fx.burst(W / 2, y, players[e.winner].color, 30, 260, 5);
        }
      } else if (e.type === 'fight') {
        sfx.play('go');
        this.showBanner('GO!', COLORS.gold, 0.6);
        for (const b of this.bodies) b.fall = 0;
      } else if (e.type === 'shrink') {
        sfx.play('buzz');
        fx.pop('The ring shrinks!', W / 2, MID + 40, '#ff8a5c', 0, 22);
        fx.pop('The ring shrinks!', W / 2, MID - 40, '#ff8a5c', 1, 22);
      } else if (e.type === 'pound') {
        sfx.play('thud');
        fx.shake(10, 0.3);
        fx.burst(e.x, e.y, DUST, 30, 300, 5);
        this.rings.push({ x: e.x, y: e.y, r: 20, life: 0.5, max: 0.5, color: players[e.p].color, width: 10 });
        this.rings.push({ x: e.x, y: e.y, r: 10, life: 0.4, max: 0.4, color: '#fff', width: 5 });
        this.bodies[e.p].sv -= 8;
      } else if (e.type === 'power') {
        sfx.play('power');
        const pw = players[e.p].power!;
        fx.flash('#ffd54a', 0.12);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, e.p === 0 ? H - 150 : 150, COLORS.gold, e.p, 24);
        if (pw.id === 'grow') this.bodies[e.p].sv += 8;
        if (pw.id === 'slip') {
          const foe = g.wrestlers[e.p === 0 ? 1 : 0];
          fx.burst(foe.x, foe.y, '#bfe9ff', 20, 140, 5);
        }
      } else if (e.type === 'win') {
        sfx.play('win');
        if (!this.ended) {
          this.ended = true;
          this.ctx.end({ winner: e.p, score: [...g.score] as [number, number], summary: `${g.score[0]} – ${g.score[1]} rounds` });
        }
      }
    }
  }

  private animate(dt: number): void {
    const g = this.game;
    for (const p of PLAYERS) {
      const b = this.bodies[p];
      const w = g.wrestlers[p];
      // Spring the squash/stretch back to 1 (bouncy, a little under-damped).
      const k = 220;
      const damp = 11;
      b.sv += (-(b.stretch - 1) * k - b.sv * damp) * dt;
      b.stretch += b.sv * dt;
      b.stretch = Math.max(0.6, Math.min(1.5, b.stretch));
      b.fall = w.out ? Math.min(1, b.fall + dt * 1.4) : 0;
      // Dust trail while sliding fast.
      const sp = Math.hypot(w.vx, w.vy);
      this.dustT[p] -= dt;
      if (sp > 220 && this.dustT[p] <= 0 && !w.out) {
        this.dustT[p] = 0.05;
        this.ctx.fx.burst(w.x, w.y + 6, w.slip > 0 ? '#cfefff' : DUST, 2, 40, 3);
      }
      // Charging: a little trembling squash.
      if (w.charging) {
        b.axis = w.angle;
        b.stretch += (1 - 0.18 * w.charge - b.stretch) * Math.min(1, dt * 12);
      }
    }
    for (const r of this.rings) {
      r.life -= dt;
      r.r += dt * 520;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  render(gx: G): void {
    const g = this.game;
    this.renderFloor(gx);
    this.renderRing(gx);
    // Aim guides and wrestlers
    for (const p of PLAYERS) this.renderAim(gx, p);
    for (const p of PLAYERS) this.renderWrestler(gx, p);
    for (const r of this.rings) circle(gx, r.x, r.y, r.r, undefined, r.color.startsWith('#') ? alpha(r.color, r.life / r.max) : r.color, r.width * (r.life / r.max));
    // Controls and scores
    for (const p of PLAYERS) this.renderButton(gx, p);
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, g.energy[p], this.t);
    for (const p of PLAYERS) this.renderScore(gx, p);
    if (this.banner > 0 && this.bannerText) {
      const a = Math.min(1, this.banner * 4);
      const pop = 1 + Math.max(0, this.banner - (this.bannerText === 'GO!' ? 0.4 : 0.9)) * 1.5;
      for (const p of PLAYERS) {
        const y = p === 0 ? MID + 56 : MID - 56;
        const fit = Math.min(26, 500 / Math.max(1, this.bannerText.length));
        // Capped so the two mirrored copies never overlap across the middle.
        text(gx, this.bannerText, W / 2, y, { size: Math.round(Math.min(fit * pop, 34)), color: this.bannerColor, stroke: 'rgba(40,20,0,0.75)', player: p, alpha: a });
      }
    }
  }

  private renderFloor(gx: G): void {
    const [c0, c1] = [this.ctx.players[0].color, this.ctx.players[1].color];
    gx.fillStyle = '#3a2a4f';
    gx.fillRect(0, 0, W, H);
    // Wooden floor boards
    for (let y = 0; y < H; y += 32) {
      gx.fillStyle = (y / 32) % 2 ? '#41305a' : '#3b2b53';
      gx.fillRect(0, y, W, 31);
    }
    const tint = gx.createLinearGradient(0, 0, 0, H);
    tint.addColorStop(0, alpha(c1, 0.28));
    tint.addColorStop(0.42, 'rgba(0,0,0,0)');
    tint.addColorStop(0.58, 'rgba(0,0,0,0)');
    tint.addColorStop(1, alpha(c0, 0.28));
    gx.fillStyle = tint;
    gx.fillRect(0, 0, W, H);
  }

  private renderRing(gx: G): void {
    const g = this.game;
    const cx = RULES.cx;
    const cy = RULES.cy;
    // Raised clay platform
    circle(gx, cx, cy + 8, RULES.ringR + 24, 'rgba(0,0,0,0.35)');
    circle(gx, cx, cy, RULES.ringR + 22, SAND_DARK);
    circle(gx, cx, cy, RULES.ringR + 14, SAND);
    const r = g.ringR();
    const shrinking = r < RULES.ringR - 0.5;
    // Inner ring surface
    const grad = gx.createRadialGradient(cx, cy - 30, 10, cx, cy, r);
    grad.addColorStop(0, '#f6e2b4');
    grad.addColorStop(1, SAND);
    gx.beginPath();
    gx.arc(cx, cy, r, 0, Math.PI * 2);
    gx.fillStyle = grad;
    gx.fill();
    // Assist margin: a faint ring in that player's colour shows their extra room.
    for (const p of PLAYERS) {
      const m = g.wrestlers[p].margin;
      if (m > 0.5) {
        gx.setLineDash([6, 8]);
        circle(gx, cx, cy, r + m, undefined, alpha(this.ctx.players[p].color, 0.7), 2);
        gx.setLineDash([]);
      }
    }
    // Straw rope
    const pulse = shrinking ? 0.5 + 0.5 * Math.sin(this.t * 10) : 0;
    circle(gx, cx, cy, r, undefined, shrinking ? `rgba(255,${120 + 60 * pulse},80,1)` : ROPE, 8);
    gx.setLineDash([3, 9]);
    circle(gx, cx, cy, r, undefined, shade(ROPE, -0.3), 8);
    gx.setLineDash([]);
    // Start lines (one per player, in their colour)
    for (const p of PLAYERS) {
      const y = cy + (p === 0 ? 1 : -1) * 34;
      gx.fillStyle = alpha(this.ctx.players[p].color, 0.55);
      gx.fillRect(cx - 22, y - 3, 44, 6);
    }
    // Slippery floor: a soapy sheen when someone is sliding.
    if (g.wrestlers.some((w) => w.slip > 0)) {
      gx.globalAlpha = 0.25 + 0.1 * Math.sin(this.t * 6);
      circle(gx, cx, cy, r, '#bfe9ff');
      gx.globalAlpha = 1;
    }
  }

  private renderAim(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const w = g.wrestlers[p];
    if (w.out || g.phase === 'done') return;
    const c = this.ctx.players[p].color;
    const r = g.radius(p);
    const ca = Math.cos(w.angle);
    const sa = Math.sin(w.angle);
    if (w.charging) {
      // Telegraph: dotted line to where a dash with this charge would carry you.
      const reach = Sumo.dashSpeed(w.charge) / g.friction(p);
      const n = Math.max(2, Math.floor(reach / 16));
      for (let i = 1; i <= n; i++) {
        const d = r + (reach * i) / n;
        circle(gx, w.x + ca * d, w.y + sa * d, 2.5 + (i === n ? 3 : 0), alpha(c, 0.35 + 0.5 * (i / n)));
      }
    }
    // Direction arrow
    const tip = r + 28 + (w.charging ? 8 * w.charge : 0);
    const base = r + 8;
    const wing = 13;
    gx.beginPath();
    gx.moveTo(w.x + ca * tip, w.y + sa * tip);
    gx.lineTo(w.x + ca * base - sa * wing, w.y + sa * base + ca * wing);
    gx.lineTo(w.x + ca * base + sa * wing, w.y + sa * base - ca * wing);
    gx.closePath();
    gx.fillStyle = w.charging ? COLORS.gold : c;
    gx.fill();
    gx.lineWidth = 3;
    gx.lineJoin = 'round';
    gx.strokeStyle = '#fff';
    gx.stroke();
  }

  private renderWrestler(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const w = g.wrestlers[p];
    const b = this.bodies[p];
    const c = this.ctx.players[p].color;
    const fall = b.fall;
    const r = g.radius(p) * (1 - 0.45 * fall);
    const shake = w.charging ? Math.sin(this.t * 60) * 1.6 * w.charge : 0;
    const x = w.x + shake;
    const y = w.y;
    gx.save();
    gx.globalAlpha = 1 - fall * 0.6;
    // Shadow
    circle(gx, x + 3, y + 6, r * 1.02, 'rgba(0,0,0,0.28)');
    // Squash/stretch along the axis, preserving area.
    gx.translate(x, y);
    gx.rotate(b.axis);
    gx.scale(b.stretch, 1 / b.stretch);
    gx.rotate(w.angle - b.axis + fall * 6);
    if (w.grow > 0) glow(gx, COLORS.gold, 18 + 6 * Math.sin(this.t * 10));
    if (w.pound > 0) glow(gx, '#fff', 30);
    // Arms (forward-facing), body, belt, head
    const bodyFill = shade(c, 0.55);
    circle(gx, r * 0.55, -r * 0.78, r * 0.32, bodyFill, shade(c, -0.4), 2.5);
    circle(gx, r * 0.55, r * 0.78, r * 0.32, bodyFill, shade(c, -0.4), 2.5);
    circle(gx, 0, 0, r, bodyFill, shade(c, -0.45), 3.5);
    noGlow(gx);
    // Mawashi belt: a thick band in the player's colour
    circle(gx, 0, 0, r * 0.78, undefined, c, r * 0.32);
    circle(gx, -r * 0.62, 0, r * 0.2, shade(c, -0.25)); // knot at the back
    // Head and topknot
    circle(gx, r * 0.18, 0, r * 0.46, SKIN, 'rgba(120,70,40,0.35)', 2);
    circle(gx, -r * 0.12, 0, r * 0.22, '#2b2240');
    circle(gx, -r * 0.28, 0, r * 0.12, '#2b2240');
    // Eyes looking forward (round, cute); squint while charging
    const ey = r * 0.18;
    for (const s of [-1, 1]) {
      if (w.charging || w.out) {
        gx.beginPath();
        gx.moveTo(r * 0.44, s * ey - 3);
        gx.lineTo(r * 0.5, s * ey);
        gx.lineTo(r * 0.44, s * ey + 3);
        gx.strokeStyle = '#2b2240';
        gx.lineWidth = 2;
        gx.stroke();
      } else {
        circle(gx, r * 0.45, s * ey, r * 0.09, '#2b2240');
      }
    }
    // Rosy cheeks
    circle(gx, r * 0.36, -r * 0.33, r * 0.08, 'rgba(255,120,120,0.5)');
    circle(gx, r * 0.36, r * 0.33, r * 0.08, 'rgba(255,120,120,0.5)');
    gx.restore();
    if (w.slip > 0) {
      for (let i = 0; i < 4; i++) {
        const a = this.t * 3 + i * 1.6;
        circle(gx, x + Math.cos(a) * (r + 8), y + Math.sin(a) * (r + 8), 4 + (i % 2) * 2, 'rgba(220,245,255,0.6)', '#fff', 1.5);
      }
    }
    if (w.pound > 0) {
      const k = 1 - w.pound / RULES.poundWindup;
      circle(gx, x, y, r + 6 + 16 * k, undefined, alpha(c, 0.4 + 0.5 * k), 4);
    }
    // Charge meter ring around the wrestler
    if (w.charging) {
      gx.beginPath();
      gx.arc(x, y, r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * w.charge);
      gx.strokeStyle = w.charge >= 1 ? COLORS.gold : '#fff';
      gx.lineWidth = 4;
      gx.lineCap = 'round';
      gx.stroke();
    }
  }

  private renderButton(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const btn = this.buttons[p];
    const w = g.wrestlers[p];
    const c = this.ctx.players[p].color;
    const pressed = btn.held || w.charging;
    const r = pressed ? btn.r * 0.93 : btn.r;
    const live = g.phase === 'fight' && w.cooldown <= 0;
    circle(gx, btn.x, btn.y + 6, btn.r, 'rgba(0,0,0,0.35)');
    circle(gx, btn.x, btn.y + (pressed ? 4 : 0), r, live || pressed ? c : shade(c, -0.35), 'rgba(255,255,255,0.6)', 3);
    circle(gx, btn.x - r * 0.3, btn.y - r * 0.35 + (pressed ? 4 : 0), r * 0.25, 'rgba(255,255,255,0.25)');
    // Charge arc
    gx.beginPath();
    gx.lineWidth = 7;
    gx.lineCap = 'round';
    gx.strokeStyle = 'rgba(255,255,255,0.15)';
    gx.arc(btn.x, btn.y, btn.r + 9, 0, Math.PI * 2);
    gx.stroke();
    if (w.charging) {
      const start = p === 0 ? -Math.PI / 2 : Math.PI / 2;
      gx.beginPath();
      gx.arc(btn.x, btn.y, btn.r + 9, start, start + Math.PI * 2 * w.charge);
      gx.strokeStyle = w.charge >= 1 ? COLORS.gold : '#fff';
      gx.stroke();
    }
    const label = w.charging ? (w.charge >= 1 ? 'MAX!' : 'LET GO') : 'HOLD';
    text(gx, label, btn.x, btn.y + (pressed ? 4 : 0), { size: label === 'LET GO' ? 17 : 20, player: p, color: '#fff', stroke: 'rgba(0,0,0,0.4)' });
  }

  private renderScore(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const c = this.ctx.players[p].color;
    // Round pips sit in the corner away from the power button.
    const x = p === 0 ? W - 62 : 62;
    const y = p === 0 ? H - 42 : 42;
    facing(gx, p, x, y, () => {
      text(gx, this.ctx.players[p].name, x, y - 22, { size: 13, color: alpha(c, 0.95), weight: 800 });
      for (let i = 0; i < RULES.roundsToWin; i++) {
        const px = x - 14 + i * 28;
        const won = g.score[p] > i;
        circle(gx, px, y + 4, 11, won ? COLORS.gold : 'rgba(255,255,255,0.12)', won ? '#fff' : alpha(c, 0.7), 2.5);
        if (won) text(gx, '★', px, y + 5, { size: 13, color: '#7a4b00' });
      }
    });
  }
}

const def: GameDef = { id: 'sumo', create: (ctx) => new SumoView(ctx) };
export default def;
