// Today's course: the same 3 holes on every phone on a given day, picked by a seed made
// from the local date. Kept apart from the view so tests and the app agree on the holes.
import { hashSeed, makeRng } from '../../core/rng';
import { HOLES, RULES } from './logic';

/** The local calendar day as YYYY-MM-DD (the course changes at the player's midnight). */
export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The day's holes (ids), easier first like a normal match. */
export function dailyHoleIds(key: string): string[] {
  const rng = makeRng(hashSeed(`daily-golf:${key}`));
  const pool = HOLES.map((_, i) => i);
  const picked: number[] = [];
  for (let i = 0; i < RULES.holesPerMatch; i++) picked.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return picked.sort((a, b) => a - b).map((i) => HOLES[i].id);
}
