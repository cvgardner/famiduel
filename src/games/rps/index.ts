// Rock Paper Scissors view: each player taps one of three big buttons in their
// own half. Picks stay hidden until both are in, then a 3-2-1 shake reveals them.
import { PLAYERS, other, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, noGlow, rrect, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { Button } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { CHOICES, ICONS, RULES, Rps, RpsBot, type Choice } from './logic';

const BEAT = 0.36;
const SHAKE = BEAT * 3;
const SHOW = 1.5;
const NAMES: Record<Choice, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

/** Map a point given in player 0's coordinates to player p's side. */
const side = (p: PlayerIndex, x: number, y: number) => (p === 0 ? { x, y } : { x: W - x, y: H - y });

class RpsView implements GameInstance {
  readonly game: Rps;
  private bots: (RpsBot | null)[];
  private btns: Button[][];
  private botWait: number[] = [0, 0];
  private t = 0;
  private revealT = -1;
  private ended = false;
  private pickedAt: number[] = [-1, -1];

  constructor(private readonly ctx: GameContext) {
    this.game = new Rps(ctx.players);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new RpsBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.btns = PLAYERS.map((p) =>
      CHOICES.map((c, i) => {
        const pos = side(p, 70 + i * 110, H - 74);
        return new Button(pos.x, pos.y, 42, p, ICONS[c], ctx.players[p].color, 8);
      }),
    );
    this.newRound();
  }

  private color(p: PlayerIndex): string {
    return this.ctx.players[p].color;
  }

  private newRound(): void {
    for (const p of PLAYERS) {
      const bot = this.bots[p];
      if (bot) this.botWait[p] = bot.delay();
    }
    this.pickedAt = [-1, -1];
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    if (g.revealing) {
      this.stepReveal(dt);
      return;
    }
    for (const p of PLAYERS) {
      if (g.picks[p]) continue;
      const bot = this.bots[p];
      if (bot) {
        this.botWait[p] -= dt;
        if (this.botWait[p] <= 0) this.pick(p, bot.choose());
        continue;
      }
      const keys = [KEYS[p].left, KEYS[p].up, KEYS[p].right];
      for (let i = 0; i < 3; i++) {
        const b = this.btns[p][i];
        // Read the tap directly: a very quick tap can land and lift inside one frame.
        if (input.of(p).some((f) => f.pressed && b.hit(f.x, f.y)) || input.keyPressed(keys[i])) {
          this.pick(p, CHOICES[i]);
          break;
        }
      }
    }
  }

  private pick(p: PlayerIndex, c: Choice): void {
    const g = this.game;
    if (!g.pick(p, c)) return;
    this.pickedAt[p] = this.t;
    this.ctx.sfx.play('click');
    const pos = side(p, W / 2, MID + 70);
    this.ctx.fx.burst(pos.x, pos.y, this.color(p), 10, 140, 3);
    if (g.revealing) {
      this.revealT = 0;
      this.ctx.sfx.play('count');
    }
  }

  private stepReveal(dt: number): void {
    const g = this.game;
    const before = this.revealT;
    this.revealT += dt;
    const { sfx, fx } = this.ctx;
    // Shake beats: 3, 2, 1 ...
    for (let k = 1; k < 3; k++) if (before < k * BEAT && this.revealT >= k * BEAT) sfx.play('count');
    if (before < SHAKE && this.revealT >= SHAKE) {
      sfx.play('go');
      const r = g.last!;
      if (r.winner === null) {
        sfx.play('bounce');
        for (const p of PLAYERS) fx.pop('Tie! Go again', W / 2, p === 0 ? MID + 150 : MID - 150, '#fff', p, 24);
      } else {
        const w = r.winner;
        sfx.play('score');
        fx.shake(6, 0.22);
        const pos = side(w, W / 2, MID + 70);
        fx.burst(pos.x, pos.y, this.color(w), 30, 260, 5);
        fx.pop(`${NAMES[r.picks[w]]} wins! +1`, W / 2, w === 0 ? MID + 150 : MID - 150, COLORS.gold, w, 26);
        fx.pop(`${NAMES[r.picks[w]]} beats ${NAMES[r.picks[other(w)]].toLowerCase()}`, W / 2, w === 0 ? MID - 150 : MID + 150, '#fff', other(w), 22);
      }
    }
    if (this.revealT >= SHAKE + SHOW) {
      if (g.done) this.finish();
      else {
        g.next();
        this.newRound();
        this.revealT = -1;
      }
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const g = this.game;
    const { fx, sfx } = this.ctx;
    const score = [...g.score] as [number, number];
    if (g.winner === null) {
      sfx.play('buzz');
      this.ctx.end({ winner: null, score, summary: `${score[0]} – ${score[1]}` });
      return;
    }
    const w = g.winner;
    sfx.play('win');
    fx.flash(this.color(w), 0.25);
    for (let i = 0; i < 6; i++) {
      const pos = side(w, 40 + i * 56, H - 150);
      fx.burst(pos.x, pos.y, this.color(w), 18, 260, 4);
    }
    fx.pop('Champion!', W / 2, w === 0 ? H - 200 : 200, COLORS.gold, w, 34);
    this.ctx.end({ winner: w, score, summary: `${score[0]} – ${score[1]}` });
  }

  // ---------- Drawing ----------

  render(gx: G): void {
    const g = this.game;
    const [c0, c1] = [this.color(0), this.color(1)];
    gx.fillStyle = '#1d1636';
    gx.fillRect(0, 0, W, H);
    const tint = gx.createLinearGradient(0, 0, 0, H);
    tint.addColorStop(0, alpha(c1, 0.3));
    tint.addColorStop(0.5, 'rgba(0,0,0,0)');
    tint.addColorStop(1, alpha(c0, 0.3));
    gx.fillStyle = tint;
    gx.fillRect(0, 0, W, H);
    gx.fillStyle = 'rgba(255,255,255,0.12)';
    gx.fillRect(20, MID - 1, W - 40, 2);
    text(gx, 'VS', W / 2, MID, { size: 16, color: COLORS.dim });
    for (const p of PLAYERS) facing(gx, p, W / 2, MID, () => this.drawSide(gx, p));
    for (const p of PLAYERS) {
      const picked = g.picks[p] !== null || g.revealing;
      this.btns[p].forEach((b, i) => b.render(gx, { icon: ICONS[CHOICES[i]], disabled: picked || !!this.bots[p], fill: alpha(this.color(p), 0.9) }));
    }
  }

  /** One player's half, in player 0's coordinates; rotated for player 1. */
  private drawSide(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const c = this.color(p);
    // Hand in the middle: hidden, shaking, or revealed.
    const hx = W / 2;
    const hy = MID + 58;
    circle(gx, hx, hy, 40, alpha(c, 0.18), alpha(c, 0.6), 3);
    if (g.revealing && this.revealT >= 0) {
      if (this.revealT < SHAKE) {
        const beat = this.revealT / BEAT;
        const bob = Math.abs(Math.sin(beat * Math.PI)) * 22;
        text(gx, '✊', hx, hy + bob - 10, { size: 46 });
        text(gx, String(3 - Math.floor(beat)), hx - 86, hy, { size: 34, color: COLORS.gold, stroke: 'rgba(0,0,0,0.4)' });
      } else {
        const k = Math.min(1, (this.revealT - SHAKE) / 0.18);
        const r = g.last!;
        const won = r.winner === p;
        if (won) glow(gx, COLORS.gold, 24);
        if (won) circle(gx, hx, hy, 40, alpha(COLORS.gold, 0.25), COLORS.gold, 4);
        noGlow(gx);
        text(gx, ICONS[r.picks[p]], hx, hy, { size: 26 + 24 * k, alpha: r.winner === null || won ? 1 : 0.55 });
        text(gx, NAMES[r.picks[p]], hx + 56, hy, { size: 17, align: 'left', color: won ? COLORS.gold : COLORS.dim });
      }
    } else if (g.picks[p]) {
      const k = Math.min(1, (this.t - this.pickedAt[p]) / 0.2);
      text(gx, '✓', hx, hy, { size: 30 + 24 * k, color: COLORS.good });
    } else {
      text(gx, '?', hx, hy, { size: 50 + 4 * Math.sin(this.t * 5), color: alpha(c, 0.9) });
    }
    // Name and round wins
    const ny = H - 204;
    text(gx, `${this.ctx.players[p].name}${this.bots[p] ? ' 🤖' : ''}`, W / 2, ny, { size: 18, color: c });
    for (let i = 0; i < RULES.winRounds; i++) {
      const x = W / 2 + (i - 1) * 38;
      const on = i < g.score[p];
      if (on) glow(gx, COLORS.gold, 10);
      circle(gx, x, ny + 29, 12, on ? COLORS.gold : 'rgba(255,255,255,0.08)', on ? '#fff3b0' : 'rgba(255,255,255,0.25)', 2);
      noGlow(gx);
      if (on) text(gx, '★', x, ny + 30, { size: 13, color: '#7a5600' });
    }
    // Prompt
    const py = H - 140;
    const mine = !g.revealing && !g.done && !g.picks[p];
    if (mine) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
      glow(gx, c, 8 + 8 * pulse);
      rrect(gx, W / 2 - 110, py - 17, 220, 34, 17, c);
      noGlow(gx);
      text(gx, this.bots[p] ? 'Choosing…' : 'Pick in secret!', W / 2, py, { size: 17, color: '#fff', stroke: 'rgba(0,0,0,0.25)' });
    } else {
      rrect(gx, W / 2 - 110, py - 17, 220, 34, 17, 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.15)', 2);
      const msg = g.revealing ? (this.revealT < SHAKE ? 'Rock, paper, scissors…' : g.done ? (g.winner === p ? 'Champion!' : 'Good game') : 'Next round…') : 'Picked ✓ waiting…';
      text(gx, msg, W / 2, py, { size: 15, color: COLORS.dim, weight: 700 });
    }
  }
}

const def: GameDef = { id: 'rps', create: (ctx) => new RpsView(ctx) };
export default def;
