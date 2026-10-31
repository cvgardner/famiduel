// Player colours that stay apart for colour-blind eyes.
//
// About 1 in 12 boys sees colour differently, so two players' colours must not
// rely on red vs green (or blue vs purple, or green vs teal). Each colour is run
// through the Machado et al. (2009) simulation of the three full colour-vision
// deficiencies (protan, deutan, tritan) and compared in OKLab, a space where equal
// distances look about equally different. Every pair of player colours, and each
// player colour against the gold used for "ready" highlights, must stay at least
// LOOK_ALIKE apart for every kind of vision. Pure: no DOM.

export const PLAYER_COLORS = [
  { hex: '#3fa9ff', name: 'Blue' },
  { hex: '#ff5c7a', name: 'Pink' },
  { hex: '#15e5b4', name: 'Mint' },
  { hex: '#ea9602', name: 'Orange' },
  { hex: '#7a5cff', name: 'Purple' },
] as const;

/** The gold the games use for "ready" and "your turn" highlights. */
export const HIGHLIGHT_GOLD = '#ffd54a';

/** OKLab distance under which two colours count as look-alikes. */
export const LOOK_ALIKE = 0.1;

export type Vision = 'typical' | 'protan' | 'deutan' | 'tritan';
export const VISIONS: readonly Vision[] = ['typical', 'protan', 'deutan', 'tritan'];

type M3 = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];
// Machado, Oliveira & Fernandes 2009, severity 1.0, applied to linear RGB.
const SIM: Record<Vision, M3> = {
  typical: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

type V3 = [number, number, number];

function linear(hex: string): V3 {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [ch(1), ch(3), ch(5)];
}

function oklab([r, g, b]: V3): V3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** How a colour looks (in OKLab) to someone with the given kind of vision. */
export function seenAs(hex: string, vision: Vision): V3 {
  const c = linear(hex);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const m = SIM[vision];
  return oklab(m.map((row) => clamp(row[0] * c[0] + row[1] * c[1] + row[2] * c[2])) as V3);
}

/** Distance between two colours as seen with the given kind of vision. */
export function colorDistance(a: string, b: string, vision: Vision): number {
  const p = seenAs(a, vision);
  const q = seenAs(b, vision);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The kinds of vision for which a and b look alike (empty when they are safe). */
export function lookAlikeFor(a: string, b: string): Vision[] {
  return VISIONS.filter((v) => colorDistance(a, b, v) < LOOK_ALIKE);
}

export function colorName(hex: string): string {
  return PLAYER_COLORS.find((c) => c.hex === hex)?.name ?? 'Custom';
}

// Colours from before this palette, mapped to their nearest new colour.
const OLD: Record<string, string> = {
  '#4ade80': '#15e5b4', // green -> mint
  '#ffb020': '#ea9602', // orange
  '#b06cff': '#7a5cff', // purple
  '#26d0ce': '#15e5b4', // teal -> mint
};

/**
 * Make a saved pair of colours safe: unknown or old colours move to the palette,
 * and if both players end up with look-alike colours the top player moves to the
 * first palette colour that stays apart from the bottom player's.
 */
export function safePair(a: string, b: string): [string, string] {
  const fix = (c: string, fallback: string) =>
    PLAYER_COLORS.some((p) => p.hex === c) ? c : OLD[c.toLowerCase()] ?? fallback;
  const c0 = fix(a, PLAYER_COLORS[0].hex);
  let c1 = fix(b, PLAYER_COLORS[1].hex);
  if (lookAlikeFor(c0, c1).length) c1 = PLAYER_COLORS.find((p) => !lookAlikeFor(c0, p.hex).length)!.hex;
  return [c0, c1];
}
