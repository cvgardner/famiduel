// Chop Chop view: each player has a tree in their own half. Each half is drawn
// in the bottom player's frame and rotated 180° for the top player.
import { other, PLAYERS, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, line, noGlow, rrect, shade, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { PowerButton } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { ChopBot, ChopChop, RULES, type Intent, type Side } from './logic';

/** Local (bottom-player) layout. */
const L = {
  trunkW: 52,
  segH: 40,
  /** Centre of the trunk segment at the chopper's level. */
  baseY: H - 124,
  chopperDX: 62,
  branchLen: 74,
  barY: MID + 22,
  powerY: H - 40,
};

const toScreen = (p: PlayerIndex, x: number, y: number) => (p === 0 ? { x, y } : { x: W - x, y: H - y });

type Chunk = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; t: number; branch: number };

class ChopView implements GameInstance {
  readonly game: ChopChop;
  private bots: (ChopBot | null)[];
  private powerBtns: (PowerButton | null)[];
  private t = 0;
  private swing: [number, number] = [0, 0];
  /** Smooth drop of the trunk after a chop (0 = settled). */
  private drop: [number, number] = [0, 0];
  private chunks: [Chunk[], Chunk[]] = [[], []];
  private ended = false;

  constructor(private readonly ctx: GameContext) {
    this.game = new ChopChop(ctx.players, ctx.powersOn, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new ChopBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      return new PowerButton(W / 2, p === 0 ? L.powerY : H - L.powerY, p, pw, ctx.players[p].color);
    });
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    const intents = PLAYERS.map((p): Intent => {
      const bot = this.bots[p];
      if (bot) return bot.think(g, dt);
      const btn = this.powerBtns[p];
      const power = btn ? btn.update(input, g.energy[p], KEYS[p].power) : false;
      let chop: -1 | 0 | 1 = 0;
      for (const f of input.of(p)) {
        if (!f.pressed || (btn && btn.button.hit(f.x, f.y))) continue;
        // Sides are from the player's seat: player 1's left is the screen's right.
        const screenLeft = f.x < W / 2;
        chop = (p === 0 ? screenLeft : !screenLeft) ? -1 : 1;
      }
      if (input.keyPressed(KEYS[p].left)) chop = p === 0 ? -1 : 1;
      if (input.keyPressed(KEYS[p].right)) chop = p === 0 ? 1 : -1;
      return { chop, power };
    }) as [Intent, Intent];
    g.step(dt, intents);
    for (const p of PLAYERS) {
      this.swing[p] = Math.max(0, this.swing[p] - dt);
      this.drop[p] = Math.max(0, this.drop[p] - dt * 9);
      for (const ch of this.chunks[p]) {
        ch.t += dt;
        ch.x += ch.vx * dt;
        ch.y += ch.vy * dt;
        ch.vy += 900 * dt;
        ch.rot += ch.vr * dt;
      }
      this.chunks[p] = this.chunks[p].filter((ch) => ch.t < 0.8);
    }
    if (g.phase === 'intro') this.chunks = [[], []];
    const { sfx, fx, players } = this.ctx;
    for (const e of g.events) {
      if (e.type === 'chop') {
        sfx.play('chop');
        this.swing[e.p] = 0.12;
        this.drop[e.p] = 1;
        const cx = W / 2;
        const chopped = g.branch(e.p, g.choppers[e.p].idx - 1);
        this.chunks[e.p].push({ x: cx, y: L.baseY, vx: -e.side * 380, vy: -260, rot: 0, vr: -e.side * 10, t: 0, branch: chopped });
        const s = toScreen(e.p, cx - e.side * (L.trunkW / 2), L.baseY);
        fx.burst(s.x, s.y, '#e0b07a', 6, 160, 3);
        if (e.count > 1) fx.pop('+2', s.x, s.y - (e.p === 0 ? 30 : -30), COLORS.gold, e.p, 18);
        const c = g.choppers[e.p];
        if (c.chops > 0 && c.chops % 10 < e.count) {
          const m = toScreen(e.p, W / 2, L.barY + 40);
          fx.pop(`${c.chops}!`, m.x, m.y, COLORS.gold, e.p, 26);
          sfx.play('coin');
        }
      } else if (e.type === 'bonk') {
        sfx.play('thud');
        fx.shake(9, 0.35);
        const s = toScreen(e.p, W / 2 + e.side * L.chopperDX, L.baseY - 30);
        fx.burst(s.x, s.y, '#ffe066', 22, 220, 4);
        fx.pop('BONK!', s.x, s.y, '#ffffff', e.p, 30);
      } else if (e.type === 'timeUp') {
        sfx.play('buzz');
        const s = toScreen(e.p, W / 2, L.barY + 40);
        fx.pop("Time's up!", s.x, s.y, COLORS.bad, e.p, 26);
      } else if (e.type === 'shieldBreak') {
        sfx.play('bounce');
        const s = toScreen(e.p, W / 2 + e.side * (L.trunkW / 2 + L.branchLen / 2), L.baseY - 20);
        fx.burst(s.x, s.y, '#8fd3ff', 20, 220, 4);
        fx.burst(s.x, s.y, '#4caf50', 12, 200, 4);
        fx.pop('Shield!', s.x, s.y, '#8fd3ff', e.p, 22);
      } else if (e.type === 'frozenTap') {
        sfx.play('click');
      } else if (e.type === 'power') {
        sfx.play('power');
        const pw = players[e.p].power!;
        fx.flash('#ffd54a', 0.12);
        const s = toScreen(e.p, W / 2, L.barY + 70);
        fx.pop(`${pw.icon} ${pw.name}!`, s.x, s.y, COLORS.gold, e.p, 24);
        if (e.id === 'freeze') {
          const o = toScreen(other(e.p), W / 2, L.baseY - 60);
          fx.burst(o.x, o.y, '#bfe9ff', 30, 240, 4);
          fx.pop('🧊 Frozen!', o.x, o.y, '#bfe9ff', other(e.p), 24);
        }
      } else if (e.type === 'roundStart') {
        sfx.play('go');
      } else if (e.type === 'roundEnd') {
        if (e.winner !== null) {
          sfx.play('score');
          const s = toScreen(e.winner, W / 2, L.baseY - 60);
          fx.burst(s.x, s.y, players[e.winner].color, 36, 300, 5);
        }
      } else if (e.type === 'win' && !this.ended) {
        this.ended = true;
        sfx.play('win');
        this.ctx.end({ winner: e.p, score: [...g.score] as [number, number], summary: `${g.score[0]} – ${g.score[1]} rounds` });
      }
    }
  }

  render(gx: G): void {
    for (const p of PLAYERS) {
      gx.save();
      gx.beginPath();
      gx.rect(0, p === 0 ? MID : 0, W, MID);
      gx.clip();
      facing(gx, p, W / 2, MID, () => this.drawHalf(gx, p));
      gx.restore();
    }
    // A wooden plank across the middle
    rrect(gx, 0, MID - 5, W, 10, 0, '#6d4c41');
    line(gx, 0, MID, W, MID, 'rgba(0,0,0,0.25)', 1);
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, this.game.energy[p], this.t);
  }

  private drawHalf(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const c = g.choppers[p];
    const col = this.ctx.players[p].color;
    // Sky near the middle, grass near the player
    const sky = gx.createLinearGradient(0, MID, 0, H);
    sky.addColorStop(0, '#9fd8ff');
    sky.addColorStop(0.62, '#d9f1ff');
    sky.addColorStop(0.63, '#7cc96b');
    sky.addColorStop(1, '#4f9e45');
    gx.fillStyle = sky;
    gx.fillRect(0, MID, W, MID);
    gx.fillStyle = alpha(col, 0.1);
    gx.fillRect(0, MID, W, MID);
    // Distant hills and clouds
    gx.fillStyle = '#a9dca0';
    for (const [hx, rx, ry] of [[70, 120, 50], [300, 140, 40]]) {
      gx.beginPath();
      gx.ellipse(hx, L.baseY + 22, rx, ry, 0, Math.PI, 0);
      gx.fill();
    }
    const drift = (this.t * 8) % (W + 120);
    for (const [x0, y] of [[40, MID + 70], [230, MID + 120]]) {
      const x = ((x0 + drift) % (W + 120)) - 60;
      circle(gx, x, y, 14, 'rgba(255,255,255,0.85)');
      circle(gx, x + 16, y - 6, 16, 'rgba(255,255,255,0.85)');
      circle(gx, x + 32, y, 12, 'rgba(255,255,255,0.85)');
    }
    this.drawTree(gx, p);
    this.drawChopper(gx, p, col);
    // Flying chunks
    for (const ch of this.chunks[p]) {
      gx.save();
      gx.translate(ch.x, ch.y);
      gx.rotate(ch.rot);
      gx.globalAlpha = Math.max(0, 1 - ch.t / 0.8);
      rrect(gx, -L.trunkW / 2, -L.segH / 2, L.trunkW, L.segH, 4, '#a0703f', '#6b4423', 2);
      gx.restore();
    }
    gx.globalAlpha = 1;
    // Timer bar + chop count
    const bw = 210;
    const bx = W / 2 - bw / 2;
    const low = c.timer < 0.3 && !c.out && g.phase === 'play';
    rrect(gx, bx - 3, L.barY - 11, bw + 6, 22, 11, 'rgba(20,20,40,0.55)');
    const fill = Math.max(0, c.timer) * bw;
    if (fill > 0) rrect(gx, bx, L.barY - 8, Math.max(16, fill), 16, 8, low ? (Math.sin(this.t * 20) > 0 ? COLORS.bad : '#ff9f43') : col);
    text(gx, '⏱', bx - 18, L.barY, { size: 16 });
    text(gx, `${c.chops}`, W / 2, L.barY + 30, { size: 28, color: '#ffffff', stroke: 'rgba(0,0,0,0.45)' });
    // A dark pill keeps the small goal label readable over sky, trunk or a flying chunk.
    rrect(gx, W / 2 + 24, L.barY + 23, 32, 20, 10, 'rgba(20,20,40,0.75)');
    text(gx, `/ ${RULES.goal}`, W / 2 + 40, L.barY + 33, { size: 13, color: '#ffffff' });
    // Round wins
    for (let i = 0; i < RULES.winRounds; i++) circle(gx, bx + bw + 22, L.barY + 4 + i * 20 - 0, 7, i < g.score[p] ? COLORS.gold : 'rgba(255,255,255,0.35)', 'rgba(0,0,0,0.3)', 1.5);
    // Rival progress, small
    const o = g.choppers[other(p)];
    text(gx, `them: ${o.chops}`, bx - 4, L.barY + 30, { size: 13, color: 'rgba(30,40,60,0.75)', align: 'left' });
    // Power status
    if (c.double > 0) text(gx, '✌️ x2', W / 2 + 96, L.barY + 54, { size: 16, color: COLORS.gold, stroke: 'rgba(0,0,0,0.4)' });
    // Tap hints near the player's edge
    const hintA = g.phase === 'intro' ? 1 : 0.45;
    text(gx, '◀ chop', 58, H - 34, { size: 16, color: '#ffffff', alpha: hintA, stroke: 'rgba(0,0,0,0.35)' });
    text(gx, 'chop ▶', W - 58, H - 34, { size: 16, color: '#ffffff', alpha: hintA, stroke: 'rgba(0,0,0,0.35)' });
    this.drawBanner(gx, p);
  }

  private drawTree(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const c = g.choppers[p];
    const x = W / 2;
    const tw = L.trunkW;
    // Stump and roots
    rrect(gx, x - tw / 2 - 8, L.baseY + L.segH / 2 - 4, tw + 16, 18, 6, '#7a5230', '#5a3a1e', 2);
    const off = this.drop[p] * L.segH;
    const n = Math.ceil((L.baseY - MID) / L.segH) + 2;
    for (let k = n; k >= 0; k--) {
      const i = c.idx + k;
      const y = L.baseY - k * L.segH - off;
      rrect(gx, x - tw / 2, y - L.segH / 2, tw, L.segH + 1, 3, k % 2 ? '#9a6a3a' : '#a8743f', '#6b4423', 2);
      line(gx, x - tw / 2 + 10, y - 8, x - tw / 2 + 10, y + 8, 'rgba(80,40,10,0.35)', 2);
      line(gx, x + tw / 2 - 14, y - 4, x + tw / 2 - 14, y + 12, 'rgba(80,40,10,0.35)', 2);
      const b = g.branch(p, i);
      if (b !== 0) this.drawBranch(gx, x + b * (tw / 2), y, b);
    }
    if (c.frozen > 0) {
      gx.globalAlpha = 0.55 + 0.2 * Math.sin(this.t * 10);
      rrect(gx, x - tw / 2 - 6, MID + 4, tw + 12, L.baseY - MID + 20, 8, '#bfe9ff', '#ffffff', 2);
      gx.globalAlpha = 1;
      text(gx, '🧊 frozen', x, L.baseY - 2 * L.segH, { size: 18, color: '#0d4d7a', stroke: '#ffffff' });
    }
  }

  private drawBranch(gx: G, x: number, y: number, side: Side): void {
    const len = L.branchLen;
    rrect(gx, side < 0 ? x - len : x, y - 7, len, 14, 6, '#8a5a2b', '#5a3a1e', 2);
    const lx = x + side * (len - 6);
    circle(gx, lx, y - 8, 15, '#4caf50', '#2e7d32', 2);
    circle(gx, lx - side * 16, y - 12, 11, '#5cc160', '#2e7d32', 2);
    circle(gx, lx + side * 6, y + 6, 10, '#43a047', '#2e7d32', 2);
  }

  private drawChopper(gx: G, p: PlayerIndex, col: string): void {
    const g = this.game;
    const c = g.choppers[p];
    const side = c.side;
    const x = W / 2 + side * L.chopperDX;
    const y = L.baseY + 2;
    const bonked = c.out && c.outReason === 'bonk';
    gx.save();
    if (bonked) {
      // Sitting down, dizzy
      gx.translate(x, y + 18);
      gx.rotate(side * 0.35);
      gx.translate(-x, -(y + 18));
    }
    // Shadow
    gx.beginPath();
    gx.ellipse(x, y + 40, 22, 6, 0, 0, Math.PI * 2);
    gx.fillStyle = 'rgba(0,0,0,0.2)';
    gx.fill();
    // Legs, body with plaid in the player's colour
    rrect(gx, x - 11, y + 14, 9, 24, 3, '#34495e');
    rrect(gx, x + 2, y + 14, 9, 24, 3, '#34495e');
    rrect(gx, x - 16, y - 16, 32, 34, 8, col, shade(col, -0.4), 2);
    line(gx, x - 16, y - 2, x + 16, y - 2, shade(col, -0.3), 3);
    line(gx, x, y - 16, x, y + 18, shade(col, -0.3), 3);
    // Head + beanie + beard
    circle(gx, x, y - 28, 13, '#f5c99b', '#c08a5a', 2);
    gx.beginPath();
    gx.arc(x, y - 30, 13, Math.PI, 0);
    gx.fillStyle = shade(col, -0.2);
    gx.fill();
    circle(gx, x, y - 44, 4, '#ffffff');
    gx.beginPath();
    gx.arc(x, y - 24, 10, 0.1 * Math.PI, 0.9 * Math.PI);
    gx.fillStyle = '#8d5524';
    gx.fill();
    if (bonked) {
      text(gx, 'x', x - 5, y - 30, { size: 10, color: '#3b2412' });
      text(gx, 'x', x + 5, y - 30, { size: 10, color: '#3b2412' });
    } else {
      circle(gx, x - side * 2, y - 30, 2, '#3b2412');
      circle(gx, x - side * 8, y - 30, 2, '#3b2412');
    }
    // Axe: raised over the shoulder, swung flat into the trunk on a chop.
    const toward = -side; // the trunk is on this side of the chopper
    const theta = this.swing[p] > 0 ? 1.45 : -0.45;
    const hx = x + toward * 10;
    const hy = y - 2;
    const dx = toward * Math.sin(theta);
    const dy = -Math.cos(theta);
    const ax = hx + dx * 34;
    const ay = hy + dy * 34;
    line(gx, hx, hy, ax, ay, '#7a4a1e', 5);
    gx.save();
    gx.translate(ax, ay);
    gx.rotate(Math.atan2(dy, dx));
    rrect(gx, -6, -2, 12, 16 * 1, 3, '#cfd8dc', '#607d8b', 2);
    gx.restore();
    gx.restore();
    if (bonked) {
      for (let i = 0; i < 3; i++) {
        const a = this.t * 5 + (i * Math.PI * 2) / 3;
        text(gx, '★', x + Math.cos(a) * 18, y - 48 + Math.sin(a) * 6, { size: 14, color: COLORS.gold, stroke: 'rgba(0,0,0,0.3)' });
      }
    }
    if (c.shield) {
      glow(gx, '#8fd3ff', 14);
      circle(gx, x, y - 6, 40, alpha('#8fd3ff', 0.15), alpha('#8fd3ff', 0.85), 3);
      noGlow(gx);
    }
  }

  private drawBanner(gx: G, p: PlayerIndex): void {
    const g = this.game;
    let msg: string | null = null;
    let col = '#ffffff';
    if (g.phase === 'intro') msg = `Round ${g.round}`;
    else if (g.phase === 'over' && !g.done) {
      const w = g.lastRound;
      if (w === null || w === undefined) msg = 'Tie round!';
      else if (w === p) {
        msg = 'You win the round!';
        col = this.ctx.players[p].color;
      } else msg = g.choppers[p].outReason === 'bonk' ? 'Bonked!' : g.choppers[p].outReason === 'time' ? 'Out of time!' : 'They got to 50!';
    }
    if (!msg) return;
    const y = MID + 118;
    rrect(gx, W / 2 - 130, y - 24, 260, 48, 16, 'rgba(10,8,25,0.72)', alpha(this.ctx.players[p].color, 0.9), 2);
    text(gx, msg, W / 2, y, { size: 22, color: col });
  }
}

const def: GameDef = { id: 'chopchop', create: (ctx) => new ChopView(ctx) };
export default def;
