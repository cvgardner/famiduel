// Snake Duel view: two turn buttons per player, a neon grid arena, juice on every crash.
import { other, PLAYERS, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, noGlow, rrect, shade, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { PowerButton } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { DX, DY, RULES, SnakeBot, SnakeDuel, type Intent } from './logic';

const { cell: C, ox: OX, oy: OY, cols: COLS, rows: ROWS } = RULES;
const AW = COLS * C;
const AH = ROWS * C;
/** Turn buttons in each player's strip, in screen coordinates. */
const BTN = { w: 124, h: 60, gap: 10 };

type Rect = { x: number; y: number; w: number; h: number };

function turnRect(p: PlayerIndex, turn: -1 | 1): Rect {
  // From each player's seat, "left" is on their left hand side.
  const leftOnScreen = p === 0 ? turn === -1 : turn === 1;
  const x = leftOnScreen ? 12 : W - 12 - BTN.w;
  const y = p === 0 ? H - BTN.gap - BTN.h : BTN.gap;
  return { x, y, w: BTN.w, h: BTN.h };
}

const cx = (x: number) => OX + x * C + C / 2;
const cy = (y: number) => OY + y * C + C / 2;

class SnakeView implements GameInstance {
  readonly game: SnakeDuel;
  private bots: (SnakeBot | null)[];
  private powerBtns: (PowerButton | null)[];
  private pressT: [[number, number], [number, number]] = [[0, 0], [0, 0]];
  private bombRings: { x: number; y: number; t: number; c: string }[] = [];
  private t = 0;
  private flash = 0;
  private ended = false;

  constructor(private readonly ctx: GameContext) {
    this.game = new SnakeDuel(ctx.players, ctx.powersOn, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new SnakeBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      return new PowerButton(W / 2, p === 0 ? H - 48 : 48, p, pw, ctx.players[p].color);
    });
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    const intents = PLAYERS.map((p): Intent => {
      const bot = this.bots[p];
      const intent: Intent = bot ? bot.think(g, dt) : { turn: 0, power: false };
      if (!bot) {
        const btn = this.powerBtns[p];
        intent.power = btn ? btn.update(input, g.energy[p], KEYS[p].power) : false;
        for (const f of input.of(p)) {
          if (!f.pressed || (btn && btn.button.hit(f.x, f.y))) continue;
          // Anywhere on your side of your half works; the drawn buttons show which is which.
          const leftSide = p === 0 ? f.x < W / 2 : f.x >= W / 2;
          intent.turn = leftSide ? -1 : 1;
        }
        if (input.keyPressed(KEYS[p].left)) intent.turn = -1;
        if (input.keyPressed(KEYS[p].right)) intent.turn = 1;
      }
      if (intent.turn) this.pressT[p][intent.turn === -1 ? 0 : 1] = 0.15;
      return intent;
    }) as [Intent, Intent];
    g.step(dt, intents);
    for (const p of PLAYERS) for (const k of [0, 1]) this.pressT[p][k] = Math.max(0, this.pressT[p][k] - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.bombRings = this.bombRings.filter((r) => (r.t += dt) < 0.5);
    const { sfx, fx, players } = this.ctx;
    for (const e of g.events) {
      if (e.type === 'turn') {
        sfx.play(e.auto ? 'pop' : 'click');
        if (e.auto) fx.pop('assist!', cx(g.snakes[e.p].x), cy(g.snakes[e.p].y) + (e.p === 0 ? -14 : 14), COLORS.gold, e.p, 12);
      } else if (e.type === 'move') {
        const s = g.snakes[e.p];
        if (s.boost > 0) fx.burst(cx(s.x), cy(s.y), COLORS.gold, 2, 60, 2);
      } else if (e.type === 'crash') {
        sfx.play('thud');
        fx.shake(8, 0.3);
        fx.burst(cx(e.x), cy(e.y), players[e.p].color, 34, 260, 4);
        fx.burst(cx(e.x), cy(e.y), '#ffffff', 12, 160, 3);
        fx.pop('CRASH!', cx(e.x), cy(e.y), '#ffffff', e.p, 22);
      } else if (e.type === 'headon') {
        sfx.play('buzz');
        fx.flash('#ffffff', 0.2);
      } else if (e.type === 'phaseThrough') {
        sfx.play('whoosh');
        fx.burst(cx(e.x), cy(e.y), '#d9d2ff', 12, 120, 3);
      } else if (e.type === 'bomb') {
        sfx.play('splash');
        fx.shake(6, 0.25);
        fx.burst(cx(e.x), cy(e.y), '#ffb020', 40, 280, 4);
        fx.burst(cx(e.x), cy(e.y), '#ffffff', 16, 180, 3);
        this.bombRings.push({ x: cx(e.x), y: cy(e.y), t: 0, c: players[e.p].color });
        fx.pop('POOF!', cx(e.x), cy(e.y), COLORS.gold, e.p, 26);
      } else if (e.type === 'power') {
        sfx.play('power');
        const pw = players[e.p].power!;
        fx.flash('#ffd54a', 0.12);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, e.p === 0 ? MID + 70 : MID - 70, COLORS.gold, e.p, 24);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, e.p === 0 ? MID + 70 : MID - 70, players[e.p].color, other(e.p), 16);
      } else if (e.type === 'roundStart') {
        sfx.play('go');
      } else if (e.type === 'roundEnd') {
        this.flash = 1;
        if (e.winner !== null) {
          sfx.play('score');
          fx.burst(W / 2, e.winner === 0 ? H - 60 : 60, players[e.winner].color, 30, 300, 4);
        }
      } else if (e.type === 'win' && !this.ended) {
        this.ended = true;
        sfx.play('win');
        this.ctx.end({ winner: e.p, score: [...g.score] as [number, number], summary: `${g.score[0]} – ${g.score[1]} rounds` });
      }
    }
  }

  render(gx: G): void {
    const g = this.game;
    const col = [this.ctx.players[0].color, this.ctx.players[1].color];
    gx.fillStyle = '#0d0b22';
    gx.fillRect(0, 0, W, H);
    // Player strips, tinted with each player's colour.
    for (const p of PLAYERS) {
      const y = p === 0 ? OY + AH : 0;
      const grad = gx.createLinearGradient(0, p === 0 ? H : 0, 0, p === 0 ? OY + AH : OY);
      grad.addColorStop(0, alpha(col[p], 0.28));
      grad.addColorStop(1, alpha(col[p], 0.05));
      gx.fillStyle = grad;
      gx.fillRect(0, y, W, H - AH - OY);
    }
    // Arena
    rrect(gx, OX - 4, OY - 4, AW + 8, AH + 8, 8, '#171436', '#3b3577', 3);
    gx.strokeStyle = 'rgba(120,120,220,0.08)';
    gx.lineWidth = 1;
    gx.beginPath();
    for (let x = 1; x < COLS; x++) {
      gx.moveTo(OX + x * C, OY);
      gx.lineTo(OX + x * C, OY + AH);
    }
    for (let y = 1; y < ROWS; y++) {
      gx.moveTo(OX, OY + y * C);
      gx.lineTo(OX + AW, OY + y * C);
    }
    gx.stroke();
    // Midline so each player sees their home half
    gx.setLineDash([6, 6]);
    gx.strokeStyle = 'rgba(255,255,255,0.08)';
    gx.beginPath();
    gx.moveTo(OX, MID);
    gx.lineTo(OX + AW, MID);
    gx.stroke();
    gx.setLineDash([]);
    // Trails
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const v = g.grid[g.idx(x, y)];
        if (!v) continue;
        const c = col[v - 1];
        rrect(gx, OX + x * C + 1, OY + y * C + 1, C - 2, C - 2, 3, shade(c, -0.15));
        rrect(gx, OX + x * C + 3, OY + y * C + 3, C - 6, C - 6, 2, alpha('#ffffff', 0.18));
      }
    for (const r of this.bombRings) circle(gx, r.x, r.y, 10 + r.t * 90, undefined, alpha(r.c, 1 - r.t * 2), 4);
    // Heads
    for (const p of PLAYERS) this.drawHead(gx, p, col[p]);
    // Controls, scores, power buttons
    for (const p of PLAYERS) this.drawControls(gx, p, col[p]);
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, g.energy[p], this.t);
    this.drawBanner(gx);
  }

  private drawHead(gx: G, p: PlayerIndex, c: string): void {
    const s = this.game.snakes[p];
    const x = cx(s.x);
    const y = cy(s.y);
    const ghost = s.phase > 0 || s.phasing;
    if (s.boost > 0) glow(gx, COLORS.gold, 18);
    else glow(gx, c, 14);
    gx.globalAlpha = ghost ? 0.55 + 0.25 * Math.sin(this.t * 14) : 1;
    circle(gx, x, y, s.alive ? 8 : 7, s.alive ? c : '#666', '#ffffff', 2);
    noGlow(gx);
    gx.globalAlpha = 1;
    if (ghost) circle(gx, x, y, 12, undefined, '#d9d2ff', 2);
    // Eyes look where the snake is going
    const fx = DX[s.dir];
    const fy = DY[s.dir];
    for (const side of [-1, 1]) {
      const ex = x + fx * 3 + -fy * side * 3.5;
      const ey = y + fy * 3 + fx * side * 3.5;
      circle(gx, ex, ey, 2.4, '#ffffff');
      circle(gx, ex + fx, ey + fy, 1.2, '#14112b');
    }
    // Before a round starts, show which way each snake is facing.
    if (this.game.phase === 'intro') {
      const k = 0.5 + 0.5 * Math.sin(this.t * 8);
      for (let i = 1; i <= 3; i++) circle(gx, x + fx * C * (i + 0.4), y + fy * C * (i + 0.4), 2.5, alpha(c, (1 - i / 4) * (0.5 + 0.5 * k)));
    }
  }

  private drawControls(gx: G, p: PlayerIndex, c: string): void {
    for (const turn of [-1, 1] as const) {
      const r = turnRect(p, turn);
      const pressed = this.pressT[p][turn === -1 ? 0 : 1] > 0;
      const sink = pressed ? 3 : 0;
      rrect(gx, r.x, r.y + 4, r.w, r.h, 18, 'rgba(0,0,0,0.4)');
      rrect(gx, r.x, r.y + sink, r.w, r.h, 18, pressed ? shade(c, 0.25) : alpha(c, 0.85), 'rgba(255,255,255,0.55)', 2);
      facing(gx, p, r.x + r.w / 2, r.y + r.h / 2 + sink, () => turnArrow(gx, r.x + r.w / 2, r.y + r.h / 2 + sink, turn));
    }
    // Round wins as pips, between the buttons and toward the middle of the screen.
    const g = this.game;
    const yy = p === 0 ? H - 9 : 9;
    facing(gx, p, W / 2, yy, () => {
      for (let i = 0; i < RULES.winRounds; i++) {
        const x = W / 2 + (i - 1) * 16;
        circle(gx, x, yy, 5.5, i < g.score[p] ? c : 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.4)', 1.5);
      }
    });
    // Score line next to the arena edge, read from the player's seat.
    const sy = p === 0 ? OY + AH + 10 : OY - 10;
    text(gx, `${g.score[p]} – ${g.score[other(p)]}`, p === 0 ? W - 30 : 30, sy, { size: 11, color: alpha('#ffffff', 0.6), player: p });
    text(gx, `Round ${g.round}`, p === 0 ? 34 : W - 34, sy, { size: 11, color: alpha('#ffffff', 0.6), player: p });
  }

  private drawBanner(gx: G): void {
    const g = this.game;
    const players = this.ctx.players;
    let msg: [string, string] | null = null;
    let color: [string, string] = ['#fff', '#fff'];
    if (g.phase === 'intro') {
      msg = [`Round ${g.round}`, `Round ${g.round}`];
    } else if (g.phase === 'over' && !g.done) {
      const w = g.lastRound;
      if (w === null || w === undefined) msg = ['Crash! Draw round', 'Crash! Draw round'];
      else {
        msg = w === 0 ? ['You win the round!', 'Crashed!'] : ['Crashed!', 'You win the round!'];
        color = w === 0 ? [players[0].color, '#ffffff'] : ['#ffffff', players[1].color];
      }
    }
    if (!msg) return;
    for (const p of PLAYERS) {
      const y = p === 0 ? MID + 50 : MID - 50;
      facing(gx, p, W / 2, y, () => {
        rrect(gx, W / 2 - 120, y - 24, 240, 48, 16, 'rgba(10,8,25,0.75)', alpha(players[p].color, 0.8), 2);
        text(gx, msg![p], W / 2, y, { size: 22, color: color[p] });
      });
    }
    if (g.phase === 'intro') {
      for (const p of PLAYERS) {
        const y = p === 0 ? MID + 88 : MID - 88;
        text(gx, 'Tap ◀ ▶ to turn', W / 2, y, { size: 13, color: alpha('#ffffff', 0.7), player: p });
      }
    }
  }
}

/** A curved arrow: turn -1 bends left, +1 bends right (in the current frame). */
function turnArrow(gx: G, x: number, y: number, turn: -1 | 1): void {
  gx.save();
  gx.translate(x, y);
  gx.scale(turn, 1);
  gx.strokeStyle = '#ffffff';
  gx.fillStyle = '#ffffff';
  gx.lineWidth = 6;
  gx.lineCap = 'round';
  gx.lineJoin = 'round';
  // Up the stem, then curve off to the right (mirrored for left).
  gx.beginPath();
  gx.moveTo(-8, 20);
  gx.lineTo(-8, 2);
  gx.quadraticCurveTo(-8, -10, 6, -10);
  gx.stroke();
  gx.beginPath();
  gx.moveTo(18, -10);
  gx.lineTo(4, -20);
  gx.lineTo(4, 0);
  gx.closePath();
  gx.fill();
  gx.restore();
}

const def: GameDef = { id: 'snake', create: (ctx) => new SnakeView(ctx) };
export default def;
