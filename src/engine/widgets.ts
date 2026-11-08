// In-canvas buttons that belong to one player's half.
import { alpha, BOT_CONTROLS_ALPHA, circle, COLORS, glow, noGlow, text, type G } from './draw';
import { H, W } from './world';
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
      // A tap that lands and lifts within one frame still counts as one press.
      if (f && (f.down || f.pressed)) down = true;
      if (!f || !f.down) this.finger = null;
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
    const base = g.globalAlpha;
    g.globalAlpha = base * (opts.disabled ? 0.35 : 1);
    circle(g, this.x, this.y + 4, r, 'rgba(0,0,0,0.35)');
    circle(g, this.x, this.y, r, fill, 'rgba(255,255,255,0.5)', 2);
    const label = opts.icon ?? this.label;
    if (label) text(g, label, this.x, this.y, { size: Math.round(r * (opts.icon ? 0.9 : 0.55)), player: this.owner, color: '#fff', stroke: 'rgba(0,0,0,0.35)' });
    g.globalAlpha = base;
  }
}

/**
 * The super power button: a ring that fills with energy, and a tap to fire
 * when full. Returns true from update() on the frame the player fires.
 */
/** Width of the owner-colour band round every power button. */
export const POWER_BAND = 2.5;

/**
 * Where a corner power button goes. `x` and `inset` are laid out for a right-hander in seat
 * 0's frame (inset = distance from that player's own edge); seat 1's button is the same spot
 * turned 180°. A right-hander steers with the right hand and presses powers with the left, so
 * the button sits in their left corner; a left-handed player's moves to the mirrored corner.
 */
export function powerSpot(p: 0 | 1, x: number, inset: number, lefty: boolean): [number, number] {
  const lx = lefty ? W - x : x;
  return p === 0 ? [lx, H - inset] : [W - lx, inset];
}

/** Drawn radius of a power button, and with Settings > Little hands on. */
export const POWER_R = 22;
export const POWER_R_BIG = 26;
/** Touch radius (drawn radius + slop) stays the same either way: a 57 CSS px target at 320 px. */
const POWER_HIT = 32;
let bigHands = false;
/** Settings > Little hands: power buttons made after this are drawn bigger. */
export function setBigHands(on: boolean): void {
  bigHands = on;
}
/** True while Settings > Little hands is on (other in-game controls grow with it too). */
export function bigHandsOn(): boolean {
  return bigHands;
}

export class PowerButton {
  readonly button: Button;

  constructor(
    x: number,
    y: number,
    public readonly owner: 0 | 1,
    public readonly power: PowerDef,
    private readonly color: string,
    /** F170/F171: a bot's button facing the one person: its face is drawn faint (nobody presses it). */
    private readonly faint = false,
  ) {
    // Grows only as far as the screen edge allows (backing and band included), never below normal.
    const room = Math.min(x, W - x, y, H - y) - 6;
    const r = bigHands ? Math.max(POWER_R, Math.min(POWER_R_BIG, room)) : POWER_R;
    this.button = new Button(x, y, r, owner, '', color, POWER_HIT - r);
  }

  update(input: Input, energy: Energy, key?: string): boolean {
    this.button.update(input, key);
    return this.button.pressed && energy.ready;
  }

  render(g: G, energy: Energy, t: number): void {
    const { x, y, r } = this.button;
    const ready = energy.ready;
    const active = energy.active > 0;
    // A thin band of the owner's colour round the dark backing, so a button reads as "mine"
    // even while its meter is empty (two buttons on one phone, kids side by side).
    // F171: a bot's button (playing the bot) draws its band and face faint, like its other
    // buttons (F170); the energy ring and the power's icon stay clear, they tell the person
    // what the bot holds and when it can fire.
    const a0 = g.globalAlpha;
    const face = this.faint ? a0 * BOT_CONTROLS_ALPHA : a0;
    g.globalAlpha = face;
    circle(g, x, y, r + 6, 'rgba(0,0,0,0.45)', alpha(this.color, 0.9), POWER_BAND);
    g.globalAlpha = a0;
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
    g.globalAlpha = face;
    if (ready) glow(g, COLORS.gold, 12 + 6 * Math.sin(t * 8));
    circle(g, x, y, r - 2, ready ? alpha(this.color, 0.95) : active ? COLORS.gold : 'rgba(255,255,255,0.08)');
    noGlow(g);
    g.globalAlpha = a0;
    text(g, this.power.icon, x, y + 1, { size: Math.round((20 * r) / POWER_R), player: this.owner, alpha: ready || active ? 1 : 0.5 });
  }
}
