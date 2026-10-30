// Quick Draw view: a cartoon water-pistol duel in a desert street. Each half is
// drawn in the bottom player's frame and rotated 180° for the top player.
import { other, PLAYERS, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, line, noGlow, rrect, shade, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { PowerButton } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { QuickDraw, QuickDrawBot, RULES, type FakeKind, type Intent, type RoundResult } from './logic';

/** Local (bottom-player) layout of one half. */
const L = {
  signalY: MID + 54,
  cowboyY: MID + 162,
  btnY: H - 58,
  btnR: 47,
};

const FAKE_TEXT: Record<FakeKind, [string, string]> = {
  picture: ['DRAW...', 'a picture! 🖍️'],
  bridge: ['DRAW-', 'bridge! 🌉'],
  drawer: ['Open the', 'DRAW-er! 🗄️'],
  tumbleweed: ['', ''],
};

/** Local point in player p's frame to a screen point. */
const toScreen = (p: PlayerIndex, x: number, y: number) => (p === 0 ? { x, y } : { x: W - x, y: H - y });

const ms = (s: number | null) => (s === null ? '—' : `${Math.round(s * 1000)} ms`);

class QuickDrawView implements GameInstance {
  readonly game: QuickDraw;
  private bots: (QuickDrawBot | null)[];
  private powerBtns: (PowerButton | null)[];
  private t = 0;
  private drawFlash = 0;
  private fakeT = 0;
  private press: [number, number] = [0, 0];
  /** Water stream from the shooter's pistol, and the drip on the one who got splashed. */
  private squirt: { p: PlayerIndex; t: number } | null = null;
  private soaked: [number, number] = [0, 0];
  private fizzle: [number, number] = [0, 0];
  private ended = false;

  constructor(private readonly ctx: GameContext) {
    this.game = new QuickDraw(ctx.players, ctx.powersOn, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new QuickDrawBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      return p === 0 ? new PowerButton(40, H - 42, 0, pw, ctx.players[0].color) : new PowerButton(W - 40, 42, 1, pw, ctx.players[1].color);
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
      const tap = input.of(p).some((f) => f.pressed && !(btn && btn.button.hit(f.x, f.y))) || input.keyPressed(KEYS[p].action);
      return { tap, power };
    }) as [Intent, Intent];
    for (const p of PLAYERS) if (intents[p].tap) this.press[p] = 0.12;
    g.step(dt, intents);
    this.drawFlash = Math.max(0, this.drawFlash - dt);
    this.fakeT = g.fake ? this.fakeT + dt : 0;
    for (const p of PLAYERS) {
      this.press[p] = Math.max(0, this.press[p] - dt);
      this.soaked[p] = Math.max(0, this.soaked[p] - dt);
      this.fizzle[p] = Math.max(0, this.fizzle[p] - dt);
    }
    if (this.squirt) {
      this.squirt.t += dt;
      if (this.squirt.t > 0.45) this.squirt = null;
    }
    if (g.phase === 'ready' && g.phaseT < dt * 1.5) this.squirt = null;
    const { sfx, fx, players } = this.ctx;
    for (const e of g.events) {
      if (e.type === 'ready') sfx.play('count');
      else if (e.type === 'fake') {
        sfx.play(e.fake.kind === 'tumbleweed' ? 'whoosh' : 'pop');
      } else if (e.type === 'draw') {
        sfx.play('go');
        this.drawFlash = 0.5;
        fx.flash('#ffffff', 0.15);
      } else if (e.type === 'shot') {
        sfx.play('splash');
        if (!this.squirt) this.squirt = { p: e.p, t: 0 };
        const s = toScreen(e.p, W / 2 + 26, L.cowboyY - 30);
        fx.burst(s.x, s.y, '#7fd3ff', 10, 140, 3);
      } else if (e.type === 'forgiven') {
        sfx.play('pop');
        const s = toScreen(e.p, W / 2, L.signalY + 40);
        fx.pop('Phew! Forgiven 🎯', s.x, s.y, COLORS.gold, e.p, 18);
        this.fizzle[e.p] = 0.5;
      } else if (e.type === 'power') {
        // A fake-out stays secret: only its "(your fake-out)" tag tells the player who played it.
        if (e.id === 'fakeout') continue;
        sfx.play('power');
        const pw = players[e.p].power!;
        const s = toScreen(e.p, W / 2, L.cowboyY + 60);
        fx.flash('#ffd54a', 0.1);
        const o = toScreen(other(e.p), W / 2, L.cowboyY + 60);
        fx.pop(`${pw.icon} they used ${pw.name}`, o.x, o.y, players[e.p].color, other(e.p), 15);
        fx.pop(`${pw.icon} ${pw.name}!`, s.x, s.y, COLORS.gold, e.p, 22);
      } else if (e.type === 'round') this.onRound(e.result);
      else if (e.type === 'win' && !this.ended) {
        this.ended = true;
        sfx.play('win');
        this.ctx.end({ winner: e.p, score: [...g.score] as [number, number], summary: `${g.score[0]} – ${g.score[1]} rounds` });
      }
    }
  }

  private onRound(r: RoundResult): void {
    const { sfx, fx, players } = this.ctx;
    if (r.winner !== null) {
      const loser = other(r.winner);
      if (r.reason === 'faster') {
        this.soaked[loser] = 1.6;
        const s = toScreen(loser, W / 2, L.cowboyY - 20);
        fx.burst(s.x, s.y, '#7fd3ff', 30, 220, 4);
        fx.burst(s.x, s.y, '#ffffff', 10, 140, 3);
        fx.shake(6, 0.25);
        sfx.play('score');
      } else {
        this.fizzle[loser] = 0.8;
        sfx.play('buzz');
      }
      const w = toScreen(r.winner, W / 2, L.cowboyY);
      fx.burst(w.x, w.y, players[r.winner].color, 24, 240, 4);
    } else sfx.play('thud');
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
    this.drawStreet(gx);
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, this.game.energy[p], this.t);
  }

  /** The dusty street across the middle, where tumbleweeds roll. Shared by both. */
  private drawStreet(gx: G): void {
    const g = this.game;
    rrect(gx, 0, MID - 18, W, 36, 0, '#d9a866');
    for (let i = 0; i < 9; i++) line(gx, 10 + i * 42, MID - 4 + (i % 2) * 8, 30 + i * 42, MID - 4 + (i % 2) * 8, 'rgba(120,70,30,0.25)', 3);
    if (g.fake?.kind === 'tumbleweed') {
      const k = Math.min(1, this.fakeT / RULES.fakeLen);
      const x = -30 + k * (W + 60);
      const y = MID - 2 - Math.abs(Math.sin(k * Math.PI * 4)) * 10;
      gx.save();
      gx.translate(x, y);
      gx.rotate(k * 12);
      circle(gx, 0, 0, 16, '#b07a3c', '#7a4a1e', 3);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        line(gx, Math.cos(a) * 4, Math.sin(a) * 4, Math.cos(a + 1.4) * 15, Math.sin(a + 1.4) * 15, '#7a4a1e', 2);
      }
      gx.restore();
    }
    if (this.squirt) {
      // The water stream crosses the street toward the other cowboy.
      const s = this.squirt;
      const from = toScreen(s.p, W / 2 + 26, L.cowboyY - 34);
      const to = toScreen(other(s.p), W / 2 - 4, L.cowboyY - 30);
      const k = Math.min(1, s.t / 0.18);
      const a = Math.max(0, 1 - Math.max(0, s.t - 0.25) / 0.2);
      gx.globalAlpha = a;
      line(gx, from.x, from.y, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, '#7fd3ff', 7);
      line(gx, from.x, from.y, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, '#e8f8ff', 2.5);
      gx.globalAlpha = 1;
    }
  }

  private drawHalf(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const c = this.ctx.players[p].color;
    // Sand, sky-ish glow near the player's edge
    const sand = gx.createLinearGradient(0, MID, 0, H);
    sand.addColorStop(0, '#f2cf8f');
    sand.addColorStop(1, '#e7b56a');
    gx.fillStyle = sand;
    gx.fillRect(0, MID, W, MID);
    gx.fillStyle = alpha(c, 0.12);
    gx.fillRect(0, MID, W, MID);
    // Cacti and pebbles
    cactus(gx, 34, MID + 120, 0.9);
    cactus(gx, W - 30, MID + 280, 0.7);
    for (const [x, y] of [[80, MID + 260], [300, MID + 80], [250, MID + 280]]) circle(gx, x, y, 3, 'rgba(120,80,40,0.3)');
    // Slow Time "get ready" pulse
    if (g.pulse(p)) {
      const k = 0.5 + 0.5 * Math.sin(this.t * 22);
      gx.fillStyle = alpha(COLORS.gold, 0.12 + 0.12 * k);
      gx.fillRect(0, MID, W, MID);
      text(gx, '⏳ get ready…', W / 2, L.signalY + 44, { size: 18, color: '#7a4a00' });
    }
    this.drawSignal(gx, p);
    this.drawCowboy(gx, p, c);
    this.drawButton(gx, p, c);
    // Round wins as stars beside the cowboy
    for (let i = 0; i < RULES.winRounds; i++) {
      const x = W / 2 + 116;
      const y = L.cowboyY - 34 + i * 26;
      star(gx, x, y, 10, i < g.score[p] ? COLORS.gold : 'rgba(80,50,20,0.25)');
    }
    text(gx, `${g.score[p]} – ${g.score[other(p)]}`, W / 2 + 116, L.cowboyY + 52, { size: 13, color: 'rgba(80,50,20,0.8)' });
    // Power badges
    const badges: string[] = [];
    if (g.shots[p] > 0) badges.push(`🎯 x${g.shots[p]}`);
    if (g.focus[p]) badges.push('⏳ armed');
    if (badges.length) text(gx, badges.join('  '), W / 2 - 110, L.cowboyY + 52, { size: 13, color: '#7a4a00' });
  }

  private drawSignal(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const y = L.signalY;
    if (g.phase === 'ready') {
      text(gx, `Round ${g.round}`, W / 2, y - 14, { size: 20, color: 'rgba(80,50,20,0.85)' });
      text(gx, 'Steady…', W / 2, y + 14, { size: 26, color: '#5b3412' });
    } else if (g.phase === 'wait') {
      const f = g.fake;
      if (f && f.kind !== 'tumbleweed') {
        const [a, b] = FAKE_TEXT[f.kind];
        const pop = Math.min(1, this.fakeT / 0.08);
        rrect(gx, 24, y - 34, W - 48, 68, 16, 'rgba(255,248,230,0.95)', '#c0392b', 3);
        text(gx, a, W / 2, y - 12, { size: 26 * pop, color: '#c0392b', weight: 900 });
        text(gx, b, W / 2, y + 16, { size: 20 * pop, color: '#5b3412' });
        if (f.by === p) text(gx, '(your fake-out 🎭)', W / 2, y + 48, { size: 13, color: '#7a4a00' });
      } else text(gx, 'Wait for it…', W / 2, y, { size: 20, color: 'rgba(80,50,20,0.55)' });
    } else if (g.phase === 'draw') {
      const k = Math.min(1, g.phaseT / 0.06);
      glow(gx, '#ff3b2f', 22);
      rrect(gx, 30, y - 36, W - 60, 72, 18, '#c0392b', '#fff3d6', 4);
      noGlow(gx);
      text(gx, 'DRAW!', W / 2, y + 2, { size: 52 * (0.6 + 0.4 * k), color: '#fff3d6', weight: 900, stroke: '#7a1a10' });
    } else if (g.phase === 'result' && g.last && g.phaseT < 0.45 && g.last.reason === 'faster') {
      text(gx, 'DRAW!', W / 2, y, { size: 40, color: 'rgba(192,57,43,0.5)', weight: 900 });
    } else if (g.phase === 'result' && g.last) {
      const r = g.last;
      const won = r.winner === p;
      let title: string;
      let color = won ? '#1f7a3a' : '#a02a1f';
      if (r.winner === null) {
        color = '#5b3412';
        title = r.reason === 'bothEarly' ? 'Both too early!' : r.reason === 'tooSlow' ? 'Nobody drew!' : 'Exact tie!';
      } else if (r.reason === 'faster') title = won ? 'You win the round!' : 'Splashed!';
      else if (r.early === p) title = r.reason === 'fooled' ? 'Fooled you! 🙈' : 'Too early!';
      else title = r.reason === 'fooled' ? 'They got fooled!' : 'They were too early!';
      rrect(gx, 24, y - 36, W - 48, 80, 16, 'rgba(255,248,230,0.95)', alpha(this.ctx.players[p].color, 0.9), 3);
      text(gx, title, W / 2, y - 14, { size: 22, color });
      const mine = r.times[p];
      const theirs = r.times[other(p)];
      text(gx, `You ${ms(mine)}`, W / 2 - 74, y + 16, { size: 17, color: shade(this.ctx.players[p].color, -0.3) });
      text(gx, `Them ${ms(theirs)}`, W / 2 + 74, y + 16, { size: 17, color: shade(this.ctx.players[other(p)].color, -0.3) });
      const pen = r.penalty[p];
      if (pen > 0.001 && mine !== null) text(gx, `(+${Math.round(pen * 1000)} ms handicap)`, W / 2 - 74, y + 33, { size: 11, color: 'rgba(80,50,20,0.7)' });
      const penO = r.penalty[other(p)];
      if (penO > 0.001 && theirs !== null) text(gx, `(+${Math.round(penO * 1000)} ms handicap)`, W / 2 + 74, y + 33, { size: 11, color: 'rgba(80,50,20,0.7)' });
    }
  }

  private drawCowboy(gx: G, p: PlayerIndex, c: string): void {
    const g = this.game;
    const x = W / 2;
    const y = L.cowboyY;
    const drawn = g.phase === 'draw' || (g.phase === 'result' && g.last?.times[p] !== null);
    const soaked = this.soaked[p] > 0;
    const wob = soaked ? Math.sin(this.t * 30) * 2 : 0;
    gx.save();
    gx.translate(wob, 0);
    // Shadow
    gx.beginPath();
    gx.ellipse(x, y + 46, 34, 9, 0, 0, Math.PI * 2);
    gx.fillStyle = 'rgba(90,50,20,0.25)';
    gx.fill();
    // Legs and boots
    rrect(gx, x - 15, y + 14, 12, 30, 4, '#3d5a8a');
    rrect(gx, x + 3, y + 14, 12, 30, 4, '#3d5a8a');
    rrect(gx, x - 18, y + 38, 17, 9, 4, '#6b3a1a');
    rrect(gx, x + 1, y + 38, 17, 9, 4, '#6b3a1a');
    // Body (shirt in player colour) and belt
    rrect(gx, x - 20, y - 22, 40, 40, 10, c, shade(c, -0.35), 2);
    rrect(gx, x - 20, y + 8, 40, 6, 2, '#6b3a1a');
    circle(gx, x, y + 11, 3, COLORS.gold);
    // Bandana
    gx.beginPath();
    gx.moveTo(x - 12, y - 22);
    gx.lineTo(x + 12, y - 22);
    gx.lineTo(x, y - 10);
    gx.closePath();
    gx.fillStyle = '#e74c3c';
    gx.fill();
    // Arms: the pistol arm points up toward the other player when drawn
    const armUp = drawn ? -1 : 0;
    line(gx, x - 20, y - 14, x - 28, y + 6, shade(c, -0.15), 9);
    line(gx, x + 20, y - 14, x + 26, y + (armUp ? -30 : 6), shade(c, -0.15), 9);
    // Water pistol (bright toy colours)
    const px = x + 26;
    const py = drawn ? y - 34 : y + 8;
    rrect(gx, px - 6, py - (drawn ? 14 : 4), 12, drawn ? 18 : 14, 4, '#ff9f1a', '#b35f00', 2);
    rrect(gx, px - 3, py - (drawn ? 22 : 0), 6, 8, 2, '#3fbf6a');
    if (this.fizzle[p] > 0) text(gx, '💨', px + 14, py - 12, { size: 16 });
    // Head and hat
    circle(gx, x, y - 34, 15, '#f5c99b', '#c08a5a', 2);
    circle(gx, x - 5, y - 36, 2, '#3b2412');
    circle(gx, x + 5, y - 36, 2, '#3b2412');
    gx.beginPath();
    gx.arc(x, y - 30, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    gx.strokeStyle = '#3b2412';
    gx.lineWidth = 2;
    gx.stroke();
    gx.beginPath();
    gx.ellipse(x, y - 46, 28, 7, 0, 0, Math.PI * 2);
    gx.fillStyle = '#8d5524';
    gx.fill();
    rrect(gx, x - 14, y - 64, 28, 20, 8, '#8d5524');
    rrect(gx, x - 14, y - 50, 28, 4, 1, shade(c, -0.2));
    if (soaked) {
      for (let i = 0; i < 6; i++) {
        const dy = ((this.t * 60 + i * 13) % 50) - 10;
        circle(gx, x - 22 + i * 9, y - 40 + dy, 2.5, '#7fd3ff');
      }
      text(gx, 'SPLASH!', x - 82, y - 10, { size: 18, color: '#1e88e5', stroke: '#ffffff' });
    }
    gx.restore();
  }

  private drawButton(gx: G, p: PlayerIndex, c: string): void {
    const g = this.game;
    const x = W / 2;
    const y = L.btnY;
    const r = L.btnR * (this.press[p] > 0 ? 0.93 : 1);
    const live = g.phase === 'draw';
    if (g.pulse(p)) {
      glow(gx, COLORS.gold, 26);
      circle(gx, x, y, r + 10 + 4 * Math.sin(this.t * 22), undefined, COLORS.gold, 5);
      noGlow(gx);
    }
    circle(gx, x, y + 6, r, 'rgba(90,50,20,0.35)');
    if (live) glow(gx, '#ffffff', 22);
    circle(gx, x, y, r, live ? shade(c, 0.15) : c, '#ffffff', 4);
    noGlow(gx);
    circle(gx, x, y - r * 0.25, r * 0.7, 'rgba(255,255,255,0.15)');
    text(gx, 'SQUIRT!', x, y, { size: 22, color: '#ffffff', stroke: shade(c, -0.45), weight: 900 });
  }
}

function cactus(gx: G, x: number, y: number, s: number): void {
  const green = '#3f9b4f';
  const dark = '#2b6e37';
  rrect(gx, x - 9 * s, y - 50 * s, 18 * s, 56 * s, 9 * s, green, dark, 2);
  rrect(gx, x - 26 * s, y - 34 * s, 10 * s, 22 * s, 5 * s, green, dark, 2);
  rrect(gx, x - 26 * s, y - 16 * s, 20 * s, 9 * s, 4 * s, green, dark, 2);
  rrect(gx, x + 16 * s, y - 42 * s, 10 * s, 20 * s, 5 * s, green, dark, 2);
  rrect(gx, x + 6 * s, y - 26 * s, 20 * s, 9 * s, 4 * s, green, dark, 2);
  circle(gx, x, y - 52 * s, 4 * s, '#ff7eb3');
}

function star(gx: G, x: number, y: number, r: number, fill: string): void {
  gx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    gx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  gx.closePath();
  gx.fillStyle = fill;
  gx.fill();
  gx.strokeStyle = 'rgba(90,50,20,0.4)';
  gx.lineWidth = 1.5;
  gx.stroke();
}

const def: GameDef = { id: 'quickdraw', create: (ctx) => new QuickDrawView(ctx) };
export default def;
