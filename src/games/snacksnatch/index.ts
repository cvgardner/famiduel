// Snack Snatch view: taps become snaps; state becomes a picnic blanket with a
// snack pot in the middle and two round frog-like "Chompers" per player.
import { PLAYERS, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, facing, glow, noGlow, rrect, shade, silentSeat, text, type G } from '../../engine/draw';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { POP_OUTLINE_LIGHT } from '../../engine/fx';
import { Button, PowerButton } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { fwd, RULES, SnackSnatch, SnackSnatchBot, type Critter, type Intent, type Snack } from './logic';
import { contrastRatio, inkOn, over, parseColor, type RGBA } from '../../core/contrast';
import { PLAYER_COLORS } from '../../core/colors';
const GRASS = '#3f8f4f';
const BLANKET = '#fff6ec';
/** The colours most of the play area is painted in (tests read pops against them). */
export const SURFACES: readonly string[] = [GRASS, BLANKET];

/** Snack looks: cookie, donut, berry, cracker. */
const KINDS = ['#d9a066', '#ff8fc2', '#ff5c7a', '#f4c96b', '#6ec8ff', '#ffa24c'];

/**
 * F211: the "Miss!" pop's ink. It was white, and a "Miss!" always lands on the blanket, where
 * white read 1.1-2.2:1 (the thin pop outline was all that showed it, pale grey on a phone). Dark
 * ink reads on the blanket, its gingham and both home bands by itself (8:1 or more).
 */
export const MISS_INK = '#1b1430';
/** The blanket's gingham stripes (drawn twice where they cross). */
const GINGHAM = 'rgba(255,110,110,0.22)';
type RGB = [number, number, number];
/**
 * F213: every colour a pop on the blanket can sit on: the blanket, its gingham once and
 * twice, and each player's home band where it meets the blanket's edge.
 */
export function blanketSurfaces(): RGB[] {
  const rgb = (c: string) => parseColor(c)!.slice(0, 3) as RGB;
  const blanket = rgb(BLANKET);
  const once = over(parseColor(GINGHAM)!, blanket, 1) as RGB;
  const twice = over(parseColor(GINGHAM)!, once, 1) as RGB;
  const bands = PLAYER_COLORS.map((c) => over([...rgb(c.hex), 0.35] as RGBA, twice, 1) as RGB);
  return [blanket, once, twice, ...bands];
}
/** A pop's worst contrast on the blanket while still bright (drawn at 80%), outline not counted. */
export function worstOnBlanket(ink: string, surfaces = blanketSurfaces()): number {
  const c = parseColor(ink)!.slice(0, 3) as RGB;
  return Math.min(...surfaces.map((bg) => contrastRatio(over([...c, 0.8] as RGBA, bg, 1) as RGB, bg)));
}
/**
 * F213: grab pops ("+N", "+N ×k!") land on the blanket too (99.8% of their bright frames in
 * bot matches lie wholly inside it), where white read 1.1:1 and gold ~1.4:1, so only the thin
 * outline showed them. A grab pop is the grabbing player's colour, darkened just enough to
 * hold 3:1 on the blanket and its gingham (the home bands only reach 6 units over its edge),
 * with a light halo like "Miss!" (a black outline smudges dark letters).
 */
export const GRAB_SURFACES = 3;
const grabInks = new Map<string, string>();
export function grabInk(hex: string): string {
  let ink = grabInks.get(hex);
  if (!ink) {
    const surfaces = blanketSurfaces().slice(0, GRAB_SURFACES);
    ink = hex;
    for (let k = 0.05; worstOnBlanket(ink, surfaces) < 3 && k < 1; k += 0.05) ink = shade(hex, -k);
    grabInks.set(hex, ink);
  }
  return ink;
}
/**
 * F213: a gold snack's pop: deep amber (gold itself read ~1.4:1 on the blanket) with a gold
 * halo, so it still reads as gold and apart from an Orange player's "+N".
 */
export const GOLD_INK = '#7a4f00';
export const GOLD_HALO = alpha(COLORS.gold, 0.9);
/** Room between the frog's head and its "Miss!" pop (F176). */
const MISS_GAP = 16;
/** F182: the seconds-left's blanket-coloured outline, so it reads over a snack resting under it. */
const SECONDS_HALO = alpha(BLANKET, 0.9);
/** Where each seat's seconds-left sits, beside the pot on its side. */
export function clockSpots(): [PlayerIndex, number, number][] {
  return [[0, W / 2 + 74, MID + 14], [1, W / 2 - 74, MID - 14]];
}
/** Half the size of a seconds-left label at its biggest (two digits, the last-5-s pulse at 36). */
const CLOCK_HALF_W = 22;
const CLOCK_HALF_H = 17;

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
  private frenzyBanner = 0;
  private ended = false;

  constructor(private readonly ctx: GameContext) {
    this.game = new SnackSnatch(ctx.players, ctx.powersOn, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new SnackSnatchBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      return new PowerButton(W / 2, p === 0 ? H - 36 : 36, p, pw, ctx.players[p].color, silentSeat(ctx.players, p));
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
    this.frenzyBanner = Math.max(0, this.frenzyBanner - dt);
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
        // F143: was 15 in 75% white (about 13 px on a small phone, hard to spot); a kid
        // should see at a glance why their frog went dizzy.
        // F176: it started 10 in front of the resting head, so the head pulling back from the
        // missed snap slid over it and the word sat on the frog's eyes. It starts on the
        // blanket just past the open jaws and floats on into the field, away from the head.
        const my = g.headY(c) + fwd(e.p) * (RULES.headR + MISS_GAP);
        fx.pop('Miss!', this.clearOfClock('Miss!', c.x, my, 19, e.p), my, MISS_INK, e.p, 19);
      } else if (e.type === 'grab') {
        sfx.play(e.gold ? 'coin' : 'pop');
        const c = players[e.p].color;
        fx.burst(e.x, e.y, e.gold ? COLORS.gold : c, e.gold ? 22 : 10, e.gold ? 240 : 150, e.gold ? 4 : 3);
        const label = e.combo > 1 ? `+${e.value} ×${e.combo}!` : `+${e.value}`;
        const size = e.gold ? 28 : 22;
        const ly = e.y + fwd(e.p) * 20;
        fx.pop(label, this.clearOfClock(label, e.x, ly, size, e.p), ly, e.gold ? GOLD_INK : grabInk(c), e.p, size, e.gold ? GOLD_HALO : POP_OUTLINE_LIGHT);
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
      } else if (e.type === 'frenzy') {
        sfx.play('go');
        fx.flash('#ff5c7a', 0.15);
        fx.shake(5, 0.25);
        this.frenzyBanner = 1.6;
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
    this.renderSeconds(gx);
    for (const p of PLAYERS) for (const c of g.critters[p]) this.renderCritter(gx, c);
    for (const p of PLAYERS) this.renderScore(gx, p);
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, g.energy[p], this.t);
    if (this.frenzyBanner > 0 && !g.sudden) {
      for (const p of PLAYERS) {
        text(gx, 'FRENZY!', W / 2, p === 0 ? MID + 64 : MID - 64, { size: 30, color: '#ff5c7a', stroke: 'rgba(40,0,10,0.75)', player: p, alpha: Math.min(1, this.frenzyBanner), pair: true });
        text(gx, 'Faster snacks!', W / 2, p === 0 ? MID + 94 : MID - 94, { size: 14, color: '#fff', stroke: 'rgba(0,0,0,0.5)', player: p, alpha: Math.min(1, this.frenzyBanner), pair: true });
      }
    }
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
    gx.fillStyle = GRASS;
    gx.fillRect(0, 0, W, H);
    // Gingham picnic blanket over the play field
    const top = RULES.gum[1] - 6;
    const bot = RULES.gum[0] + 6;
    rrect(gx, 4, top, W - 8, bot - top, 14, BLANKET);
    gx.save();
    gx.beginPath();
    gx.roundRect(4, top, W - 8, bot - top, 14);
    gx.clip();
    const sq = 30;
    gx.fillStyle = GINGHAM;
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
  }

  /**
   * The seconds left, beside the pot on each player's side. F182: drawn after the snacks, with a
   * blanket-coloured outline, because snacks often roll to a stop there and hid the number (the
   * digits stay out of every critter's reach, so they never cover a snack you could gulp).
   */
  /**
   * F191: a "Miss!" or "+1" by the pot started on a seconds-left label (the frogs nearest the
   * pot reach right past them) and rose across it. The pop slides sideways, the shorter way that
   * stays on screen, until its whole rise (fx floats it 40/s for 0.9 s) misses every shown label.
   */
  private clearOfClock(str: string, x: number, y: number, size: number, p: PlayerIndex): number {
    const half = ([...str].length * size * 0.55) / 2;
    const rise = p === 0 ? -36 : 36;
    // One stacked line either way too: fx moves a pop a line off one still bright there (F184).
    const line = size + 4;
    const top = Math.min(y, y + rise) - size * 0.45 - line;
    const bot = Math.max(y, y + rise) + size * 0.45 + line;
    const labels = clockSpots().filter(([q]) => !silentSeat(this.ctx.players, q));
    const blocked = (cx: number) => labels.some(([, lx, ly]) => Math.abs(cx - lx) < half + CLOCK_HALF_W && top < ly + CLOCK_HALF_H && ly - CLOCK_HALF_H < bot);
    if (!blocked(x)) return x;
    for (let d = 2; d <= W; d += 2) {
      for (const cx of x < W / 2 ? [x - d, x + d] : [x + d, x - d]) {
        if (cx - half >= 4 && cx + half <= W - 4 && !blocked(cx)) return cx;
      }
    }
    return x;
  }

  private renderSeconds(gx: G): void {
    const g = this.game;
    const sec = Math.max(0, Math.ceil(g.timeLeft));
    const urgent = g.timeLeft <= 5;
    const size = urgent ? 30 + 6 * (g.timeLeft % 1) : 24;
    // Each player reads the clock beside the pot, on their side. F160: a bot's copy would turn
    // to face the person and read as a second clock, so a bot seat facing a person gets none.
    const ink = urgent ? COLORS.bad : 'rgba(90,45,20,0.75)';
    for (const [p, x, y] of clockSpots()) {
      if (silentSeat(this.ctx.players, p)) continue;
      text(gx, String(sec), x, y, { size, color: ink, stroke: SECONDS_HALO, player: p });
    }
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
    } else if (sn.kind === 4) {
      // Wrapped sweet: twisted wrapper ends either side
      const wing = shade(col, -0.2);
      for (const sx of [-1, 1]) {
        gx.beginPath();
        gx.moveTo(sn.x + sx * (r - 2), sn.y);
        gx.lineTo(sn.x + sx * (r + 5), sn.y - 6);
        gx.lineTo(sn.x + sx * (r + 5), sn.y + 6);
        gx.closePath();
        gx.fillStyle = wing;
        gx.fill();
      }
      circle(gx, sn.x, sn.y, r - 1, col, shade(col, -0.35), 2);
      gx.strokeStyle = 'rgba(255,255,255,0.75)';
      gx.lineWidth = 2;
      gx.beginPath();
      gx.arc(sn.x, sn.y, r * 0.5, Math.PI * 1.1, Math.PI * 1.7);
      gx.stroke();
    } else if (sn.kind === 5) {
      // Orange slice: pale rind and segments
      circle(gx, sn.x, sn.y, r, '#fff1d6', shade(col, -0.3), 2);
      circle(gx, sn.x, sn.y, r * 0.8, col);
      gx.strokeStyle = '#fff1d6';
      gx.lineWidth = 1.4;
      gx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        gx.moveTo(sn.x, sn.y);
        gx.lineTo(sn.x + Math.cos(a) * r * 0.8, sn.y + Math.sin(a) * r * 0.8);
      }
      gx.stroke();
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
        gx.arc(c.x, by + press, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (c.cooldown / g.missCooldown[c.p]));
        gx.strokeStyle = c.dizzy ? 'rgba(255,92,122,0.9)' : 'rgba(255,255,255,0.6)';
        gx.lineWidth = 4;
        gx.lineCap = 'round';
        gx.stroke();
      }
      // F162: no "TAP" on a bot's hippo facing the one person (a how-to word nobody reads).
      if (!silentSeat(this.ctx.players, c.p)) text(gx, 'TAP', c.x, by + 14 + press, { size: 14, color: inkOn(col) });
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
