// Weekly super power rotation (Chris, 15 Nov 2026: "weekly rotations with seasonal sets in
// the future or as promotionals"). Each game keeps a bigger pool of powers in
// content/powers.json; every week the phone offers 3 of them, picked from the local date
// alone (no server, no account), so every phone shows the same 3 all week. The week turns
// over at the player's own Monday midnight.
//
// Later, a dated set in `sets` (a season, a holiday, a promo) can pin powers into a game's
// offer for its dates, its own new powers or ones from the pool. None are live yet.
import type { PowerDef } from './types';
import { hashSeed, makeRng } from './rng';

/** A dated set of powers: from its first day up to (not including) `to`, local dates YYYY-MM-DD. */
export type PowerSet = {
  id: string;
  name: string;
  from: string;
  to: string;
  /** Per game: powers only this set brings (each still needs its code in the game), and the ids it pins into the offer. */
  games: Record<string, { powers?: PowerDef[]; offer: string[] }>;
};

export type PowerTable = {
  rotation: { perWeek: number };
  games: Record<string, PowerDef[]>;
  sets: PowerSet[];
};

const DAY = 86_400_000;

/** Days since 1 Jan 1970 for the local calendar date (DST-proof: built from the date's parts). */
const localDays = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);

/** The week number for a local date: weeks start on Monday (1970-01-05 was a Monday). */
export function weekIndex(d: Date = new Date()): number {
  return Math.floor((localDays(d) - 4) / 7);
}

/** The Monday a week starts on, as YYYY-MM-DD. */
export function weekStart(week: number): string {
  return new Date((week * 7 + 4) * DAY).toISOString().slice(0, 10);
}

/** A local date as YYYY-MM-DD. */
const dateKey = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Every way to choose k of n (indexes, ascending). */
function combos(n: number, k: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, cur: number[]) => {
    if (cur.length === k) return void out.push(cur);
    for (let i = start; i < n; i++) pick(i + 1, [...cur, i]);
  };
  pick(0, []);
  return out;
}

const cycles = new Map<string, number[][]>();

/**
 * A game's fixed order of weekly offers: every combination of `k` pool powers once, in an
 * order seeded by the game's id. Each next week keeps as few of last week's powers as it
 * can (with 5 in the pool and 3 a week, two powers change most weeks), so the pick feels new.
 */
export function cycleOf(game: string, n: number, k: number): number[][] {
  const key = `${game}:${n}:${k}`;
  const known = cycles.get(key);
  if (known) return known;
  const rng = makeRng(hashSeed(`powers:${key}`));
  const left = combos(n, k);
  for (let i = left.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [left[i], left[j]] = [left[j], left[i]];
  }
  const order = [left.shift()!];
  while (left.length) {
    const prev = order[order.length - 1];
    const shared = (c: number[]) => c.filter((x) => prev.includes(x)).length;
    let best = 0;
    for (let i = 1; i < left.length; i++) if (shared(left[i]) < shared(left[best])) best = i;
    order.push(left.splice(best, 1)[0]);
  }
  cycles.set(key, order);
  return order;
}

/** The sets whose dates cover this day. */
export function liveSets(table: PowerTable, d: Date): PowerSet[] {
  const day = dateKey(d);
  return table.sets.filter((s) => s.from <= day && day < s.to);
}

/**
 * The powers a game offers on a given day: the week's rotation, with any live set's
 * powers pinned in first. Games without powers get none.
 */
export function weeklyPowers(table: PowerTable, game: string, d: Date = new Date()): PowerDef[] {
  const pool = table.games[game] ?? [];
  const k = Math.min(table.rotation.perWeek, pool.length);
  if (!k) return [];
  const pinned: PowerDef[] = [];
  for (const set of liveSets(table, d)) {
    const g = set.games[game];
    if (!g) continue;
    for (const id of g.offer) {
      const def = g.powers?.find((p) => p.id === id) ?? pool.find((p) => p.id === id);
      if (def && !pinned.some((p) => p.id === id) && pinned.length < k) pinned.push(def);
    }
  }
  const cycle = cycleOf(game, pool.length, k);
  const week = cycle[((weekIndex(d) % cycle.length) + cycle.length) % cycle.length].map((i) => pool[i]);
  // Pool order, so a game's cards sit in the same order every week they show.
  const rest = pool.filter((p) => week.includes(p) && !pinned.some((q) => q.id === p.id));
  // A pinned power took a slot: fill from the rest of the pool if the week's pick ran short.
  for (const p of pool) if (pinned.length + rest.length < k && !rest.includes(p) && !pinned.some((q) => q.id === p.id) && !week.includes(p)) rest.push(p);
  return [...pinned, ...rest].slice(0, k);
}
