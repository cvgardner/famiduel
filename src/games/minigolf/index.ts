// Minigolf view: the course turns to face whoever is shooting. Pull back
// (slingshot) anywhere near your ball or in your half, release to putt.
import { other, PLAYERS, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, line, noGlow, rrect, shade, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { PowerButton } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { Minigolf, MinigolfBot, RULES, type Intent, type Shot } from './logic';
import { inZone, moverSegs, PHYS, simulate, type Course, type Pt } from './physics';

/** Screen units of pull for a full-power shot. */
const MAX_PULL = 120;
const MIN_PULL = 14;
const TURN_ANIM = 0.6;
const STRIP = 62;

type Aim = { id: number; sx: number; sy: number; x: number; y: number };

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

class MinigolfView implements GameInstance {
  readonly game: Minigolf;
  private bots: (MinigolfBot | null)[];
  private powerBtns: (PowerButton | null)[];
  private t = 0;
  /** View rotation (radians). Turns by 180° each time the shooter changes. */
  private rot = 0;
  private rotFrom = 0;
  private rotTo = 0;
  private rotT = 1;
  private facingP: PlayerIndex = 0;
  private aim: (Aim | null)[] = [null, null];
  private keyAim: { angle: number; power: number; on: boolean }[] = [
    { angle: -Math.PI / 2, power: 0.5, on: false },
    { angle: -Math.PI / 2, power: 0.5, on: false },
  ];
  private trail: { x: number; y: number }[] = [];
  private bannerT = 0;
  private lastWallSfx = 0;
  private flagWiggle = 0;
  private sunkFlash = 0;
  private ended = false;

  constructor(private readonly ctx: GameContext) {
    this.game = new Minigolf(ctx.players, ctx.powersOn, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new MinigolfBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      return p === 0 ? new PowerButton(38, H - 31, 0, pw, ctx.players[0].color) : new PowerButton(W - 38, 31, 1, pw, ctx.players[1].color);
    });
    this.facingP = this.game.leadOff;
    this.rot = this.rotFrom = this.rotTo = this.facingP === 1 ? Math.PI : 0;
  }

  // ---------- coordinates ----------
  private toScreen(x: number, y: number): { x: number; y: number } {
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    const dx = x - W / 2;
    const dy = y - MID;
    return { x: W / 2 + dx * c - dy * s, y: MID + dx * s + dy * c };
  }

  /** Screen vector → course vector (undo the view rotation). */
  private toCourseVec(x: number, y: number): { x: number; y: number } {
    const c = Math.cos(-this.rot);
    const s = Math.sin(-this.rot);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  private turnTo(p: PlayerIndex): void {
    if (p === this.facingP) return;
    this.facingP = p;
    this.rotFrom = this.rot;
    this.rotTo = this.rot + Math.PI;
    this.rotT = 0;
  }

  // ---------- update ----------
  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    const intents = PLAYERS.map((p): Intent => {
      const bot = this.bots[p];
      if (bot) return bot.think(g, dt);
      const btn = this.powerBtns[p];
      const fire = btn ? btn.update(input, g.energy[p], KEYS[p].power) && g.canFire(p) : false;
      const shot = this.humanShot(p, input);
      return { shot, power: fire };
    }) as [Intent, Intent];
    g.step(dt, intents);

    // View turn: during the hole intro face whoever tees off, then the shooter.
    const want = g.phase === 'intro' || g.phase === 'card' ? g.leadOff : g.shooter;
    if (g.phase !== 'over') this.turnTo(want);
    if (this.rotT < 1) {
      this.rotT = Math.min(1, this.rotT + dt / TURN_ANIM);
      this.rot = this.rotFrom + (this.rotTo - this.rotFrom) * ease(this.rotT);
    }
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.flagWiggle = Math.max(0, this.flagWiggle - dt);
    this.sunkFlash = Math.max(0, this.sunkFlash - dt);

    if (g.phase === 'roll') {
      const b = g.balls[g.shooter];
      this.trail.push({ x: b.x, y: b.y });
      if (this.trail.length > 16) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();

    this.juice();
  }

  /** A human's drag (or keys) for this frame; returns a shot on release. */
  private humanShot(p: PlayerIndex, input: Input): Shot | null {
    const g = this.game;
    const myTurn = g.phase === 'aim' && g.shooter === p;
    if (!myTurn) {
      this.aim[p] = null;
      this.keyAim[p].on = false;
      return null;
    }
    const ball = g.balls[p];
    const bs = this.toScreen(ball.x, ball.y);
    const btns = this.powerBtns.filter((b) => b) as PowerButton[];
    let a = this.aim[p];
    if (!a) {
      // Any new finger in your own half, or right next to your ball, starts the pull.
      const f = input.all().find(
        (f) => f.pressed && !btns.some((b) => b.button.hit(f.x, f.y)) && (f.owner === p || Math.hypot(f.x - bs.x, f.y - bs.y) < 110),
      );
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
        const s = this.pullShot(a);
        if (s) return s;
      }
      return null;
    }
    // Desktop keys: left/right turn the aim, up/down set power, action shoots.
    const k = KEYS[p];
    const ka = this.keyAim[p];
    if (input.key(k.left)) ((ka.angle -= 0.035), (ka.on = true));
    if (input.key(k.right)) ((ka.angle += 0.035), (ka.on = true));
    if (input.key(k.up)) ((ka.power = Math.min(1, ka.power + 0.012)), (ka.on = true));
    if (input.key(k.down)) ((ka.power = Math.max(RULES.minPower, ka.power - 0.012)), (ka.on = true));
    if (ka.on && input.keyPressed(k.action)) {
      ka.on = false;
      return { angle: ka.angle - this.rot, power: ka.power };
    }
    return null;
  }

  private pullShot(a: Aim): Shot | null {
    const dx = a.x - a.sx;
    const dy = a.y - a.sy;
    const d = Math.hypot(dx, dy);
    if (d < MIN_PULL) return null;
    const v = this.toCourseVec(-dx, -dy);
    return { angle: Math.atan2(v.y, v.x), power: Math.min(1, d / MAX_PULL) };
  }

  /** The shot the shooter is lining up right now (for the guide), if any. */
  private pendingShot(): Shot | null {
    const g = this.game;
    if (g.phase !== 'aim') return null;
    const p = g.shooter;
    const a = this.aim[p];
    if (a) return this.pullShot(a);
    const ka = this.keyAim[p];
    if (ka.on) return { angle: ka.angle - this.rot, power: ka.power };
    return null;
  }

  private juice(): void {
    const g = this.game;
    const { sfx, fx, players } = this.ctx;
    const both = (str: string, x: number, y: number, color: string, size = 26) => {
      fx.pop(str, x, y + 40, color, 0, size);
      fx.pop(str, x, y - 40, color, 1, size);
    };
    for (const e of g.events) {
      if (e.type === 'holeStart') {
        sfx.play('whoosh');
      } else if (e.type === 'turn') {
        sfx.play('pop');
        this.bannerT = 1.6;
      } else if (e.type === 'shot') {
        sfx.play('hit');
        const s = this.toScreen(e.x, e.y);
        fx.burst(s.x, s.y, '#ffffff', Math.round(5 + e.power * 10), 80 + e.power * 160, 2.5);
        if (e.power > 0.85) fx.shake(3, 0.12);
      } else if (e.type === 'wall') {
        if (this.t - this.lastWallSfx > 0.06) {
          sfx.play(e.mover ? 'thud' : 'bounce');
          this.lastWallSfx = this.t;
        }
        const s = this.toScreen(e.x, e.y);
        fx.burst(s.x, s.y, e.mover ? '#ffb74d' : '#d7a36a', Math.round(3 + e.speed / 90), 60 + e.speed * 0.2, 2.5);
        if (e.speed > 500) fx.shake(3, 0.1);
      } else if (e.type === 'sand') {
        sfx.play('chop');
        const s = this.toScreen(e.x, e.y);
        fx.burst(s.x, s.y, '#e8d29a', 12, 120, 3);
      } else if (e.type === 'ghost') {
        sfx.play('whoosh');
        const s = this.toScreen(e.x, e.y);
        fx.burst(s.x, s.y, '#c9a7ff', 18, 140, 3.5);
        fx.pop('Boo!', s.x, s.y + (g.shooter === 0 ? -26 : 26), '#e3d4ff', g.shooter, 22);
      } else if (e.type === 'lip') {
        sfx.play('click');
        const s = this.toScreen(e.x, e.y);
        fx.pop('Too fast!', s.x, s.y + (g.shooter === 0 ? -26 : 26), '#ffffff', g.shooter, 18);
      } else if (e.type === 'water') {
        sfx.play(e.out ? 'buzz' : 'splash');
        const s = this.toScreen(e.x, e.y);
        if (!e.out) {
          fx.burst(s.x, s.y, '#7cc8ff', 26, 200, 4);
          fx.burst(s.x, s.y, '#ffffff', 10, 120, 2.5);
        }
        fx.shake(4, 0.2);
        both(e.out ? 'Out! +1 stroke' : 'Splash! +1 stroke', W / 2, MID, '#9fd8ff', 24);
      } else if (e.type === 'sunk') {
        const c = players[e.p].color;
        const cs = this.toScreen(g.hole.cup[0], g.hole.cup[1]);
        const ace = e.strokes === 1;
        sfx.play(ace ? 'win' : 'score');
        sfx.play('coin');
        this.flagWiggle = 1;
        this.sunkFlash = 0.8;
        for (const col of [c, COLORS.gold, '#ffffff', '#4ade80']) fx.burst(cs.x, cs.y, col, ace ? 22 : 12, ace ? 320 : 220, 4);
        fx.shake(ace ? 9 : 5, ace ? 0.4 : 0.2);
        if (ace) fx.flash(COLORS.gold, 0.25);
        both(sunkLabel(e.strokes, e.par), W / 2, MID, ace ? COLORS.gold : c, ace ? 34 : 28);
      } else if (e.type === 'pickup') {
        sfx.play('buzz');
        both(`Picked up · ${RULES.strokeCap}`, W / 2, MID, '#ffffff', 22);
      } else if (e.type === 'stop') {
        sfx.play('tap');
      } else if (e.type === 'power') {
        sfx.play('power');
        const pw = players[e.p].power!;
        fx.flash('#ffd54a', 0.15);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, MID + 70, COLORS.gold, 0, 26);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, MID - 70, COLORS.gold, 1, 26);
      } else if (e.type === 'holeEnd') {
        sfx.play('count');
      } else if (e.type === 'win' && !this.ended) {
        this.ended = true;
        const [a, b] = g.score;
        this.ctx.end({ winner: e.p, score: [a, b], summary: `${a} – ${b} strokes` });
      }
    }
  }

  // ---------- render ----------
  render(gx: G): void {
    const g = this.game;
    gx.fillStyle = '#16302a';
    gx.fillRect(0, 0, W, H);
    // faint garden dots
    gx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 8; y < H; y += 24) for (let x = (y / 24) % 2 ? 8 : 20; x < W; x += 24) gx.fillRect(x, y, 3, 3);

    gx.save();
    gx.translate(W / 2, MID);
    gx.rotate(this.rot);
    gx.translate(-W / 2, -MID);
    this.drawCourse(gx, g.course);
    this.drawPowersOnCourse(gx);
    this.drawBalls(gx);
    this.drawGuide(gx);
    gx.restore();

    for (const p of PLAYERS) facing(gx, p, W / 2, MID, () => this.drawStrip(gx, p));
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, g.energy[p], this.t);
    if (g.phase === 'intro') for (const p of PLAYERS) facing(gx, p, W / 2, MID, () => this.drawIntro(gx, p));
    else if (g.phase === 'card' || g.phase === 'over') {
      gx.fillStyle = 'rgba(8,10,20,0.55)';
      gx.fillRect(0, 0, W, H);
      for (const p of PLAYERS) facing(gx, p, W / 2, MID, () => this.drawCard(gx, p));
    } else if (this.bannerT > 0 && (g.phase === 'turn' || g.phase === 'aim') && !this.pendingShot()) {
      for (const p of PLAYERS) facing(gx, p, W / 2, MID, () => this.drawBanner(gx, p));
    }
  }

  private drawCourse(gx: G, c: Course): void {
    const h = c.hole;
    const t = this.game.t;
    const poly = (pts: Pt[]) => {
      gx.beginPath();
      pts.forEach(([x, y], i) => (i ? gx.lineTo(x, y) : gx.moveTo(x, y)));
      gx.closePath();
    };
    // Floor with mowing stripes.
    gx.save();
    poly(c.border);
    gx.fillStyle = '#3fae5e';
    gx.fill();
    gx.clip();
    gx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let y = 0; y < H; y += 40) gx.fillRect(0, y, W, 20);
    // Zones
    for (const z of c.zones) {
      const shape = () => {
        if (z.circle) {
          gx.beginPath();
          gx.arc(z.circle[0], z.circle[1], z.circle[2], 0, Math.PI * 2);
        } else poly(z.poly!);
      };
      if (z.type === 'water') {
        shape();
        gx.fillStyle = '#2f8fd8';
        gx.fill();
        gx.lineWidth = 4;
        gx.strokeStyle = '#a5dcff';
        gx.stroke();
        gx.save();
        shape();
        gx.clip();
        const cx = (z.minX + z.maxX) / 2;
        const cy = (z.minY + z.maxY) / 2;
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.4 + i / 3) % 1;
          circle(gx, cx, cy, 8 + k * Math.max(z.maxX - z.minX, z.maxY - z.minY) * 0.6, undefined, `rgba(255,255,255,${0.25 * (1 - k)})`, 2);
        }
        if (z.circle && z.circle[2] > 40) {
          // lily pads
          for (const [ox, oy, r] of [[-0.45, -0.3, 11], [0.35, 0.4, 9], [0.5, -0.45, 7]]) {
            const px = z.circle[0] + ox * z.circle[2];
            const py = z.circle[1] + oy * z.circle[2];
            gx.beginPath();
            gx.moveTo(px, py);
            gx.arc(px, py, r, 0.4, Math.PI * 2 - 0.1);
            gx.closePath();
            gx.fillStyle = '#4caf50';
            gx.fill();
          }
          circle(gx, z.circle[0] - 0.45 * z.circle[2] + 3, z.circle[1] - 0.3 * z.circle[2] - 2, 3.5, '#ff9ecb');
        }
        gx.restore();
      } else if (z.type === 'sand') {
        shape();
        gx.fillStyle = '#ead39a';
        gx.fill();
        gx.lineWidth = 3;
        gx.strokeStyle = '#d4b56f';
        gx.stroke();
        gx.fillStyle = 'rgba(160,120,60,0.35)';
        for (let i = 0; i < 26; i++) {
          const px = z.minX + ((i * 37) % 97) / 97 * (z.maxX - z.minX);
          const py = z.minY + ((i * 61) % 89) / 89 * (z.maxY - z.minY);
          if (inZone(z, px, py)) gx.fillRect(px, py, 2, 2);
        }
      } else if (z.type === 'slope' && z.accel) {
        shape();
        gx.fillStyle = 'rgba(20,70,40,0.28)';
        gx.fill();
        gx.save();
        shape();
        gx.clip();
        const a = Math.atan2(z.accel[1], z.accel[0]);
        const strong = Math.hypot(z.accel[0], z.accel[1]) > PHYS.grass.decel;
        const step = 34;
        const off = (t * (strong ? 30 : 16)) % step;
        gx.strokeStyle = `rgba(255,255,255,${strong ? 0.4 : 0.25})`;
        gx.lineWidth = 3;
        gx.lineCap = 'round';
        for (let u = -400; u < 400; u += step) {
          for (let v = -400; v < 400; v += 46) {
            const cx = (z.minX + z.maxX) / 2;
            const cy = (z.minY + z.maxY) / 2;
            const px = cx + Math.cos(a) * (u + off) - Math.sin(a) * v;
            const py = cy + Math.sin(a) * (u + off) + Math.cos(a) * v;
            if (px < z.minX - 10 || px > z.maxX + 10 || py < z.minY - 10 || py > z.maxY + 10) continue;
            chevron(gx, px, py, a, 7);
          }
        }
        gx.restore();
      } else if (z.type === 'bowl' && z.circle) {
        const [cx, cy, r] = z.circle;
        const grad = gx.createRadialGradient(cx, cy, 4, cx, cy, r);
        grad.addColorStop(0, 'rgba(10,50,25,0.45)');
        grad.addColorStop(1, 'rgba(10,50,25,0)');
        circle(gx, cx, cy, r, grad as unknown as string);
        for (let i = 1; i <= 3; i++) {
          const k = ((i / 3 - t * 0.25) % 1 + 1) % 1;
          circle(gx, cx, cy, 14 + k * (r - 14), undefined, `rgba(255,255,255,${0.18 * k})`, 2);
        }
      }
    }
    gx.restore();
    // Tee mat
    const [tx, ty] = h.tee;
    rrect(gx, tx - 18, ty - 9, 36, 18, 5, 'rgba(20,60,30,0.45)', 'rgba(255,255,255,0.35)', 1.5);
    // Cup and flag
    const [cx, cy] = h.cup;
    circle(gx, cx, cy, PHYS.cupR + 3, '#e8f5e9');
    circle(gx, cx, cy, PHYS.cupR, '#0f1a14');
    circle(gx, cx, cy + 2, PHYS.cupR - 3, '#000000');
    if (this.sunkFlash > 0) circle(gx, cx, cy, PHYS.cupR + 6 + (1 - this.sunkFlash) * 30, undefined, `rgba(255,213,74,${this.sunkFlash})`, 4);
    const wig = Math.sin(this.t * 18) * this.flagWiggle * 0.5;
    gx.save();
    gx.translate(cx, cy);
    gx.rotate(wig * 0.3);
    line(gx, 0, 0, 0, -42, '#f5f5f5', 2.5);
    gx.beginPath();
    const flap = Math.sin(this.t * 4) * 2;
    gx.moveTo(1, -42);
    gx.quadraticCurveTo(12, -40 + flap, 24, -36 + flap);
    gx.lineTo(1, -28);
    gx.closePath();
    gx.fillStyle = '#ff4d6d';
    gx.fill();
    gx.restore();
    // Walls
    for (const w of h.walls) {
      if (w.kind === 'border') {
        poly(w.pts);
        gx.lineJoin = 'round';
        gx.lineWidth = 11;
        gx.strokeStyle = '#5b3416';
        gx.stroke();
        gx.lineWidth = 5;
        gx.strokeStyle = '#b77a45';
        gx.stroke();
      } else if (w.closed) {
        poly(w.pts);
        gx.fillStyle = '#8a5a30';
        gx.fill();
        gx.lineJoin = 'round';
        gx.lineWidth = 4;
        gx.strokeStyle = '#5b3416';
        gx.stroke();
        poly(w.pts);
        gx.lineWidth = 1.5;
        gx.strokeStyle = 'rgba(255,220,170,0.5)';
        gx.stroke();
      } else {
        for (let i = 0; i < w.pts.length - 1; i++) {
          line(gx, w.pts[i][0], w.pts[i][1], w.pts[i + 1][0], w.pts[i + 1][1], '#5b3416', 11);
          line(gx, w.pts[i][0], w.pts[i][1], w.pts[i + 1][0], w.pts[i + 1][1], '#b77a45', 5);
        }
      }
    }
    // Moving obstacles
    h.movers.forEach((m) => {
      if (m.type === 'slider') {
        const [ax, ay] = m.a;
        const [bx, by] = m.b;
        gx.setLineDash([4, 6]);
        line(gx, Math.min(ax, bx) - Math.abs(m.travel[0]), ay - m.travel[1], Math.max(ax, bx) + Math.abs(m.travel[0]), by + m.travel[1], 'rgba(255,255,255,0.25)', 2);
        gx.setLineDash([]);
      }
    });
    for (const s of moverSegs(h, t)) {
      if (s.spin) {
        line(gx, s.ax, s.ay + 3, s.bx, s.by + 3, 'rgba(0,0,0,0.25)', 9);
        line(gx, s.ax, s.ay, s.bx, s.by, '#7a1f1f', 10);
        line(gx, s.ax, s.ay, s.bx, s.by, '#ff6b6b', 6);
        circle(gx, s.bx, s.by, 3, '#ffffff');
      } else {
        line(gx, s.ax, s.ay + 3, s.bx, s.by + 3, 'rgba(0,0,0,0.25)', 11);
        line(gx, s.ax, s.ay, s.bx, s.by, '#8a5200', 12);
        line(gx, s.ax, s.ay, s.bx, s.by, '#ffb300', 7);
      }
    }
    for (const m of h.movers) {
      if (m.type === 'windmill') {
        circle(gx, m.x, m.y, 10, '#ffffff', '#7a1f1f', 3);
        circle(gx, m.x, m.y, 3.5, '#7a1f1f');
      }
    }
  }

  private drawPowersOnCourse(gx: G): void {
    const g = this.game;
    const p = g.shooter;
    const live = g.phase === 'roll' ? g.rollMods : g.phase === 'turn' || g.phase === 'aim' ? g.modsFor(p) : null;
    if (!live) return;
    const [cx, cy] = g.hole.cup;
    if (live.magnet) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
      glow(gx, '#ff5cf0', 18);
      circle(gx, cx, cy, PHYS.magnet.radius, 'rgba(255,92,240,0.10)', `rgba(255,140,245,${0.5 + 0.3 * pulse})`, 3);
      noGlow(gx);
      for (let i = 0; i < 3; i++) {
        const k = 1 - ((this.t * 0.8 + i / 3) % 1);
        circle(gx, cx, cy, PHYS.cupR + k * (PHYS.magnet.radius - PHYS.cupR), undefined, `rgba(255,170,250,${0.5 * (1 - k)})`, 2);
      }
    }
    if (live.wind) {
      const [wx, wy] = live.wind;
      const a = Math.atan2(wy, wx);
      gx.strokeStyle = 'rgba(230,245,255,0.75)';
      gx.lineWidth = 3;
      gx.lineCap = 'round';
      const N = 28;
      for (let i = 0; i < N; i++) {
        const lane = ((i * 17) % N) / N;
        const k = (this.t * 0.6 + (i * 11) / N) % 1;
        const u = -380 + k * 760;
        const v = -320 + lane * 640;
        const px = W / 2 + Math.cos(a) * u - Math.sin(a) * v;
        const py = MID + Math.sin(a) * u + Math.cos(a) * v;
        gx.beginPath();
        gx.moveTo(px - Math.cos(a) * 26, py - Math.sin(a) * 26);
        gx.lineTo(px, py);
        gx.stroke();
        chevron(gx, px, py, a, 5);
      }
      // A big arrow beside the shooter's ball.
      const b = g.balls[p];
      const bx = b.x + Math.cos(a) * 34;
      const by = b.y + Math.sin(a) * 34;
      gx.save();
      gx.translate(bx, by);
      gx.rotate(a);
      gx.beginPath();
      gx.moveTo(-16, -5);
      gx.lineTo(6, -5);
      gx.lineTo(6, -11);
      gx.lineTo(18, 0);
      gx.lineTo(6, 11);
      gx.lineTo(6, 5);
      gx.lineTo(-16, 5);
      gx.closePath();
      gx.fillStyle = 'rgba(230,245,255,0.9)';
      gx.fill();
      gx.strokeStyle = '#3a6ea5';
      gx.lineWidth = 2;
      gx.stroke();
      gx.restore();
    }
  }

  private drawBalls(gx: G): void {
    const g = this.game;
    const order: PlayerIndex[] = [other(g.shooter), g.shooter];
    const ghostOn = (p: PlayerIndex) =>
      (g.phase === 'roll' && p === g.shooter && g.roll?.ghost) || ((g.phase === 'turn' || g.phase === 'aim') && p === g.shooter && g.ghost[p]);
    // Trail
    const rollGhost = g.phase === 'roll' && g.rollMods.ghost;
    this.trail.forEach((pt, i) => {
      const k = i / this.trail.length;
      circle(gx, pt.x, pt.y, PHYS.ballR * k * (rollGhost ? 1.1 : 0.8), rollGhost ? `rgba(200,170,255,${0.35 * k})` : `rgba(255,255,255,${0.22 * k})`);
    });
    for (const p of order) {
      const b = g.balls[p];
      if (b.done || g.phase === 'card' || g.phase === 'over') continue;
      const c = this.ctx.players[p].color;
      const active = p === g.shooter;
      const ghost = ghostOn(p);
      gx.globalAlpha = active ? (ghost ? 0.65 : 1) : 0.5;
      if (active && (g.phase === 'aim' || g.phase === 'turn')) {
        const pr = PHYS.ballR + 7 + 3 * Math.sin(this.t * 6);
        circle(gx, b.x, b.y, pr, alpha(c, 0.18), alpha(c, 0.9), 2.5);
      }
      circle(gx, b.x + 1.5, b.y + 2.5, PHYS.ballR, 'rgba(0,0,0,0.3)');
      if (ghost) glow(gx, '#b48cff', 14);
      circle(gx, b.x, b.y, PHYS.ballR, ghost ? '#efe6ff' : '#ffffff', c, 3);
      noGlow(gx);
      circle(gx, b.x - 2, b.y - 2, 2, 'rgba(255,255,255,0.9)');
      gx.globalAlpha = 1;
    }
  }

  private drawGuide(gx: G): void {
    const g = this.game;
    const shot = this.pendingShot();
    if (!shot) return;
    const p = g.shooter;
    const b = g.balls[p];
    const c = this.ctx.players[p].color;
    const pw = Math.max(RULES.minPower, shot.power);
    // Rubber band behind the ball (where the finger pulls).
    const back = 14 + pw * 46;
    const bx = b.x - Math.cos(shot.angle) * back;
    const by = b.y - Math.sin(shot.angle) * back;
    line(gx, b.x, b.y, bx, by, alpha(c, 0.8), 4);
    circle(gx, bx, by, 6, c, '#ffffff', 2);
    // Power ring: green → gold → red.
    const ringC = pw < 0.5 ? '#4ade80' : pw < 0.8 ? COLORS.gold : '#ff6b5c';
    gx.beginPath();
    gx.lineWidth = 4;
    gx.lineCap = 'round';
    gx.strokeStyle = ringC;
    gx.arc(b.x, b.y, PHYS.ballR + 9, shot.angle - Math.PI * pw, shot.angle + Math.PI * pw);
    gx.stroke();
    // Predicted path (the handicap knob: assist shows more of it).
    const sim = simulate(g.course, b.x, b.y, shot.angle, pw, g.t + 1 / 60, g.modsFor(p), 1 / 60, g.guideLen(p));
    const pts = sim.path;
    const total = g.guideLen(p);
    const gap = 11;
    let acc = 0;
    let next = gap;
    for (let i = 1; i < pts.length && next <= total; i++) {
      const [ax, ay] = pts[i - 1];
      const [x, y] = pts[i];
      const seg = Math.hypot(x - ax, y - ay);
      while (seg > 0 && acc + seg >= next && next <= total) {
        const u = (next - acc) / seg;
        const k = 1 - next / total;
        circle(gx, ax + (x - ax) * u, ay + (y - ay) * u, 2.8, `rgba(255,255,255,${0.2 + 0.75 * k})`);
        next += gap;
      }
      acc += seg;
    }
    if (sim.roll.status === 'water' || sim.roll.status === 'out') {
      const [ex, ey] = pts[pts.length - 1];
      line(gx, ex - 6, ey - 6, ex + 6, ey + 6, '#ff5c7a', 4);
      line(gx, ex - 6, ey + 6, ex + 6, ey - 6, '#ff5c7a', 4);
    }
    if (sim.roll.status === 'sunk') circle(gx, g.hole.cup[0], g.hole.cup[1], PHYS.cupR + 5, undefined, 'rgba(255,213,74,0.9)', 3);
  }

  /** Bottom strip of player p's own frame (drawn rotated for player 1). */
  private drawStrip(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const c = this.ctx.players[p].color;
    const myTurn = (g.phase === 'aim' || g.phase === 'turn') && g.shooter === p;
    const y0 = H - STRIP;
    gx.fillStyle = myTurn ? alpha(c, 0.28 + 0.08 * Math.sin(this.t * 5)) : 'rgba(10,12,28,0.85)';
    gx.fillRect(0, y0, W, STRIP);
    gx.fillStyle = 'rgba(10,12,28,0.6)';
    if (myTurn) gx.fillRect(0, y0 + 4, W, STRIP - 4);
    gx.fillStyle = c;
    gx.fillRect(0, y0, W, myTurn ? 4 : 2);
    const btn = this.powerBtns[p];
    const x0 = btn ? 74 : 54;
    const name = this.ctx.players[p].name;
    text(gx, name, x0, y0 + 19, { size: 17, color: c, align: 'left' });
    let status: string;
    let sc: string = COLORS.dim;
    if (g.phase === 'over') status = 'Match over';
    else if (myTurn) {
      status = this.bots[p] ? 'Lining up…' : 'Your shot! Pull back, let go';
      sc = '#ffffff';
    } else if (g.balls[p].done && g.phase !== 'card' && g.phase !== 'intro') status = g.balls[p].sunk ? 'In the hole ✓' : 'Picked up';
    else if (g.phase === 'roll' && g.shooter === p) status = 'Rolling…';
    else if (g.phase === 'intro' || g.phase === 'card') status = `Hole ${g.holeIdx + 1} of ${g.holes.length} · Par ${g.hole.par}`;
    else status = `Wait · ${this.ctx.players[other(p)].name} shoots`;
    // Armed power badges
    const badges: string[] = [];
    if (g.magnet[p]) badges.push('🧲');
    if (g.ghost[p]) badges.push('👻');
    if (g.wind[p]) badges.push('🌬️ on you');
    if (g.wind[p]?.dir && myTurn) badges[badges.length - 1] = '🌬️ Wind!';
    if (badges.length) status = myTurn ? `${badges.join(' ')} · Pull back, let go` : `${badges.join(' ')} next shot`;
    text(gx, status, x0, y0 + 42, { size: 13, color: sc, align: 'left', weight: 700 });
    // Scores
    const hs = g.phase === 'card' || g.phase === 'over' || g.phase === 'intro' ? '–' : String(g.balls[p].strokes);
    text(gx, 'Hole', 268, y0 + 14, { size: 13, color: COLORS.dim });
    text(gx, hs, 268, y0 + 36, { size: 24, color: '#ffffff' });
    text(gx, 'Total', 322, y0 + 14, { size: 13, color: COLORS.dim });
    text(gx, String(g.total(p)), 322, y0 + 36, { size: 24, color: c });
    if (g.bonus(p) > 0) text(gx, `★ −${g.bonus(p)} a hole`, 295, y0 + 54, { size: 13, color: COLORS.gold, weight: 700 });
  }

  private drawBanner(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const k = Math.min(1, this.bannerT / 0.3, (1.6 - this.bannerT) / 0.2 + 0.2);
    const shooter = g.shooter;
    const c = this.ctx.players[shooter].color;
    const fade = Math.max(0, Math.min(1, k));
    gx.globalAlpha = fade;
    if (p === shooter) {
      const y = MID + 70;
      rrect(gx, 30, y - 26, W - 60, 52, 26, c, '#ffffff', 3);
      text(gx, 'YOUR SHOT!', W / 2, y, { size: 30, color: '#ffffff', stroke: shade(c, -0.5), alpha: fade });
    } else {
      const y = H - STRIP - 22;
      rrect(gx, 60, y - 15, W - 120, 30, 15, 'rgba(10,12,28,0.8)', alpha(c, 0.9), 2);
      text(gx, `${this.ctx.players[shooter].name}'s shot`, W / 2, y, { size: 17, color: c, alpha: fade });
    }
    gx.globalAlpha = 1;
  }

  private drawIntro(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const k = Math.min(1, (RULES.introTime - g.timer) / 0.25, g.timer / 0.25);
    gx.globalAlpha = Math.max(0, k);
    const y = MID + 150;
    rrect(gx, 40, y - 62, W - 80, 124, 20, 'rgba(10,12,28,0.88)', 'rgba(255,255,255,0.3)', 2);
    // text() draws at its own alpha, so pass the card's: the words fade in with
    // their dark card instead of popping onto the bright grass ahead of it.
    const fade = Math.max(0, k);
    text(gx, `HOLE ${g.holeIdx + 1} OF ${g.holes.length}`, W / 2, y - 38, { size: 13, color: COLORS.dim, alpha: fade });
    text(gx, g.hole.name, W / 2, y - 10, { size: 28, color: '#ffffff', alpha: fade });
    text(gx, `Par ${g.hole.par}`, W / 2, y + 18, { size: 15, color: COLORS.gold, alpha: fade });
    const lead = g.leadOff;
    const who = lead === p ? 'You tee off first' : `${this.ctx.players[lead].name} tees off first`;
    text(gx, who, W / 2, y + 42, { size: 14, color: this.ctx.players[lead].color, weight: 700, alpha: fade });
    gx.globalAlpha = 1;
  }

  private drawCard(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const q = other(p);
    const x0 = 22;
    const w = W - 44;
    const rows = g.holes.length;
    const y0 = MID + 6;
    const hgt = 46 + 30 + rows * 30 + 26;
    rrect(gx, x0, y0, w, hgt, 18, '#fdf8ec', '#c9b78f', 3);
    const ink = '#2b2459';
    const final = g.phase === 'over' || g.card.length === g.holes.length;
    text(gx, final ? 'FINAL SCORECARD' : 'SCORECARD', W / 2, y0 + 22, { size: 15, color: ink });
    const colHole = x0 + 16;
    const colA = x0 + w - 116;
    const colB = x0 + w - 46;
    const hy = y0 + 46;
    text(gx, 'Hole', colHole, hy, { size: 13, color: '#7a6f99', align: 'left' });
    text(gx, 'You', colA, hy, { size: 13, color: shade(this.ctx.players[p].color, -0.25) });
    text(gx, short(this.ctx.players[q].name), colB, hy, { size: 13, color: shade(this.ctx.players[q].color, -0.25) });
    line(gx, x0 + 10, hy + 13, x0 + w - 10, hy + 13, 'rgba(43,36,89,0.2)', 1.5);
    for (let i = 0; i < rows; i++) {
      const y = hy + 30 + i * 30;
      const hs = g.card[i];
      const latest = i === g.card.length - 1;
      if (latest) rrect(gx, x0 + 8, y - 14, w - 16, 28, 8, 'rgba(255,213,74,0.35)');
      text(gx, `${i + 1}. ${g.holes[i].name}`, colHole, y - 3, { size: 14, color: ink, align: 'left', weight: 700 });
      text(gx, `Par ${g.holes[i].par}`, colHole, y + 11, { size: 13, color: '#7a6f99', align: 'left', weight: 600 });
      for (const [pl, x] of [[p, colA], [q, colB]] as [PlayerIndex, number][]) {
        if (!hs) {
          text(gx, '–', x, y, { size: 18, color: '#b0a8c8' });
          continue;
        }
        const win = hs.net[pl] < hs.net[other(pl)];
        if (win) circle(gx, x, y, 15, alpha(this.ctx.players[pl].color, 0.25));
        text(gx, String(hs.net[pl]), x, y, { size: 20, color: ink });
        if (hs.bonus[pl]) text(gx, `★−${hs.bonus[pl]}`, x + 25, y - 6, { size: 13, color: '#b8860b', weight: 800 });
      }
    }
    const ty = hy + 30 + rows * 30 + 4;
    line(gx, x0 + 10, ty - 15, x0 + w - 10, ty - 15, 'rgba(43,36,89,0.3)', 2);
    text(gx, 'Total', colHole, ty, { size: 15, color: ink, align: 'left' });
    const tp = g.score[p];
    const tq = g.score[q];
    text(gx, String(tp), colA, ty, { size: 22, color: shade(this.ctx.players[p].color, -0.2) });
    text(gx, String(tq), colB, ty, { size: 22, color: shade(this.ctx.players[q].color, -0.2) });
    // Who is ahead, from this seat
    const msg = final
      ? tp < tq ? 'You win! 🏆' : tq < tp ? `${this.ctx.players[q].name} wins!` : 'All square: a draw!'
      : tp < tq ? `You lead by ${tq - tp}` : tq < tp ? `${this.ctx.players[q].name} leads by ${tp - tq}` : 'All square!';
    text(gx, msg, W / 2, y0 + hgt + 20, { size: 18, color: '#ffffff', stroke: 'rgba(0,0,0,0.5)' });
    text(gx, 'Lowest total wins', W / 2, y0 + hgt + 40, { size: 13, color: COLORS.dim, weight: 600 });
  }
}

function chevron(gx: G, x: number, y: number, a: number, s: number): void {
  gx.beginPath();
  gx.moveTo(x - Math.cos(a - 0.7) * s, y - Math.sin(a - 0.7) * s);
  gx.lineTo(x, y);
  gx.lineTo(x - Math.cos(a + 0.7) * s, y - Math.sin(a + 0.7) * s);
  gx.stroke();
}

function sunkLabel(strokes: number, par: number): string {
  if (strokes === 1) return 'HOLE IN ONE!';
  const d = strokes - par;
  if (d <= -2) return 'Eagle! 🦅';
  if (d === -1) return 'Birdie! 🐦';
  if (d === 0) return 'Par! Nice.';
  return 'In the hole!';
}

function short(name: string): string {
  return name.length > 9 ? name.slice(0, 8) + '…' : name;
}

const def: GameDef = { id: 'minigolf', create: (ctx) => new MinigolfView(ctx) };
export default def;
