// Juice: particles, pop-up text, screen shake and flashes. Purely visual, so
// it uses Math.random and never affects a game's result.
import { text, type G } from './draw';
import { W, H } from './world';

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Floater = { str: string; x: number; y: number; life: number; max: number; color: string; size: number; player: 0 | 1 };

/**
 * Outline round pop-up words. Pops land on anything (dark floors, sand, grass),
 * so the outline is what they are read against: 75% black keeps even orange and
 * pink pops at 4.5:1 on Sumo's pale sand (at 50% "Last rope save!" was 2.4:1).
 */
export const POP_OUTLINE = 'rgba(0,0,0,0.75)';

export class Fx {
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private shakeT = 0;
  private shakeAmp = 0;
  private flashT = 0;
  private flashColor = '#fff';

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

  shake(amount = 6, time = 0.25): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeT = Math.max(this.shakeT, time);
  }

  flash(color = '#fff', time = 0.18): void {
    this.flashColor = color;
    this.flashT = time;
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
      text(g, f.str, f.x, f.y, { size: f.size, color: f.color, player: f.player, stroke: POP_OUTLINE, alpha: Math.min(1, f.life / f.max * 1.6) });
    }
    if (this.flashT > 0) {
      g.globalAlpha = (this.flashT / 0.18) * 0.35;
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  }
}
