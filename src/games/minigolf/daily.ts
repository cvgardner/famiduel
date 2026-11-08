// Today's course: the same 3 holes on every phone on a given day, picked by a seed made
// from the local date. Kept apart from the view so tests and the app agree on the holes.
import { hashSeed, makeRng } from '../../core/rng';
import { HOLES, RULES } from './logic';

/** The local calendar day as YYYY-MM-DD (the course changes at the player's midnight). */
export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A long hole: par 4 or more (an easy bot takes 4.3-5.3 strokes on these). */
export const isLongHole = (i: number): boolean => HOLES[i].par >= 4;

/**
 * The day's holes (ids), easier first like a normal match. At most one long hole a day
 * (F99): without the cap about 1 day in 10 stacked two or three of them, a long slog for
 * a small kid. A second long hole drawn is put aside and drawn again, so days with one
 * or none keep the holes they always had.
 */
export function dailyHoleIds(key: string): string[] {
  const rng = makeRng(hashSeed(`daily-golf:${key}`));
  const pool = HOLES.map((_, i) => i);
  const picked: number[] = [];
  while (picked.length < RULES.holesPerMatch && pool.length) {
    const i = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    if (isLongHole(i) && picked.some(isLongHole)) continue;
    picked.push(i);
  }
  return picked.sort((a, b) => a - b).map((i) => HOLES[i].id);
}
