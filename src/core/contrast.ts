// WCAG 2.x contrast maths for text drawn on the canvas. Pure, no DOM.

export type RGBA = [number, number, number, number];

/** Parse '#rgb', '#rrggbb', 'rgb(r,g,b)' or 'rgba(r,g,b,a)'. Null for anything else. */
export function parseColor(css: string): RGBA | null {
  const s = css.trim().toLowerCase();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3) return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16)).concat(1) as RGBA;
    if (h.length === 6) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as RGBA;
    return null;
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return null;
  const p = m[1].split(',').map((v) => parseFloat(v));
  if (p.length < 3 || p.some((v) => Number.isNaN(v))) return null;
  return [p[0], p[1], p[2], p[3] ?? 1];
}

/** fg (with its alpha times `a`) painted over an opaque bg. */
export function over(fg: RGBA, bg: readonly [number, number, number], a = 1): [number, number, number] {
  const k = Math.max(0, Math.min(1, fg[3] * a));
  return [0, 1, 2].map((i) => fg[i] * k + bg[i] * (1 - k)) as [number, number, number];
}

export function luminance(c: readonly [number, number, number]): number {
  const ch = c.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The contrast a label needs (WCAG 1.4.3): 3:1 for large text (bold from 18.66 px,
 * any weight from 24 px), 4.5:1 for the rest. Sizes are world units, which is
 * about a CSS px on a 360-390 px wide phone.
 */
export function contrastNeeded(size: number, weight: number): number {
  return size >= 24 || (weight >= 700 && size >= 18.66) ? 3 : 4.5;
}

/**
 * How readable a label is: fill against the background, or against its own
 * outline when it has one (an outline drawn round the letters is what the eye
 * reads it against), whichever is better.
 */
export function labelContrast(fill: RGBA, bg: readonly [number, number, number], a = 1, stroke?: RGBA | null): number {
  const behind = stroke ? over(stroke, bg, a) : bg;
  const shown = over(fill, behind, a);
  const plain = contrastRatio(over(fill, bg, a), bg);
  return stroke ? Math.max(plain, contrastRatio(shown, behind)) : plain;
}

/** Dark ink used for words on light player colours. */
export const DARK_INK = '#1b1430';

/** White or dark ink, whichever reads better on a solid `hex` fill (player colour pills). */
export function inkOn(hex: string): string {
  const c = parseColor(hex);
  if (!c) return '#ffffff';
  const bg: [number, number, number] = [c[0], c[1], c[2]];
  return contrastRatio([255, 255, 255], bg) >= contrastRatio([0x1b, 0x14, 0x30], bg) ? '#ffffff' : DARK_INK;
}
