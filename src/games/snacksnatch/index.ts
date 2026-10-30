// Snack Snatch view: taps become snaps; state becomes a picnic blanket with a
// snack pot in the middle and two round frog-like "Chompers" per player.
import { PLAYERS, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, noGlow, rrect, shade, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { Button, PowerButton } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { fwd, RULES, SnackSnatch, SnackSnatchBot, type Critter, type Intent, type Snack } from './logic';

/** Snack looks: cookie, donut, berry, cracker. */
const KINDS = ['#d9a066', '#ff8fc2', '#ff5c7a', '#f4c96b'];

class SnackSnatchView implements GameInstance {
  readonly game: SnackSnatch;
  private bots: (SnackSnatchBot | null)[];
  private powerBtns: (PowerButton | null)[];
  /** buttons[p][i]: the critter bodies double as their tap buttons. */
  private buttons: [Button, Button][];
  private t = 0;
  private scoreBump: [number, number] = [0, 0];
  private chew: number[][] = [
    [0, 0],
    [0, 0],
  ];
  private potKick = 0;
  private suddenBanner = 0;
  private ended = false;

  constructor(private readonly ctx: GameContext) {
    this.game = new SnackSnatch(ctx.players, ctx.powersOn, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new SnackSnatchBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      return new PowerButton(W / 2, p === 0 ? H - 36 : 36, p, pw, ctx.players[p].color);
    });
    this.buttons = PLAYERS.map((p) =>
      this.game.critters[p].map((c) => new Button(c.x, this.bodyY(p), 40, p, '', ctx.players[p].color, 18)) as [Button, Button],
    );
  }

  private bodyY(p: PlayerIndex): number {
    return p === 0 ? H - 62 : 62;
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    const intents = PLAYERS.map((p): Intent => {
      const bot = this.bots[p];
      if (bot) {
        const it = bot.think(g, dt);
        this.buttons[p].forEach((b, i) => b.set(it.snap[i]));
        return it;
      }
      const pb = this.powerBtns[p];
      const fire = pb ? pb.update(input, g.energy[p], KEYS[p].power) : false;
      const snap: [boolean, boolean] = [false, false];
      // A new finger anywhere in your half snaps the critter on that side (not on the power button).
      for (const f of input.of(p)) {
        if (!f.pressed || (pb && pb.button.hit(f.startX, f.startY))) continue;
        snap[f.x < W / 2 ? 0 : 1] = true;
      }
      // Keys: left/right snap the critter on that side of the screen.
      if (input.keyPressed(KEYS[p].left)) snap[0] = true;
      if (input.keyPressed(KEYS[p].right)) snap[1] = true;
      this.buttons[p].forEach((b, i) => b.set(snap[i]));
      return { snap, power: fire };
    }) as [Intent, Intent];
    g.step(dt, intents);
    for (const p of PLAYERS) {
      this.scoreBump[p] = Math.max(0, this.scoreBump[p] - dt * 3);
      for (let i = 0; i < 2; i++) this.chew[p][i] = Math.max(0, this.chew[p][i] - dt * 2.5);
    }
    this.potKick = Math.max(0, this.potKick - dt * 5);
    this.suddenBanner = Math.max(0, this.suddenBanner - dt);
    this.events();
  }

  private events(): void {
    const g = this.game;
    const { sfx, fx, players } = this.ctx;
    for (const e of g.events) {
      if (e.type === 'snap') {
        sfx.play(e.double ? 'whoosh' : 'chop');
      } else if (e.type === 'miss') {
        sfx.play('buzz');
        const c = g.critters[e.p][e.i];
        fx.pop('miss', c.x, c.restY + fwd(e.p) * 10, 'rgba(255,255,255,0.75)', e.p, 15);
      } else if (e.type === 'grab') {
        sfx.play(e.gold ? 'coin' : 'pop');
        const c = players[e.p].color;
        fx.burst(e.x, e.y, e.gold ? COLORS.gold : c, e.gold ? 22 : 10, e.gold ? 240 : 150, e.gold ? 4 : 3);
        const label = e.combo > 1 ? `+${e.value} ×${e.combo}!` : `+${e.value}`;
        fx.pop(label, e.x, e.y + fwd(e.p) * 20, e.gold ? COLORS.gold : '#fff', e.p, e.gold ? 28 : 22);
        this.scoreBump[e.p] = 1;
        this.chew[e.p][e.i] = 1;
        if (e.gold) fx.shake(4, 0.15);
      } else if (e.type === 'spawn') {
        this.potKick = 1;
        if (e.gold) {
          sfx.play('coin');
          fx.burst(e.x, e.y, COLORS.gold, 10, 120, 3);
        } else sfx.play('click');
      } else if (e.type === 'tick') {
        sfx.play('count');
      } else if (e.type === 'sudden') {
        sfx.play('go');
        fx.flash(COLORS.gold, 0.2);
        this.suddenBanner = 2;
      } else if (e.type === 'power') {
        sfx.play('power');
        const pw = players[e.p].power!;
        fx.flash('#ffd54a', 0.12);
        fx.pop(`${pw.icon} ${pw.name}!`, W / 2, e.p === 0 ? MID + 90 : MID - 90, COLORS.gold, e.p, 24);
      } else if (e.type === 'win') {
        sfx.play('win');
        if (!this.ended) {
          this.ended = true;
          const s = g.score;
          this.ctx.end({ winner: e.p, score: [...s] as [number, number], summary: `${s[0]} – ${s[1]} snacks${g.sudden ? ' (sudden snack)' : ''}` });
          if (e.p !== null) fx.burst(W / 2, e.p === 0 ? H - 150 : 150, players[e.p].color, 40, 300, 5);
        }
      }
    }
  }

  render(gx: G): void {
    const g = this.game;
    this.renderBlanket(gx);
    this.renderPowerZones(gx);
    this.renderPot(gx);
    this.renderClock(gx);
    for (const sn of g.snacks) this.renderSnack(gx, sn);
    for (const p of PLAYERS) for (const c of g.critters[p]) this.renderCritter(gx, c);
    for (const p of PLAYERS) this.renderScore(gx, p);
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, g.energy[p], this.t);
    if (this.suddenBanner > 0 || g.sudden) {
      const a = g.sudden ? 1 : this.suddenBanner;
      for (const p of PLAYERS) {
        text(gx, 'SUDDEN SNACK!', W / 2, p === 0 ? MID + 64 : MID - 64, { size: 24, color: COLORS.gold, stroke: 'rgba(60,20,0,0.7)', player: p, alpha: Math.min(1, a) });
        if (this.suddenBanner > 0)
          text(gx, 'First to gulp the gold wins', W / 2, p === 0 ? MID + 92 : MID - 92, { size: 14, color: '#fff', stroke: 'rgba(0,0,0,0.5)', player: p, alpha: Math.min(1, a) });
      }
    }
  }

  private renderBlanket(gx: G): void {
    const [c0, c1] = [this.ctx.players[0].color, this.ctx.players[1].color];
    // Grass around the blanket
    gx.fillStyle = '#3f8f4f';
    gx.fillRect(0, 0, W, H);
    // Gingham picnic blanket over the play field
    const top = RULES.gum[1] - 6;
    const bot = RULES.gum[0] + 6;
    rrect(gx, 4, top, W - 8, bot - top, 14, '#fff6ec');
    gx.save();
    gx.beginPath();
    gx.roundRect(4, top, W - 8, bot - top, 14);
    gx.clip();
    const sq = 30;
    gx.fillStyle = 'rgba(255,110,110,0.22)';
    for (let x = 4; x < W; x += sq * 2) gx.fillRect(x, top, sq, bot - top);
    for (let y = top; y < bot; y += sq * 2) gx.fillRect(4, y, W, sq);
    gx.restore();
    // Each player's home edge: a soft band in their colour.
    for (const p of PLAYERS) {
      const c = p === 0 ? c0 : c1;
      const y0 = p === 0 ? RULES.gum[0] : 0;
      const y1 = p === 0 ? H : RULES.gum[1];
      const grad = gx.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(p === 0 ? 0 : 1, alpha(c, 0.35));
      grad.addColorStop(p === 0 ? 1 : 0, alpha(c, 0.12));
      gx.fillStyle = grad;
      gx.fillRect(0, y0, W, y1 - y0);
      // Gum line the snacks bounce off
      gx.fillStyle = shade(c, -0.25);
      gx.fillRect(4, (p === 0 ? RULES.gum[0] : RULES.gum[1]) - 2, W - 8, 4);
    }
    // Side rails
    gx.fillStyle = '#8a5a3b';
    gx.fillRect(0, top, RULES.wall - 2, bot - top);
    gx.fillRect(W - RULES.wall + 2, top, RULES.wall - 2, bot - top);
  }

  private renderPowerZones(gx: G): void {
    const g = this.game;
    for (const p of PLAYERS) {
      const c = this.ctx.players[p].color;
      if (g.stickyOn(p)) {
        // Honey puddle in front of this player.
        const y0 = p === 0 ? RULES.gum[0] - RULES.stickyRange : RULES.gum[1];
        gx.globalAlpha = 0.28 + 0.06 * Math.sin(this.t * 5);
        rrect(gx, RULES.wall, y0, W - RULES.wall * 2, RULES.stickyRange, 18, '#ffb627');
        gx.globalAlpha = 1;
      }
      if (g.magnetOn(p)) {
        for (const cr of g.critters[p]) {
          for (let k = 0; k < 3; k++) {
            const ph = (this.t * 1.6 + k / 3) % 1;
            circle(gx, cr.x, cr.restY, 30 + (1 - ph) * 110, undefined, alpha(c, 0.45 * ph), 3);
          }
        }
      }
    }
  }

  private renderPot(gx: G): void {
    const k = this.potKick;
    const r = RULES.potR * (1 + 0.12 * k);
    circle(gx, W / 2, MID + 4, r + 2, 'rgba(0,0,0,0.25)');
    circle(gx, W / 2, MID, r, '#c0703f', '#7a3f1d', 4);
    circle(gx, W / 2, MID, r * 0.62, '#5a2d14');
    // Snacks peeking out of the pot
    circle(gx, W / 2 - 6, MID - 3, 5, KINDS[0]);
    circle(gx, W / 2 + 6, MID + 2, 5, KINDS[1]);
    circle(gx, W / 2 + 1, MID + 6, 4, COLORS.gold);
  }

  private renderClock(gx: G): void {
    const g = this.game;
    const total = g.sudden ? RULES.suddenTime : RULES.matchTime;
    const frac = Math.max(0, g.timeLeft / total);
    // Timer ring round the pot
    gx.beginPath();
    gx.lineWidth = 6;
    gx.lineCap = 'round';
    gx.strokeStyle = 'rgba(0,0,0,0.12)';
    gx.arc(W / 2, MID, RULES.potR + 10, 0, Math.PI * 2);
    gx.stroke();
    gx.beginPath();
    gx.strokeStyle = g.timeLeft <= 5 ? COLORS.bad : '#7a3f1d';
    gx.arc(W / 2, MID, RULES.potR + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    gx.stroke();
    const sec = Math.max(0, Math.ceil(g.timeLeft));
    const urgent = g.timeLeft <= 5;
    const size = urgent ? 30 + 6 * (g.timeLeft % 1) : 24;
    // Each player reads the clock beside the pot, on their side.
    text(gx, String(sec), W / 2 + 74, MID + 14, { size, color: urgent ? COLORS.bad : 'rgba(90,45,20,0.75)', player: 0 });
    text(gx, String(sec), W / 2 - 74, MID - 14, { size, color: urgent ? COLORS.bad : 'rgba(90,45,20,0.75)', player: 1 });
  }

  private renderSnack(gx: G, sn: Snack): void {
    const r = sn.r;
    circle(gx, sn.x + 2, sn.y + 3, r, 'rgba(0,0,0,0.2)');
    if (sn.gold) {
      glow(gx, COLORS.gold, 14 + 4 * Math.sin(this.t * 8));
      circle(gx, sn.x, sn.y, r, COLORS.gold, '#b8860b', 2.5);
      noGlow(gx);
      text(gx, '★', sn.x, sn.y + 1, { size: 14, color: '#b8860b' });
      return;
    }
    const col = KINDS[sn.kind];
    if (sn.kind === 0) {
      // Cookie with chips
      circle(gx, sn.x, sn.y, r, col, shade(col, -0.3), 2);
      circle(gx, sn.x - 3, sn.y - 3, 1.8, '#5a2d14');
      circle(gx, sn.x + 3, sn.y + 1, 1.8, '#5a2d14');
      circle(gx, sn.x - 1, sn.y + 4, 1.6, '#5a2d14');
    } else if (sn.kind === 1) {
      // Donut
      circle(gx, sn.x, sn.y, r, '#e8b26a', '#b07a3a', 2);
      circle(gx, sn.x, sn.y, r * 0.78, col);
      circle(gx, sn.x, sn.y, r * 0.3, '#fff6ec');
    } else if (sn.kind === 2) {
      // Berry
      circle(gx, sn.x, sn.y, r, col, shade(col, -0.35), 2);
      circle(gx, sn.x - 3, sn.y - 3, 2.5, 'rgba(255,255,255,0.6)');
      circle(gx, sn.x, sn.y - r + 1, 3, '#3fbf6a');
    } else {
      // Cracker
      rrect(gx, sn.x - r, sn.y - r, r * 2, r * 2, 4, col, shade(col, -0.3), 2);
      circle(gx, sn.x - 3, sn.y - 3, 1.3, shade(col, -0.35));
      circle(gx, sn.x + 3, sn.y + 3, 1.3, shade(col, -0.35));
      circle(gx, sn.x + 3, sn.y - 3, 1.3, shade(col, -0.35));
    }
  }

  private renderCritter(gx: G, c: Critter): void {
    const g = this.game;
    const p = c.p;
    const col = this.ctx.players[p].color;
    const dark = shade(col, -0.4);
    const bodyY = this.bodyY(p);
    const ext = g.extension(c);
    const btn = this.buttons[p][c.i];
    const double = g.doubleLeft[p] > 0;
    // Draw in the critter's own frame: "up" is toward the field.
    facing(gx, p, c.x, bodyY, () => {
      const by = bodyY;
      const press = btn.held ? 3 : 0;
      const restOff = Math.abs(c.restY - bodyY); // distance body → resting head, in the local frame
      const hy = by - restOff - ext;
      // Reach guide: faint dotted line showing how far the next snap goes.
      const nr = g.nextReach(p);
      gx.setLineDash([3, 7]);
      gx.beginPath();
      gx.moveTo(c.x, by - restOff - RULES.headR);
      gx.lineTo(c.x, by - restOff - nr - RULES.headR);
      gx.strokeStyle = double ? alpha('#ffd54a', 0.9) : 'rgba(90,45,20,0.25)';
      gx.lineWidth = double ? 3 : 2;
      gx.stroke();
      gx.setLineDash([]);
      circle(gx, c.x, by - restOff - nr, 3, double ? COLORS.gold : 'rgba(90,45,20,0.25)');
      // Stretchy neck
      if (ext > 2) {
        gx.lineCap = 'round';
        gx.beginPath();
        gx.moveTo(c.x, by - 10);
        gx.lineTo(c.x, hy);
        gx.strokeStyle = dark;
        gx.lineWidth = 24;
        gx.stroke();
        gx.strokeStyle = col;
        gx.lineWidth = 18;
        gx.stroke();
      }
      // Body (also the tap button)
      circle(gx, c.x, by + 6, 40, 'rgba(0,0,0,0.3)');
      circle(gx, c.x, by + press, 40, col, dark, 4);
      circle(gx, c.x, by + 10 + press, 24, alpha('#ffffff', 0.35));
      // Little feet
      circle(gx, c.x - 30, by + 26 + press, 9, col, dark, 3);
      circle(gx, c.x + 30, by + 26 + press, 9, col, dark, 3);
      // Head
      const open = c.snapT >= 0 && g.biting(c) ? 1 : c.snapT >= 0 ? 0.4 : 0;
      const chew = this.chew[p][c.i];
      const hr = RULES.headR * (1 + 0.08 * chew * Math.sin(this.t * 40));
      if (double) glow(gx, COLORS.gold, 12);
      circle(gx, c.x, hy, hr, col, dark, 3);
      noGlow(gx);
      if (open > 0) {
        // Wide-open jaws toward the field
        gx.beginPath();
        gx.moveTo(c.x, hy + 2);
        gx.arc(c.x, hy, hr - 3, -Math.PI / 2 - 0.9 * open, -Math.PI / 2 + 0.9 * open);
        gx.closePath();
        gx.fillStyle = '#7a1f3a';
        gx.fill();
        circle(gx, c.x, hy - hr * 0.45, 5 * open, '#ff7aa2');
      } else {
        // Big smile
        gx.beginPath();
        gx.arc(c.x, hy - 4, hr * 0.55, Math.PI + 0.4, Math.PI * 2 - 0.4);
        gx.strokeStyle = dark;
        gx.lineWidth = 3;
        gx.stroke();
      }
      // Frog eyes on top of the head (toward the player)
      const eyeY = hy + hr * 0.55;
      for (const s of [-1, 1]) {
        circle(gx, c.x + s * 12, eyeY, 9, '#fff', dark, 2.5);
        if (c.dizzy) {
          text(gx, '@', c.x + s * 12, eyeY, { size: 12, color: dark });
        } else {
          circle(gx, c.x + s * 12, eyeY - 2, 4, '#1b1430');
        }
      }
      // Cooldown arc on the body
      if (c.cooldown > 0) {
        gx.beginPath();
        gx.arc(c.x, by + press, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (c.cooldown / RULES.missCooldown));
        gx.strokeStyle = c.dizzy ? 'rgba(255,92,122,0.9)' : 'rgba(255,255,255,0.6)';
        gx.lineWidth = 4;
        gx.lineCap = 'round';
        gx.stroke();
      }
      text(gx, 'TAP', c.x, by + 14 + press, { size: 14, color: 'rgba(255,255,255,0.85)' });
    });
  }

  private renderScore(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const c = this.ctx.players[p].color;
    const x = W / 2;
    const y = p === 0 ? H - 98 : 98;
    const s = 1 + 0.35 * this.scoreBump[p];
    facing(gx, p, x, y, () => {
      rrect(gx, x - 30, y - 20, 60, 40, 14, 'rgba(0,0,0,0.35)', alpha(c, 0.9), 2.5);
      text(gx, String(g.score[p]), x, y + 1, { size: Math.round(26 * s), color: '#fff' });
      if (g.doubleLeft[p] > 0) text(gx, `👅×${g.doubleLeft[p]}`, x, y - 32, { size: 14, color: COLORS.gold, stroke: 'rgba(0,0,0,0.5)' });
    });
  }
}

const def: GameDef = { id: 'snacksnatch', create: (ctx) => new SnackSnatchView(ctx) };
export default def;
