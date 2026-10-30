// Small canvas helpers. Everything is drawn in code with plain shapes, so the
// prototype has no art assets.
import { W, H } from './world';

export type G = CanvasRenderingContext2D;

export const COLORS = {
  bg: '#14112b',
  panel: '#221d45',
  line: 'rgba(255,255,255,0.14)',
  text: '#ffffff',
  dim: 'rgba(255,255,255,0.6)',
  gold: '#ffd54a',
  good: '#4ade80',
  bad: '#ff5c7a',
};

/** Run fn with the canvas rotated 180° around (x, y) when drawing for player 1. */
export function facing(g: G, player: 0 | 1, x: number, y: number, fn: () => void): void {
  g.save();
  g.translate(x, y);
  if (player === 1) g.rotate(Math.PI);
  g.translate(-x, -y);
  fn();
  g.restore();
}

export type TextOpts = {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  weight?: number;
  /** Rotate for the top player. */
  player?: 0 | 1;
  stroke?: string;
  alpha?: number;
};

export function text(g: G, str: string, x: number, y: number, o: TextOpts = {}): void {
  facing(g, o.player ?? 0, x, y, () => {
    g.globalAlpha = o.alpha ?? 1;
    g.font = `${o.weight ?? 800} ${o.size ?? 20}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    g.textAlign = o.align ?? 'center';
    g.textBaseline = 'middle';
    if (o.stroke) {
      g.lineWidth = Math.max(3, (o.size ?? 20) / 6);
      g.strokeStyle = o.stroke;
      g.lineJoin = 'round';
      g.strokeText(str, x, y);
    }
    g.fillStyle = o.color ?? COLORS.text;
    g.fillText(str, x, y);
  });
}

export function circle(g: G, x: number, y: number, r: number, fill?: string, stroke?: string, lineWidth = 2): void {
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lineWidth;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

export function rrect(g: G, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string, lineWidth = 2): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lineWidth;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

export function line(g: G, x1: number, y1: number, x2: number, y2: number, color: string, width = 2): void {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.stroke();
}

/** Soft glow behind a shape: call before drawing it, and clear with noGlow. */
export function glow(g: G, color: string, blur = 16): void {
  g.shadowColor = color;
  g.shadowBlur = blur;
}

export function noGlow(g: G): void {
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
}

/** Background used by most games: dark field with a faint centre line. */
export function field(g: G, tint = COLORS.bg): void {
  g.fillStyle = tint;
  g.fillRect(0, 0, W, H);
}

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  const r = f((n >> 16) & 255);
  const gg = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${gg},${b})`;
}

export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
