// Every game draws in a fixed portrait world of W × H units. The phone lies
// flat between the players: player 0 sits at the bottom edge, player 1 at the
// top edge and sees everything upside down, so their text is rotated 180°.
export const W = 360;
export const H = 640;
export const MID = H / 2;

/** Which player owns a point, by the half of the screen it is in. */
export const ownerOf = (y: number): 0 | 1 => (y >= MID ? 0 : 1);

export type Vec = { x: number; y: number };
export const vec = (x = 0, y = 0): Vec => ({ x, y });
export const len = (x: number, y: number) => Math.hypot(x, y);
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
