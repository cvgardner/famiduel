// In-canvas buttons that belong to one player's half.
import { alpha, circle, COLORS, glow, noGlow, text, type G } from './draw';
import type { Energy } from '../core/energy';
import type { PowerDef } from '../core/types';
import type { Input } from './input';

/** A round button. Tracks press / hold / release from that player's fingers. */
export class Button {
  held = false;
  pressed = false;
  released = false;
  private finger: number | null = null;

  constructor(
    public x: number,
    public y: number,
    public r: number,
    public readonly owner: 0 | 1,
    public label = '',
    public color = '#ffffff',
    /** Extra touch slop around the drawn circle. */
    public slop = 14,
  ) {}

  hit(px: number, py: number): boolean {
    return Math.hypot(px - this.x, py - this.y) <= this.r + this.slop;
  }

  /** Feed one frame of input. key (optional) also drives the button. */
  update(input: Input, key?: string): void {
    this.pressed = false;
    this.released = false;
    const wasHeld = this.held;
    if (this.finger === null) {
      const f = input.of(this.owner).find((p) => p.pressed && this.hit(p.x, p.y));
      if (f) this.finger = f.id;
    }
    let down = false;
    if (this.finger !== null) {
      const f = input.pointers.get(this.finger);
      if (f && f.down) down = true;
      else this.finger = null;
    }
    if (key && input.key(key)) down = true;
    this.held = down;
    if (down && !wasHeld) this.pressed = true;
    if (!down && wasHeld) this.released = true;
  }

  /** Set state directly (bots). */
  set(down: boolean): void {
    this.pressed = down && !this.held;
    this.released = !down && this.held;
    this.held = down;
  }

  render(g: G, opts: { icon?: string; fill?: string; disabled?: boolean } = {}): void {
    const r = this.held ? this.r * 0.92 : this.r;
    const fill = opts.fill ?? this.color;
    g.globalAlpha = opts.disabled ? 0.35 : 1;
    circle(g, this.x, this.y + 4, r, 'rgba(0,0,0,0.35)');
    circle(g, this.x, this.y, r, fill, 'rgba(255,255,255,0.5)', 2);
    const label = opts.icon ?? this.label;
    if (label) text(g, label, this.x, this.y, { size: Math.round(r * (opts.icon ? 0.9 : 0.55)), player: this.owner, color: '#fff', stroke: 'rgba(0,0,0,0.35)' });
    g.globalAlpha = 1;
  }
}

/**
 * The super power button: a ring that fills with energy, and a tap to fire
 * when full. Returns true from update() on the frame the player fires.
 */
export class PowerButton {
  readonly button: Button;

  constructor(
    x: number,
    y: number,
    public readonly owner: 0 | 1,
    public readonly power: PowerDef,
    private readonly color: string,
  ) {
    this.button = new Button(x, y, 22, owner, '', color, 10);
  }

  update(input: Input, energy: Energy, key?: string): boolean {
    this.button.update(input, key);
    return this.button.pressed && energy.ready;
  }

  render(g: G, energy: Energy, t: number): void {
    const { x, y, r } = this.button;
    const ready = energy.ready;
    const active = energy.active > 0;
    circle(g, x, y, r + 6, 'rgba(0,0,0,0.45)');
    // energy ring
    g.beginPath();
    g.lineCap = 'round';
    g.lineWidth = 5;
    g.strokeStyle = alpha('#ffffff', 0.15);
    g.arc(x, y, r + 3, 0, Math.PI * 2);
    g.stroke();
    if (energy.value > 0) {
      g.beginPath();
      const start = this.owner === 0 ? -Math.PI / 2 : Math.PI / 2;
      g.arc(x, y, r + 3, start, start + Math.PI * 2 * energy.value);
      g.strokeStyle = ready ? COLORS.gold : this.color;
      g.stroke();
    }
    if (ready) glow(g, COLORS.gold, 12 + 6 * Math.sin(t * 8));
    circle(g, x, y, r - 2, ready ? alpha(this.color, 0.95) : active ? COLORS.gold : 'rgba(255,255,255,0.08)');
    noGlow(g);
    g.globalAlpha = ready || active ? 1 : 0.5;
    text(g, this.power.icon, x, y + 1, { size: 20, player: this.owner });
    g.globalAlpha = 1;
  }
}
