// Juice: particles, pop-up text, screen shake and flashes. Purely visual, so
// it uses Math.random and never affects a game's result.

import { reducedMotion } from './calm';
import { contrastRatio, luminance, over, parseColor } from '../core/contrast';
import { COLORS, fitSize, insideX, text, type G } from './draw';
import { W, H } from './world';

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Floater = { str: string; x: number; y: number; life: number; max: number; color: string; size: number; player: 0 | 1; halo?: string };

/**
 * Outline round pop-up words. Pops land on anything (dark floors, sand, grass),
 * so the outline is what they are read against: 75% black keeps even orange and
 * pink pops at 4.5:1 on Sumo's pale sand (at 50% "Last rope save!" was 2.4:1).
 */
export const POP_OUTLINE = 'rgba(0,0,0,0.75)';
/** F211: a dark-ink pop (Snack Snatch's "Miss!" on the pale blanket) gets a light halo instead:
 *  the black outline ran its letters together into one dark smudge. */
export const POP_OUTLINE_LIGHT = 'rgba(255,255,255,0.8)';

/** The outline a pop in `color` is drawn with: dark round light words, light round dark ones. */
export function popOutline(color: string): string {
  const c = parseColor(color);
  return c && luminance([c[0], c[1], c[2]]) < 0.1 ? POP_OUTLINE_LIGHT : POP_OUTLINE;
}

/**
 * A pop's colour, lightened (mixed toward white) until it reads at 4.5:1 on the dark floor
 * behind most pops. For small pops in a player's colour: Purple (#7a5cff) was 4.2:1 there,
 * so "they used …" in a Purple player's colour was too faint. Light colours pass as is.
 */
export function popColor(color: string): string {
  return liftOn(color, COLORS.bg);
}

/**
 * `color` mixed toward white until it reads at `need`:1 on `under` (a CSS colour, maybe
 * see-through like a dark card's rgba, then judged over `behind`, the brightest thing it
 * can sit on). Colours that already read come back unchanged.
 */
export function liftOn(color: string, under: string, behind = '#ffffff', need = 4.5): string {
  const c = parseColor(color);
  const u = parseColor(under);
  const b = parseColor(behind);
  if (!c || !u || !b || c[3] < 1) return color;
  const floor = over(u, [b[0], b[1], b[2]]);
  for (let k = 0; k <= 1.0001; k += 0.05) {
    const m = [0, 1, 2].map((i) => Math.round(c[i] + (255 - c[i]) * k)) as [number, number, number];
    if (contrastRatio(m, floor) >= need) return k === 0 ? color : `rgb(${m[0]},${m[1]},${m[2]})`;
  }
  return '#ffffff';
}

/** F184: a pop this young (seconds) is still bright, so a new one won't print over it. */
export const POP_FRESH = 0.55;

const fresh = (f: { life: number; max: number }) => f.max - f.life < POP_FRESH;

/** Test hook (F149): with `on`, pop() lists new pops printed over a still-bright one. */
export const popProbe = { on: false, hits: [] as string[] };

/** A pop's box, estimated: 0.55 em a character (at most the screen's width), 0.9 em tall. */
function popBox(str: string, x: number, y: number, size: number): [number, number, number, number] {
  const w = Math.min(W - 16, [...str].length * size * 0.55);
  return [x - w / 2, y - size * 0.45, x + w / 2, y + size * 0.45];
}

function overlaps(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

/** How far (world units) a pop rises while it is still bright. */
const FRESH_RISE = 40 * POP_FRESH;

/** A pop's box over its bright time: it rises toward its seat's far side (up for seat 0). */
function sweptBox(str: string, x: number, y: number, size: number, player: 0 | 1): [number, number, number, number] {
  const b = popBox(str, x, y, size);
  return player === 0 ? [b[0], b[1] - FRESH_RISE, b[2], b[3]] : [b[0], b[1], b[2], b[3] + FRESH_RISE];
}

/**
 * F198: whether still-bright pop `f` is in the way of a new pop. Same seat: their boxes meet now
 * (they rise together). Other seat: their paths meet while both are bright (they rise opposite
 * ways, so a pop just below the other seat's crosses it). One word for both seats (a "BONK!"
 * pair) is placed as a pair on purpose and never counts.
 */
function inWay(f: Floater, str: string, x: number, y: number, size: number, player: 0 | 1): boolean {
  if (!fresh(f)) return false;
  if (f.player === player) return overlaps(popBox(f.str, f.x, f.y, f.size), popBox(str, x, y, size));
  if (f.str === str) return false;
  return overlaps(sweptBox(f.str, f.x, f.y, f.size, f.player), sweptBox(str, x, y, size, player));
}

export class Fx {
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private shakeT = 0;
  private shakeAmp = 0;
  private flashT = 0;
  private flashColor = '#fff';
  private flashCalm = false;

  burst(x: number, y: number, color: string, count = 14, speed = 180, size = 4): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      const life = 0.35 + Math.random() * 0.4;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: size * (0.6 + Math.random() * 0.8) });
    }
  }

  /**
   * F196: whether a pop here would print as placed (no still-bright pop of that seat in the
   * way), so a view looking for a clear line can skip lines pop() would move it off.
   */
  popFits(str: string, x: number, y: number, size: number, player: 0 | 1): boolean {
    return !this.floaters.some((f) => inWay(f, str, x, y, size, player));
  }

  /**
   * Text that rises and fades, readable by the given player. `halo` replaces the outline
   * popOutline() picks (F213: Snack Snatch's dark-amber gold pop has a gold halo).
   */
  pop(str: string, x: number, y: number, color = '#fff', player: 0 | 1 = 0, size = 22, halo?: string): void {
    // F150: two pops born in the same step for one seat (a power used together with the other
    // seat's, two snacks landing at once) stack like lines of text: the newer one moves down a
    // line in that seat's view, toward its own edge, instead of printing over the first.
    // F184: a pop still bright from a moment ago counts too (two catches a few frames apart
    // printed "+3 ×3!" over "×2!"). The newer one goes a line ABOVE it, into the field: the
    // older one is already rising, and below it is where the player's own piece sits (a
    // frog's head). A pop already fading out is left to be drawn over.
    const down = player === 0 ? 1 : -1;
    for (let tries = 0; tries < 4; tries++) {
      const hit = this.floaters.find((f) => f.player === player && inWay(f, str, x, y, size, player));
      if (!hit) break;
      const gap = (hit.size + size) * 0.5 + 4;
      const dir = hit.life === hit.max ? down : -down;
      // No room at the screen's edge: the line goes the other way instead.
      y = hit.y + dir * gap;
      if (y > H - size / 2 || y < size / 2) y = hit.y - dir * gap;
    }
    y = Math.max(size / 2, Math.min(H - size / 2, y));
    // Still on one (a crowd of pops, or the screen's edge): take the nearest free line,
    // looking into the field first.
    const clear = (cy: number) =>
      !this.floaters.some((f) => inWay(f, str, x, cy, size, player));
    if (!clear(y)) {
      const from = y;
      for (let n = 1; n <= 60; n++) {
        const tries = [from - down * n * 4, from + down * n * 4].filter((cy) => cy >= size / 2 && cy <= H - size / 2);
        const free = tries.find(clear);
        if (free !== undefined) {
          y = free;
          break;
        }
      }
    }
    if (popProbe.on) {
      const b = popBox(str, x, y, size);
      for (const f of this.floaters) {
        if (f.player === player && fresh(f) && overlaps(popBox(f.str, f.x, f.y, f.size), b)) popProbe.hits.push(`${f.str} | ${str} (seat ${player})`);
      }
    }
    this.floaters.push({ str, x, y, life: 0.9, max: 0.9, color, size, player, halo });
  }

  /** Camera shake; none when the phone asks for reduced motion. */
  shake(amount = 6, time = 0.25): void {
    if (reducedMotion()) return;
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeT = Math.max(this.shakeT, time);
  }

  flash(color = '#fff', time = 0.18): void {
    this.flashColor = color;
    this.flashT = time;
    this.flashCalm = reducedMotion();
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y += (f.player === 0 ? -40 : 40) * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT === 0) this.shakeAmp = 0;
    this.flashT = Math.max(0, this.flashT - dt);
  }

  /** Apply camera shake; call before drawing the world (inside a save/restore). */
  applyShake(g: G): void {
    if (this.shakeT <= 0) return;
    const a = this.shakeAmp * (this.shakeT / 0.25);
    g.translate((Math.random() - 0.5) * a * 2, (Math.random() - 0.5) * a * 2);
  }

  render(g: G): void {
    // Every opacity here multiplies the one the caller left (a fading screen fades its
    // sparks and flash too), and the canvas gets that opacity back afterwards.
    const base = g.globalAlpha;
    for (const p of this.particles) {
      g.globalAlpha = base * Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = base;
    for (const f of this.floaters) {
      // F202: the same words popped for the other seat in the same step at the same x (a
      // popBoth()) make a pair: playing the bot, one copy shows. Two frogs missing at once
      // ("Miss!" at each frog) are two events and both stay.
      const pair = this.floaters.some((o) => o.player !== f.player && o.str === f.str && o.life === f.life && Math.abs(o.x - f.x) < 1);
      // Pops land where things happen, often by a wall: shrink a long one to fit and
      // keep its words on screen (Bigger text makes them wider).
      const size = fitSize(g, f.str, W - 16, f.size);
      text(g, f.str, insideX(g, f.str, f.x, size), f.y, { size, color: f.color, player: f.player, stroke: f.halo ?? popOutline(f.color), alpha: Math.min(1, f.life / f.max * 1.6), pair });
    }
    if (this.flashT > 0) {
      // A quarter as bright with reduce motion on: still says "something happened", without a strobe.
      g.globalAlpha = base * (this.flashT / 0.18) * 0.35 * (this.flashCalm ? 0.25 : 1);
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = base;
    }
  }
}
