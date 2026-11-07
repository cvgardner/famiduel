// Small canvas helpers. Everything is drawn in code with plain shapes, so the
// prototype has no art assets.
import { W, H } from './world';
import { contrastNeeded, labelContrast, parseColor } from '../core/contrast';

export type G = CanvasRenderingContext2D;

export const COLORS = {
  bg: '#14112b',
  panel: '#221d45',
  line: 'rgba(255,255,255,0.14)',
  text: '#ffffff',
  dim: 'rgba(255,255,255,0.6)',
  gold: '#ffd54a',
  // Teal, not green: green vs COLORS.bad collapses for red-green colour blindness (deutan).
  good: '#5eead4',
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
  /** Opacity, multiplied with the canvas's current globalAlpha (a caller's fade reaches the words). */
  alpha?: number;
};

/**
 * Smallest size (world units) for words and numbers drawn on the canvas. The world is
 * shrunk to fit the phone, by 0.89 on a 320 px wide one, so 13 units stays at or above
 * Apple's 11 pt minimum there (and is ~14 px on a 390 px phone). Single symbols (★, x,
 * eyes) are decoration and may be smaller. Unit test and playtest enforce it.
 */
export const MIN_TEXT = 13;

/**
 * "Bigger text" setting: canvas words are drawn this many times larger. Small print gains
 * most; big banners and scores (already easy to read) grow only up to BIG_TEXT_CAP, so a
 * headline never runs off the screen.
 */
let textScale = 1;
export const BIG_TEXT = 1.2;
export const BIG_TEXT_CAP = 28;
export function setTextScale(s: number): void {
  textScale = s;
}
export function getTextScale(): number {
  return textScale;
}
/** The size a label of `size` units is really drawn at under the current text scale. */
export function scaledSize(size: number): number {
  if (textScale === 1) return size;
  return Math.max(size, Math.min(size * textScale, BIG_TEXT_CAP));
}

/**
 * Edge probe, switched on by the playtest: readable labels whose words reach past the
 * world's left or right edge (by more than a unit), with the most they ran over.
 */
export const edgeProbe = { on: false, over: new Map<string, number>() };

/** Readable strings drawn below MIN_TEXT since the last clear (read by the playtest). */
export const smallText = new Map<string, number>();

/**
 * Contrast probe, switched on by the playtest. While on, each readable label is
 * checked against the pixels behind it (at most every 200 ms per label) and the
 * best contrast it ever had is kept: a pop fading in or out counts at its peak,
 * a label that is always faint shows up as faint. `rest` says the label was seen
 * fully faded in at least once; until then only mid-fade samples exist (a hole
 * card cut short by a pause), and the first at-rest sample replaces them.
 */
export const contrastProbe = {
  on: false,
  seen: new Map<string, { best: number; need: number; size: number; rest: boolean }>(),
  last: new Map<string, number>(),
};

function probeContrast(g: G, str: string, x: number, y: number, o: TextOpts): void {
  const now = performance.now();
  if (now - (contrastProbe.last.get(str) ?? -1e9) < 200) return;
  contrastProbe.last.set(str, now);
  const fill = parseColor(o.color ?? COLORS.text);
  if (!fill) return;
  const size = o.size ?? 20;
  const w = g.measureText(str).width;
  const x0 = g.textAlign === 'center' ? x - w / 2 : g.textAlign === 'right' || g.textAlign === 'end' ? x - w : x;
  const m = g.getTransform();
  const pts = [
    [x0, y - size / 2],
    [x0 + w, y - size / 2],
    [x0, y + size / 2],
    [x0 + w, y + size / 2],
  ].map(([px, py]) => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f]);
  const cw = g.canvas.width;
  const ch = g.canvas.height;
  const left = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0]))));
  const top = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))));
  const right = Math.min(cw, Math.ceil(Math.max(...pts.map((p) => p[0]))));
  const bottom = Math.min(ch, Math.ceil(Math.max(...pts.map((p) => p[1]))));
  if (right - left < 2 || bottom - top < 2) return;
  const px = g.getImageData(left, top, right - left, bottom - top).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += px[i + k];
  const n = px.length / 4;
  const bg = [sum[0] / n, sum[1] / n, sum[2] / n] as [number, number, number];
  // The opacity the words are really drawn at: the caller's fade times the label's own.
  const a = g.globalAlpha;
  const ratio = labelContrast(fill, bg, a, o.stroke ? parseColor(o.stroke) : null);
  const rest = a >= 0.99;
  if (keepSample(contrastProbe.seen.get(str), ratio, rest))
    contrastProbe.seen.set(str, { best: ratio, need: contrastNeeded(size, o.weight ?? 800), size, rest });
}

/**
 * Whether a new contrast sample replaces the kept one: the best at-rest sample
 * wins; mid-fade samples only count until the label is first seen fully shown.
 */
export function keepSample(prev: { best: number; rest: boolean } | undefined, ratio: number, rest: boolean): boolean {
  if (!prev) return true;
  if (rest !== prev.rest) return rest;
  return ratio > prev.best;
}

/** Words and numbers someone has to read: two or more letters or digits. */
export function readable(str: string): boolean {
  return (str.match(/[\p{L}\p{N}]/gu) ?? []).length >= 2;
}

/**
 * The largest size from `size` down to MIN_TEXT at which `str` fits `maxW` units, so a
 * long name in a pill shrinks a little instead of running past its edge.
 */
export function fitSize(g: G, str: string, maxW: number, size: number, weight = 800): number {
  let s = size;
  for (; s > MIN_TEXT; s--) {
    g.font = `${weight} ${scaledSize(s)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    if (g.measureText(str).width <= maxW) break;
  }
  return s;
}

/**
 * A centred label's x moved in just enough that its words (drawn at `size` under the
 * current text scale) stay `pad` units inside the screen's left and right edges.
 */
export function insideX(g: G, str: string, x: number, size: number, weight = 800, pad = 6): number {
  g.font = `${weight} ${scaledSize(size)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const half = g.measureText(str).width / 2 + pad;
  return half * 2 >= W ? W / 2 : Math.max(half, Math.min(W - half, x));
}

export function text(g: G, str: string, x: number, y: number, o: TextOpts = {}): void {
  const base = o.size ?? 20;
  if (base < MIN_TEXT && readable(str)) smallText.set(str, base);
  const size = scaledSize(base);
  facing(g, o.player ?? 0, x, y, () => {
    g.globalAlpha *= o.alpha ?? 1;
    g.font = `${o.weight ?? 800} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    g.textAlign = o.align ?? 'center';
    g.textBaseline = 'middle';
    if (contrastProbe.on && readable(str)) probeContrast(g, str, x, y, { ...o, size });
    if (edgeProbe.on && readable(str)) probeEdge(g, str, x, o.player ?? 0);
    if (o.stroke) {
      g.lineWidth = Math.max(3, size / 6);
      g.strokeStyle = o.stroke;
      g.lineJoin = 'round';
      g.strokeText(str, x, y);
    }
    g.fillStyle = o.color ?? COLORS.text;
    g.fillText(str, x, y);
  });
}

/** World x-range of a label's words: the top player's are turned 180° about (x, y). */
export function textSpan(x: number, w: number, align: CanvasTextAlign, player: 0 | 1): [number, number] {
  const x0 = align === 'center' ? x - w / 2 : align === 'right' || align === 'end' ? x - w : x;
  return player === 1 ? [2 * x - (x0 + w), 2 * x - x0] : [x0, x0 + w];
}

function probeEdge(g: G, str: string, x: number, player: 0 | 1): void {
  const [l, r] = textSpan(x, g.measureText(str).width, g.textAlign, player);
  const over = Math.max(-l, r - W);
  if (over > 1) edgeProbe.over.set(str, Math.max(over, edgeProbe.over.get(str) ?? 0));
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

/**
 * A seat cue that doesn't rely on colour: a ring round a piece, solid for player 0 (the
 * bottom seat) and dashed for player 1 (the top seat), white over a dark under-stroke so it
 * reads on any colour and in greyscale. For games where both players' pieces roam the same
 * space (Sumo, Snake Duel, Tank Duel), so two colour-blind kids can still tell whose is whose.
 */
export function seatRing(g: G, p: 0 | 1, x: number, y: number, r: number, a = 1): void {
  g.save();
  g.globalAlpha *= a;
  if (p === 1) g.setLineDash(SEAT_DASH);
  circle(g, x, y, r, undefined, 'rgba(20,17,43,0.7)', 4);
  circle(g, x, y, r, undefined, '#ffffff', 2);
  g.restore();
}
/** Dash pattern of player 1's seat ring (player 0's is solid). */
export const SEAT_DASH = [5, 4];

/** Height of a seat-colour edge at the top and bottom of the world. */
export const SEAT_EDGE = 3;

/**
 * A thin edge in each player's colour along the world's top and bottom rows.
 * On tall phones the stage stretches the outermost row into the letterbox bar,
 * so each end of the phone glows in its player's colour instead of reading as
 * a black band (the playtest's `barPeak` check). `bottom` and `top` are the
 * colours for the world's bottom and top edge as drawn (after any rotation).
 */
export function seatEdges(gx: G, bottom: string, top: string): void {
  gx.fillStyle = shade(bottom, -0.15);
  gx.fillRect(0, H - SEAT_EDGE, W, SEAT_EDGE);
  gx.fillStyle = shade(top, -0.15);
  gx.fillRect(0, 0, W, SEAT_EDGE);
}
