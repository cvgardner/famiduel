// Juice: particles, pop-up text, screen shake and flashes. Purely visual, so
// it uses Math.random and never affects a game's result.

import { reducedMotion } from './calm';
import { contrastRatio, over, parseColor } from '../core/contrast';
import { COLORS, fitSize, insideX, text, type G } from './draw';
import { W, H } from './world';

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Floater = { str: string; x: number; y: number; life: number; max: number; color: string; size: number; player: 0 | 1 };

/**
 * Outline round pop-up words. Pops land on anything (dark floors, sand, grass),
 * so the outline is what they are read against: 75% black keeps even orange and
 * pink pops at 4.5:1 on Sumo's pale sand (at 50% "Last rope save!" was 2.4:1).
 */
export const POP_OUTLINE = 'rgba(0,0,0,0.75)';

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

  /** Text that rises and fades, readable by the given player. */
  pop(str: string, x: number, y: number, color = '#fff', player: 0 | 1 = 0, size = 22): void {
    this.floaters.push({ str, x, y, life: 0.9, max: 0.9, color, size, player });
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
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    for (const f of this.floaters) {
      // Pops land where things happen, often by a wall: shrink a long one to fit and
      // keep its words on screen (Bigger text makes them wider).
      const size = fitSize(g, f.str, W - 16, f.size);
      text(g, f.str, insideX(g, f.str, f.x, size), f.y, { size, color: f.color, player: f.player, stroke: POP_OUTLINE, alpha: Math.min(1, f.life / f.max * 1.6) });
    }
    if (this.flashT > 0) {
      // A quarter as bright with reduce motion on: still says "something happened", without a strobe.
      g.globalAlpha = (this.flashT / 0.18) * 0.35 * (this.flashCalm ? 0.25 : 1);
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  }
}
