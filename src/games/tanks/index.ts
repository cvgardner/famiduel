// Tank Duel view: sticks, FIRE buttons and bots become intents; state becomes toy tanks.
import { PLAYERS, other, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, glow, line, noGlow, rrect, shade, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { PowerButton } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { CONTROLS_Y, controlsFor, FIRE_R, FIRE_RIM, fireLook, STICK_R, type Controls } from './controls';
import { COLS, LAYOUTS, ROWS } from './mazes';
import { ARENA, CELL, IDLE, RULES, TankBot, TankDuel, type Intent, type Tank } from './logic';

/** Mirror a bottom-strip position into player 1's top strip (180° turn). */
const seat = (p: PlayerIndex, x: number, y: number) => (p === 0 ? { x, y } : { x: W - x, y: H - y });

const POWER = { x: 183, y: 606 };
const HEARTS = { x: 183, y: 548 };

type Track = { x: number; y: number; a: number; life: number };
type Trail = { pts: { x: number; y: number }[]; bouncy: boolean; owner: PlayerIndex; seen: boolean };

class TankView implements GameInstance {
  readonly game: TankDuel;
  private bots: (TankBot | null)[];
  private powerBtns: (PowerButton | null)[];
  private stickFinger: (number | null)[] = [null, null];
  private stickVec = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  private fireHeld = [0, 0];
  /** Stick and FIRE per seat, swapped for a left-handed player. */
  private readonly controls: Controls[];
  private tracks: Track[] = [];
  private trackDist = [0, 0];
  private trails = new Map<number, Trail>();
  private dizzy: (number | null)[] = [null, null];
  private booms: { x: number; y: number; t: number }[] = [];
  private banner = { str: '', t: 0, color: '#fff' };
  private t = 0;
  private ended = false;

  constructor(private readonly ctx: GameContext) {
    this.game = new TankDuel(ctx.players, ctx.powersOn, ctx.rng);
    this.controls = PLAYERS.map((p) => controlsFor(!!ctx.players[p].lefty));
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new TankBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      const s = seat(p, POWER.x, POWER.y);
      return new PowerButton(s.x, s.y, p, pw, ctx.players[p].color);
    });
  }

  private humanIntent(p: PlayerIndex, input: Input): Intent {
    const btn = this.powerBtns[p];
    const power = btn ? btn.update(input, this.game.energy[p], KEYS[p].power) : false;
    const cs = this.controls[p];
    const base = seat(p, cs.stickX, CONTROLS_Y);
    const fireAt = seat(p, cs.fireX, CONTROLS_Y);
    let fire = false;
    for (const f of input.of(p)) {
      if (!f.pressed) continue;
      if (btn && btn.button.hit(f.x, f.y)) continue;
      // Generous zones: the outer part of your strip on the FIRE side fires, the other side steers.
      const fx = p === 0 ? f.x : W - f.x;
      const inStrip = p === 0 ? f.y > ARENA.y + ARENA.h - 10 : f.y < ARENA.y + 10;
      if (Math.hypot(f.x - fireAt.x, f.y - fireAt.y) < FIRE_R + 16 || (inStrip && cs.fireSide(fx))) {
        fire = true;
        this.fireHeld[p] = 0.12;
      } else if (this.stickFinger[p] === null && (Math.hypot(f.x - base.x, f.y - base.y) < STICK_R + 40 || (inStrip && cs.stickSide(fx)))) {
        this.stickFinger[p] = f.id;
      }
    }
    let vx = 0;
    let vy = 0;
    const id = this.stickFinger[p];
    if (id !== null) {
      const f = input.pointers.get(id);
      if (f && f.down) {
        vx = (f.x - base.x) / STICK_R;
        vy = (f.y - base.y) / STICK_R;
        const m = Math.hypot(vx, vy);
        if (m > 1) {
          vx /= m;
          vy /= m;
        }
      } else this.stickFinger[p] = null;
    }
    const k = KEYS[p];
    const kx = (input.key(k.right) ? 1 : 0) - (input.key(k.left) ? 1 : 0);
    const ky = (input.key(k.down) ? 1 : 0) - (input.key(k.up) ? 1 : 0);
    if (kx || ky) {
      const m = Math.hypot(kx, ky);
      vx = kx / m;
      vy = ky / m;
    }
    if (input.keyPressed(k.action)) {
      fire = true;
      this.fireHeld[p] = 0.12;
    }
    this.stickVec[p] = { x: vx, y: vy };
    return { mx: vx, my: vy, fire, power };
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    const intents = PLAYERS.map((p): Intent => {
      const bot = this.bots[p];
      if (!bot) return this.humanIntent(p, input);
      const it = bot.think(g, dt);
      this.stickVec[p] = { x: it.mx, y: it.my };
      if (it.fire && g.canFire(p)) this.fireHeld[p] = 0.12;
      return it;
    }) as [Intent, Intent];
    g.step(dt, g.over ? [IDLE, IDLE] : intents);
    for (const p of PLAYERS) this.fireHeld[p] = Math.max(0, this.fireHeld[p] - dt);
    this.banner.t = Math.max(0, this.banner.t - dt);
    this.booms = this.booms.filter((b) => (b.t += dt) < 0.6);
    this.updateTracks(dt);
    this.updateTrails();
    this.handleEvents();
  }

  private updateTracks(dt: number): void {
    const g = this.game;
    for (const tr of this.tracks) tr.life -= dt;
    this.tracks = this.tracks.filter((tr) => tr.life > 0);
    if (g.phase !== 'play') return;
    for (const p of PLAYERS) {
      const tk = g.tanks[p];
      this.trackDist[p] += tk.speed * dt;
      if (this.trackDist[p] > 7) {
        this.trackDist[p] = 0;
        this.tracks.push({ x: tk.x, y: tk.y, a: tk.a, life: 2.5 });
      }
    }
    if (this.tracks.length > 240) this.tracks.splice(0, this.tracks.length - 240);
  }

  private updateTrails(): void {
    for (const tr of this.trails.values()) tr.seen = false;
    for (const s of this.game.shells) {
      let tr = this.trails.get(s.id);
      if (!tr) {
        tr = { pts: [], bouncy: s.bouncy, owner: s.owner, seen: true };
        this.trails.set(s.id, tr);
      }
      tr.seen = true;
      tr.pts.push({ x: s.x, y: s.y });
      if (tr.pts.length > (s.bouncy ? 16 : 7)) tr.pts.shift();
    }
    for (const [id, tr] of this.trails) if (!tr.seen) this.trails.delete(id);
  }

  private popBoth(str: string, x: number, y: number, color: string, size = 26): void {
    this.ctx.fx.pop(str, x, y - size * 0.8, color, 0, size);
    this.ctx.fx.pop(str, x, y + size * 0.8, color, 1, size);
  }

  private handleEvents(): void {
    const g = this.game;
    const { sfx, fx, players } = this.ctx;
    for (const e of g.events) {
      if (e.type === 'fire') {
        sfx.play(e.bouncy ? 'coin' : 'pop');
        fx.burst(e.x, e.y, e.bouncy ? COLORS.gold : '#ffffff', 5, 90, 2.5);
      } else if (e.type === 'dud') {
        sfx.play('click');
        fx.burst(e.x, e.y, '#9a9a9a', 6, 60, 3);
        fx.pop('fizz', e.x, e.y + (e.p === 0 ? -10 : 10), '#cfcfcf', e.p, 14);
      } else if (e.type === 'bounce') {
        sfx.play('bounce');
        fx.burst(e.x, e.y, e.bouncy ? COLORS.gold : '#ffffff', e.bouncy ? 7 : 3, 80, 2);
      } else if (e.type === 'fizzle') {
        fx.burst(e.x, e.y, '#b0a8c8', 6, 50, 2.5);
      } else if (e.type === 'clash') {
        sfx.play('click');
        fx.burst(e.x, e.y, '#ffffff', 12, 140, 3);
        this.popBoth('clink!', e.x, e.y, '#ffffff', 16);
      } else if (e.type === 'block') {
        sfx.play('pop');
        fx.burst(e.x, e.y, '#8fe3ff', 12, 120, 3);
        fx.pop('blocked!', e.x, e.y + (e.p === 0 ? -16 : 16), '#8fe3ff', e.p, 16);
      } else if (e.type === 'hit') {
        sfx.play('thud');
        sfx.play('hit');
        const tk = g.tanks[e.p];
        this.dizzy[e.p] = 0;
        fx.shake(9, 0.35);
        fx.flash(players[e.p].color, 0.14);
        fx.burst(tk.x, tk.y, COLORS.gold, 18, 220, 4);
        fx.burst(tk.x, tk.y, players[e.p].color, 14, 160, 4);
        this.popBoth('BONK!', tk.x, tk.y, COLORS.gold, 30);
        const scorer = other(e.p);
        const msg = e.self ? 'Oops! Own shot' : e.mine ? 'Mine got you!' : 'Bonked!';
        fx.pop(msg, W / 2, e.p === 0 ? ARENA.y + ARENA.h - 30 : ARENA.y + 30, '#ffffff', e.p, 18);
        fx.pop(`+1`, W / 2, scorer === 0 ? ARENA.y + ARENA.h - 30 : ARENA.y + 30, players[scorer].color, scorer, 24);
      } else if (e.type === 'mine') {
        sfx.play('click');
        fx.burst(e.x, e.y, players[e.p].color, 6, 60, 2);
      } else if (e.type === 'boom') {
        sfx.play('whoosh');
        sfx.play('thud');
        this.booms.push({ x: e.x, y: e.y, t: 0 });
        fx.burst(e.x, e.y, '#ffb74d', 22, 240, 5);
        fx.burst(e.x, e.y, '#e0e0e0', 16, 140, 6);
        fx.shake(7, 0.3);
        this.popBoth('POOF!', e.x, e.y, '#ffb74d', 24);
      } else if (e.type === 'power') {
        sfx.play('power');
        const pw = players[e.p].power!;
        const tk = g.tanks[e.p];
        fx.flash('#ffd54a', 0.12);
        fx.burst(tk.x, tk.y, COLORS.gold, 16, 160, 3);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, e.p === 0 ? MID + 60 : MID - 60, COLORS.gold, e.p, 24);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, e.p === 0 ? MID + 30 : MID - 30, alpha(players[e.p].color, 1), other(e.p), 16);
      } else if (e.type === 'round') {
        sfx.play('count');
        this.dizzy = [null, null];
        this.tracks = [];
        this.booms = [];
        this.banner = { str: `Round ${e.n}`, t: RULES.readyTime, color: '#ffffff' };
      } else if (e.type === 'go') {
        sfx.play('go');
      } else if (e.type === 'timeup') {
        sfx.play('buzz');
        this.popBoth('Time!', W / 2, MID, '#ffffff', 34);
      } else if (e.type === 'sudden') {
        this.banner = { str: 'Sudden bonk!', t: 2.2, color: COLORS.gold };
      } else if (e.type === 'win') {
        if (this.ended) continue;
        this.ended = true;
        sfx.play('win');
        if (e.p !== null) {
          const tk = g.tanks[e.p];
          fx.burst(tk.x, tk.y, players[e.p].color, 40, 300, 5);
          fx.burst(tk.x, tk.y, COLORS.gold, 30, 260, 4);
        }
        const score = [...g.score] as [number, number];
        this.ctx.end({ winner: e.p, score, summary: `${score[0]} – ${score[1]} bonks` });
      }
    }
    for (const p of PLAYERS) if (this.dizzy[p] !== null) this.dizzy[p]! += 1 / 60;
  }

  // ---------- drawing ----------

  render(gx: G): void {
    const g = this.game;
    const lay = LAYOUTS[g.layout];
    // Table and control strips
    gx.fillStyle = '#2a2150';
    gx.fillRect(0, 0, W, H);
    for (const p of PLAYERS) this.drawStripBg(gx, p);
    // Arena floor
    rrect(gx, ARENA.x - 6, ARENA.y - 6, ARENA.w + 12, ARENA.h + 12, 14, '#3b2f6e');
    gx.save();
    gx.beginPath();
    gx.roundRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 8);
    gx.clip();
    gx.fillStyle = lay.floor;
    gx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if ((c + r) % 2 === 0) {
          gx.fillStyle = 'rgba(60,40,120,0.045)';
          gx.fillRect(ARENA.x + c * CELL, ARENA.y + r * CELL, CELL, CELL);
        }
      }
    }
    // Home zones: a soft tint at each player's end.
    const c0 = this.ctx.players[0].color;
    const c1 = this.ctx.players[1].color;
    const grad = gx.createLinearGradient(0, ARENA.y, 0, ARENA.y + ARENA.h);
    grad.addColorStop(0, alpha(c1, 0.16));
    grad.addColorStop(0.3, 'rgba(255,255,255,0)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0)');
    grad.addColorStop(1, alpha(c0, 0.16));
    gx.fillStyle = grad;
    gx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    line(gx, ARENA.x + 8, MID, ARENA.x + ARENA.w - 8, MID, 'rgba(60,40,120,0.12)', 2);
    // Tread marks
    for (const tr of this.tracks) {
      gx.globalAlpha = Math.min(1, tr.life / 2.5) * 0.18;
      const nx = -Math.sin(tr.a) * 9;
      const ny = Math.cos(tr.a) * 9;
      rrect(gx, tr.x + nx - 2, tr.y + ny - 2, 4, 4, 1, '#3b2f6e');
      rrect(gx, tr.x - nx - 2, tr.y - ny - 2, 4, 4, 1, '#3b2f6e');
    }
    gx.globalAlpha = 1;
    this.drawBlocks(gx, lay.block);
    this.drawMines(gx);
    for (const p of PLAYERS) this.drawTank(gx, p);
    this.drawShells(gx);
    this.drawBooms(gx);
    gx.restore();
    // Controls
    for (const p of PLAYERS) this.drawControls(gx, p);
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, g.energy[p], this.t);
    this.drawOverlay(gx);
  }

  private drawStripBg(gx: G, p: PlayerIndex): void {
    const c = this.ctx.players[p].color;
    const y = p === 0 ? ARENA.y + ARENA.h + 6 : 0;
    const h = p === 0 ? H - y : ARENA.y - 6;
    const grad = gx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(p === 0 ? 0 : 1, alpha(c, 0.08));
    grad.addColorStop(p === 0 ? 1 : 0, alpha(c, 0.32));
    gx.fillStyle = grad;
    gx.fillRect(0, y, W, h);
  }

  private drawBlocks(gx: G, color: string): void {
    const g = this.game;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!g.arena.solidCell(c, r)) continue;
        const x = ARENA.x + c * CELL;
        const y = ARENA.y + r * CELL;
        rrect(gx, x + 2, y + 4, CELL - 3, CELL - 3, 7, 'rgba(40,20,80,0.22)');
        rrect(gx, x + 1, y + 1, CELL - 2, CELL - 2, 7, shade(color, -0.22));
        rrect(gx, x + 1, y + 1, CELL - 2, CELL - 6, 7, color);
        for (const [sx, sy] of [
          [0.3, 0.28],
          [0.7, 0.28],
          [0.3, 0.66],
          [0.7, 0.66],
        ]) {
          circle(gx, x + sx * CELL, y + sy * CELL + 1, 4.5, shade(color, -0.12));
          circle(gx, x + sx * CELL, y + sy * CELL, 4.5, shade(color, 0.22));
        }
      }
    }
  }

  private drawMines(gx: G): void {
    for (const m of this.game.mines) {
      const c = this.ctx.players[m.owner].color;
      const armed = m.arm <= 0;
      circle(gx, m.x, m.y + 2, RULES.mineR + 1, 'rgba(0,0,0,0.25)');
      circle(gx, m.x, m.y, RULES.mineR, '#3a3448', c, 3);
      // A blinking light everybody can see; it blinks faster once armed.
      const on = Math.sin(this.t * (armed ? 16 : 6)) > 0;
      if (on) glow(gx, '#ff4d4d', 12);
      circle(gx, m.x, m.y, 3.5, on ? '#ff4d4d' : '#6b2a2a');
      noGlow(gx);
      if (!armed) circle(gx, m.x, m.y, RULES.mineR + 4 + (1 - m.arm / RULES.mineArm) * 6, undefined, alpha(c, 0.5), 2);
      else circle(gx, m.x, m.y, RULES.mineR + RULES.tankR, undefined, 'rgba(255,77,77,0.25)', 1.5);
    }
  }

  private drawTank(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const tk: Tank = g.tanks[p];
    const c = this.ctx.players[p].color;
    const dz = this.dizzy[p];
    const spin = dz !== null ? dz * 9 : 0;
    const squash = dz !== null ? 1 - 0.25 * Math.max(0, 1 - dz * 3) : 1;
    gx.save();
    gx.translate(tk.x, tk.y);
    circle(gx, 2, 5, RULES.tankR + 3, 'rgba(30,20,60,0.25)');
    gx.rotate(tk.a + spin);
    gx.scale(squash, 2 - squash);
    // Treads
    const tread = shade(c, -0.55);
    const roll = (this.t * tk.speed * 0.25) % 6;
    for (const side of [-1, 1]) {
      rrect(gx, -15, side * 11 - 4, 30, 8, 4, tread);
      gx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = -12 + roll; i < 13; i += 6) gx.fillRect(i, side * 11 - 3, 2, 6);
    }
    // Hull
    rrect(gx, -13, -10, 26, 20, 8, c, shade(c, -0.35), 2.5);
    rrect(gx, -10, -8, 14, 6, 3, alpha('#ffffff', 0.3));
    // Barrel (kicks back when firing)
    const kick = Math.max(0, 1 - tk.fired * 8) * 4;
    const bouncy = tk.bouncy > 0;
    if (bouncy) glow(gx, COLORS.gold, 10 + 4 * Math.sin(this.t * 10));
    rrect(gx, 2 - kick, -3.5, 17, 7, 3.5, bouncy ? COLORS.gold : shade(c, -0.2), shade(c, -0.45), 2);
    noGlow(gx);
    // Turret with a friendly face
    circle(gx, 0, 0, 8.5, shade(c, 0.25), shade(c, -0.35), 2);
    const blink = Math.sin(this.t * 1.3 + p * 2) > 0.97;
    for (const ey of [-3.3, 3.3]) {
      if (dz !== null) {
        line(gx, 1.5, ey - 1.6, 4.5, ey + 1.6, '#2a2150', 1.5);
        line(gx, 1.5, ey + 1.6, 4.5, ey - 1.6, '#2a2150', 1.5);
      } else if (blink) {
        line(gx, 3, ey - 2, 3, ey + 2, '#2a2150', 1.5);
      } else {
        circle(gx, 3, ey, 2.4, '#ffffff');
        circle(gx, 3.9, ey, 1.2, '#2a2150');
      }
    }
    gx.restore();
    // Dizzy stars
    if (dz !== null) {
      for (let i = 0; i < 3; i++) {
        const a = this.t * 5 + (i * Math.PI * 2) / 3;
        text(gx, '★', tk.x + Math.cos(a) * 17, tk.y + Math.sin(a) * 9 - 2, { size: 12, color: COLORS.gold, stroke: 'rgba(0,0,0,0.35)' });
      }
    }
    // Shield bubble
    if (tk.shield > 0) {
      const fading = tk.shield < 0.8 && Math.sin(this.t * 30) > 0;
      const r = RULES.tankR + 10 + Math.sin(this.t * 6) * 1.5;
      gx.globalAlpha = fading ? 0.35 : 1;
      const bg = gx.createRadialGradient(tk.x - 6, tk.y - 6, 2, tk.x, tk.y, r);
      bg.addColorStop(0, 'rgba(255,255,255,0.05)');
      bg.addColorStop(0.8, 'rgba(143,227,255,0.22)');
      bg.addColorStop(1, 'rgba(143,227,255,0.5)');
      circle(gx, tk.x, tk.y, r, undefined);
      gx.fillStyle = bg;
      gx.fill();
      glow(gx, '#8fe3ff', 10);
      circle(gx, tk.x, tk.y, r, undefined, '#bff0ff', 2.5);
      noGlow(gx);
      circle(gx, tk.x - r * 0.45, tk.y - r * 0.45, 3, 'rgba(255,255,255,0.8)');
      gx.globalAlpha = 1;
    }
    // Bouncing Shot sparkles
    if (tk.bouncy > 0) {
      const a = this.t * 4;
      for (let i = 0; i < 2; i++) {
        const k = a + i * Math.PI;
        circle(gx, tk.x + Math.cos(k) * 20, tk.y + Math.sin(k) * 20, 2, COLORS.gold);
      }
    }
  }

  private drawShells(gx: G): void {
    const players = this.ctx.players;
    for (const tr of this.trails.values()) {
      const n = tr.pts.length;
      tr.pts.forEach((pt, i) => {
        const k = (i + 1) / n;
        const col = tr.bouncy ? `hsla(${(this.t * 360 + i * 25) % 360},95%,60%,${0.75 * k})` : alpha(players[tr.owner].color, 0.35 * k);
        circle(gx, pt.x, pt.y, RULES.shellR * (tr.bouncy ? 1.1 : 0.8) * k, col);
      });
    }
    for (const s of this.game.shells) {
      const c = players[s.owner].color;
      if (s.bouncy) glow(gx, COLORS.gold, 12);
      circle(gx, s.x, s.y, RULES.shellR + 1.5, s.bouncy ? COLORS.gold : c);
      noGlow(gx);
      circle(gx, s.x, s.y, RULES.shellR - 0.5, '#2a2150');
      circle(gx, s.x - 1, s.y - 1, 1.2, 'rgba(255,255,255,0.8)');
    }
  }

  private drawBooms(gx: G): void {
    for (const b of this.booms) {
      const k = b.t / 0.6;
      const r = RULES.blastR * (0.4 + k * 0.8);
      gx.globalAlpha = 1 - k;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + k;
        circle(gx, b.x + Math.cos(a) * r * 0.55, b.y + Math.sin(a) * r * 0.55, r * 0.45, i % 2 ? '#ffe0b2' : '#ffffff');
      }
      circle(gx, b.x, b.y, RULES.blastR * (0.3 + k), undefined, '#ffb74d', 3);
      gx.globalAlpha = 1;
    }
  }

  private drawControls(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const c = this.ctx.players[p].color;
    const live = !g.over && g.phase === 'play';
    // Stick
    const cs = this.controls[p];
    const b = seat(p, cs.stickX, CONTROLS_Y);
    circle(gx, b.x, b.y, STICK_R + 4, 'rgba(0,0,0,0.3)');
    circle(gx, b.x, b.y, STICK_R, alpha(c, 0.18), alpha(c, 0.6), 3);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const tx = b.x + Math.cos(a) * (STICK_R - 9);
      const ty = b.y + Math.sin(a) * (STICK_R - 9);
      circle(gx, tx, ty, 2.5, alpha('#ffffff', 0.35));
    }
    const v = this.stickVec[p];
    const kx = b.x + v.x * STICK_R * 0.75;
    const ky = b.y + v.y * STICK_R * 0.75;
    circle(gx, kx, ky + 3, 20, 'rgba(0,0,0,0.3)');
    circle(gx, kx, ky, 20, c, shade(c, -0.35), 3);
    circle(gx, kx - 5, ky - 5, 6, alpha('#ffffff', 0.35));
    // Fire button, with a reload ring and ammo pips
    const f = seat(p, cs.fireX, CONTROLS_Y);
    const tk = g.tanks[p];
    const ready = live && g.canFire(p);
    const press = this.fireHeld[p] > 0;
    const r = press ? FIRE_R * 0.9 : FIRE_R;
    const look = fireLook(c, ready);
    const rr = r + FIRE_RIM;
    circle(gx, f.x, f.y + 4, rr, 'rgba(0,0,0,0.35)');
    if (tk.bouncy > 0) glow(gx, COLORS.gold, 14);
    // The owner's colour as a band around the red button, with a dark gap so a red-ish
    // player colour (Pink) still reads as a separate ring.
    circle(gx, f.x, f.y, rr, look.rim);
    noGlow(gx);
    circle(gx, f.x, f.y, r + 1, look.fill, look.gap, 2.5);
    circle(gx, f.x, f.y - r * 0.25, r * 0.7, 'rgba(255,255,255,0.12)');
    if (tk.reload > 0) {
      gx.beginPath();
      gx.arc(f.x, f.y, rr + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - tk.reload / RULES.reload));
      gx.strokeStyle = alpha('#ffffff', 0.7);
      gx.lineWidth = 3;
      gx.stroke();
    }
    text(gx, 'FIRE', f.x, f.y, { size: 17, player: p, color: '#ffffff', stroke: 'rgba(0,0,0,0.35)' });
    const left = RULES.maxShells - g.shellsOf(p);
    for (let i = 0; i < RULES.maxShells; i++) {
      const o = seat(p, cs.fireX - 16 + i * 16, CONTROLS_Y - FIRE_R - FIRE_RIM - 15);
      circle(gx, o.x, o.y, 5, i < left ? (tk.bouncy > 0 ? COLORS.gold : '#ffffff') : 'rgba(255,255,255,0.18)', 'rgba(0,0,0,0.3)', 1.5);
    }
    // Hearts (armor left), readable from either side
    const hearts = g.hearts(p);
    const n = tk.armor;
    const step = Math.min(16, 120 / n);
    for (let i = 0; i < n; i++) {
      const o = seat(p, HEARTS.x + (i - (n - 1) / 2) * step, HEARTS.y);
      text(gx, '♥', o.x, o.y, { size: 17, player: p, color: i < hearts ? '#ff5c7a' : 'rgba(255,255,255,0.18)', stroke: i < hearts ? 'rgba(0,0,0,0.3)' : undefined });
    }
    // Bonks scored, or the clock near the end
    const sc = seat(p, HEARTS.x, HEARTS.y + 21);
    const leftT = RULES.timeCap - g.playTime;
    if (g.sudden && !g.over) text(gx, 'Sudden bonk: next hit wins!', sc.x, sc.y, { size: 13, player: p, color: COLORS.gold });
    else if (!g.over && leftT < 20) text(gx, `⏱ ${Math.ceil(leftT)} s`, sc.x, sc.y, { size: 13, player: p, color: leftT < 6 ? COLORS.gold : '#ffffff' });
    else text(gx, `${g.score[p]} bonk${g.score[p] === 1 ? '' : 's'}`, sc.x, sc.y, { size: 13, player: p, color: COLORS.dim, weight: 700 });
  }

  private drawOverlay(gx: G): void {
    const g = this.game;
    if (g.phase === 'ready' || this.banner.t > 0) {
      const str = g.phase === 'ready' ? `Round ${g.round}` : this.banner.str;
      const sub = g.phase === 'ready' ? LAYOUTS[g.layout].name : '';
      const a = Math.min(1, (g.phase === 'ready' ? g.phaseT : this.banner.t) * 3);
      for (const p of PLAYERS) {
        const y = p === 0 ? MID + 56 : MID - 56;
        rrect(gx, W / 2 - 92, y - 24, 184, 48, 24, `rgba(42,33,80,${0.78 * a})`);
        text(gx, str, W / 2, y + (sub ? (p === 0 ? -6 : 6) : 0), { size: 20, player: p, color: this.banner.color, alpha: a });
        if (sub) text(gx, sub, W / 2, y + (p === 0 ? 12 : -12), { size: 13, player: p, color: 'rgba(255,255,255,0.85)', alpha: a, weight: 700 });
      }
    }
  }
}

const def: GameDef = { id: 'tanks', create: (ctx) => new TankView(ctx) };
export default def;
