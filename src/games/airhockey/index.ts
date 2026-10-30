// Air Hockey view: fingers and bots become intents, state becomes pixels.
import { PLAYERS, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, glow, line, noGlow, rrect, shade, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { PowerButton } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { AirHockey, AirHockeyBot, RULES, type Intent } from './logic';

class AirHockeyView implements GameInstance {
  readonly game: AirHockey;
  private bots: (AirHockeyBot | null)[];
  private powerBtns: (PowerButton | null)[];
  private targets: { x: number; y: number }[];
  private trail: { x: number; y: number }[] = [];
  private t = 0;
  private goalFlash = 0;
  private lastScorer: PlayerIndex = 0;

  constructor(private readonly ctx: GameContext) {
    this.game = new AirHockey(ctx.players, ctx.powersOn, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new AirHockeyBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      return p === 0 ? new PowerButton(40, H - 42, 0, pw, ctx.players[0].color) : new PowerButton(W - 40, 42, 1, pw, ctx.players[1].color);
    });
    this.targets = this.game.paddles.map((pd) => ({ x: pd.x, y: pd.y }));
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    const intents = PLAYERS.map((p): Intent => {
      const bot = this.bots[p];
      if (bot) return bot.think(g, dt);
      const btn = this.powerBtns[p];
      const fire = btn ? btn.update(input, g.energy[p], KEYS[p].power) : false;
      // Drag anywhere on your half (except the power button) to move the paddle.
      const finger = input.of(p).find((f) => f.down && !(btn && btn.button.hit(f.startX, f.startY)));
      const tgt = this.targets[p];
      if (finger) {
        // Offset so the paddle sits just above the finger and stays visible.
        tgt.x = finger.x;
        tgt.y = finger.y + (p === 0 ? -24 : 24);
      }
      const k = KEYS[p];
      const sp = 420 * dt;
      if (input.key(k.left)) tgt.x -= sp;
      if (input.key(k.right)) tgt.x += sp;
      if (input.key(k.up)) tgt.y -= sp;
      if (input.key(k.down)) tgt.y += sp;
      return { tx: tgt.x, ty: tgt.y, power: fire };
    }) as [Intent, Intent];
    g.step(dt, intents);
    this.goalFlash = Math.max(0, this.goalFlash - dt);
    for (const e of g.events) {
      const { sfx, fx } = this.ctx;
      if (e.type === 'hit') {
        sfx.play('hit');
        fx.burst(e.x, e.y, this.ctx.players[e.p].color, Math.round(4 + e.speed / 80), 120 + e.speed * 0.2, 3);
        if (e.speed > 800) fx.shake(4, 0.12);
      } else if (e.type === 'wall') {
        sfx.play('bounce');
      } else if (e.type === 'goal') {
        sfx.play('score');
        this.lastScorer = e.scorer;
        this.goalFlash = 1;
        fx.shake(10, 0.35);
        fx.flash(this.ctx.players[e.scorer].color);
        fx.burst(e.x, e.scorer === 0 ? 10 : H - 10, this.ctx.players[e.scorer].color, 40, 360, 5);
        fx.pop('GOAL!', W / 2, MID + 80, COLORS.gold, 0, 40);
        fx.pop('GOAL!', W / 2, MID - 80, COLORS.gold, 1, 40);
      } else if (e.type === 'power') {
        sfx.play('power');
        const pw = this.ctx.players[e.p].power!;
        fx.flash('#ffd54a', 0.12);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, e.p === 0 ? MID + 50 : MID - 50, COLORS.gold, e.p, 26);
      } else if (e.type === 'win') {
        this.ctx.end({ winner: e.p, score: [...g.score] as [number, number], summary: `${g.score[0]} – ${g.score[1]}` });
      }
    }
    const pk = g.pucks[0];
    if (pk) {
      this.trail.push({ x: pk.x, y: pk.y });
      if (this.trail.length > 10) this.trail.shift();
    } else this.trail = [];
  }

  render(gx: G): void {
    const g = this.game;
    const [c0, c1] = [this.ctx.players[0].color, this.ctx.players[1].color];
    // Rink
    gx.fillStyle = '#e9f3ff';
    gx.fillRect(0, 0, W, H);
    const ice = gx.createLinearGradient(0, 0, 0, H);
    ice.addColorStop(0, alpha(c1, 0.12));
    ice.addColorStop(0.5, 'rgba(255,255,255,0)');
    ice.addColorStop(1, alpha(c0, 0.12));
    gx.fillStyle = ice;
    gx.fillRect(0, 0, W, H);
    line(gx, RULES.wall, MID, W - RULES.wall, MID, 'rgba(60,80,140,0.35)', 3);
    circle(gx, W / 2, MID, 54, undefined, 'rgba(60,80,140,0.35)', 3);
    circle(gx, W / 2, MID, 6, 'rgba(60,80,140,0.35)');
    // Goal creases
    for (const edge of ['top', 'bottom'] as const) {
      const gw = g.goalAt(edge);
      const y = edge === 'top' ? 0 : H;
      const defender = edge === 'top' ? c1 : c0;
      gx.beginPath();
      gx.arc(W / 2, y, gw * 0.62, edge === 'top' ? 0 : Math.PI, edge === 'top' ? Math.PI : Math.PI * 2);
      gx.strokeStyle = alpha(defender, 0.5);
      gx.lineWidth = 3;
      gx.stroke();
    }
    // Walls with goal gaps
    const wall = RULES.wall;
    gx.fillStyle = '#2b2459';
    gx.fillRect(0, 0, wall, H);
    gx.fillRect(W - wall, 0, wall, H);
    for (const edge of ['top', 'bottom'] as const) {
      const gw = g.goalAt(edge);
      const y = edge === 'top' ? 0 : H - wall;
      gx.fillRect(0, y, W / 2 - gw / 2, wall);
      gx.fillRect(W / 2 + gw / 2, y, W / 2 - gw / 2, wall);
      gx.fillStyle = edge === 'top' ? c1 : c0;
      gx.fillRect(W / 2 - gw / 2, edge === 'top' ? 0 : H - 5, gw, 5);
      gx.fillStyle = '#2b2459';
    }
    // Scores, read by each player on their side of the midline
    text(gx, String(g.score[0]), W - 60, MID + 28, { size: 34, color: alpha(c0, 0.85), player: 0 });
    text(gx, String(g.score[1]), 60, MID - 28, { size: 34, color: alpha(c1, 0.85), player: 1 });
    // Puck trail + pucks
    this.trail.forEach((p, i) => circle(gx, p.x, p.y, RULES.puckR * (i / this.trail.length) * 0.9, `rgba(30,30,60,${0.04 * i})`));
    for (const pk of g.pucks) {
      circle(gx, pk.x, pk.y + 3, RULES.puckR, 'rgba(0,0,0,0.25)');
      circle(gx, pk.x, pk.y, RULES.puckR, '#1d1840', '#3a3170', 3);
      circle(gx, pk.x - 4, pk.y - 4, 3, 'rgba(255,255,255,0.35)');
    }
    if (g.serve > 0 && g.pucks[0]) {
      const pk = g.pucks[0];
      circle(gx, pk.x, pk.y, RULES.puckR + 6 + 6 * Math.sin(this.t * 10), undefined, 'rgba(29,24,64,0.4)', 2);
    }
    // Paddles
    for (const p of [0, 1] as PlayerIndex[]) {
      const pd = g.paddles[p];
      const r = g.paddleRadius(p);
      const c = this.ctx.players[p].color;
      circle(gx, pd.x, pd.y + 5, r, 'rgba(0,0,0,0.25)');
      if (pd.giant > 0) glow(gx, COLORS.gold, 18);
      circle(gx, pd.x, pd.y, r, c, shade(c, -0.35), 4);
      noGlow(gx);
      circle(gx, pd.x, pd.y, r * 0.55, shade(c, 0.25), shade(c, -0.25), 3);
      circle(gx, pd.x, pd.y, r * 0.22, shade(c, -0.2));
      if (pd.frozen > 0) {
        circle(gx, pd.x, pd.y, r + 6, 'rgba(160,220,255,0.55)', '#bfe9ff', 3);
        text(gx, '🧊', pd.x, pd.y, { size: 22, player: p });
      }
    }
    // Power buttons
    for (const p of [0, 1] as PlayerIndex[]) this.powerBtns[p]?.render(gx, g.energy[p], this.t);
    // Who scored banner
    if (this.goalFlash > 0) {
      const c = this.ctx.players[this.lastScorer].color;
      gx.globalAlpha = this.goalFlash * 0.25;
      rrect(gx, 0, this.lastScorer === 0 ? MID : 0, W, MID, 0, c);
      gx.globalAlpha = 1;
    }
  }
}

const def: GameDef = { id: 'airhockey', create: (ctx) => new AirHockeyView(ctx) };
export default def;
