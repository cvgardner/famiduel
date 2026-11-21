import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import games from '../content/games.json';
import { cycleOf, liveSets, weekIndex, weekStart, weeklyPowers, type PowerTable } from '../src/core/rotation';
import type { PowerDef } from '../src/core/types';

const TABLE = powers as unknown as PowerTable;
const shown = games.games.filter((g) => !(g as { hidden?: boolean }).hidden).map((g) => g.id);
const withPowers = shown.filter((g) => (TABLE.games[g] ?? []).length);
const ids = (list: PowerDef[]) => list.map((p) => p.id);
const def = (id: string): PowerDef => ({ id, name: id, icon: '⚡', desc: id });

describe('weekly power rotation', () => {
  it('weeks start on Monday at local midnight', () => {
    // Sun 15 Nov 2026 and Mon 16 Nov 2026 sit in different weeks; Mon to Sun share one.
    const sun = new Date(2026, 10, 15, 23, 59);
    const mon = new Date(2026, 10, 16, 0, 0);
    expect(weekIndex(mon)).toBe(weekIndex(sun) + 1);
    expect(weekIndex(new Date(2026, 10, 22, 23, 59))).toBe(weekIndex(mon));
    expect(weekStart(weekIndex(mon))).toBe('2026-11-16');
    expect(weekStart(weekIndex(new Date(2026, 10, 18, 12)))).toBe('2026-11-16');
    // Across the March clock change the week still turns on the Monday.
    expect(weekIndex(new Date(2027, 2, 15, 0, 30))).toBe(weekIndex(new Date(2027, 2, 14, 23, 30)) + 1);
  });

  it('every day of a week offers the same 3 powers, and the same on every phone', () => {
    for (const g of withPowers) {
      const monday = ids(weeklyPowers(TABLE, g, new Date(2026, 10, 16, 0, 1)));
      expect(monday, g).toHaveLength(3);
      for (let day = 17; day <= 22; day++) expect(ids(weeklyPowers(TABLE, g, new Date(2026, 10, day, 20))), `${g} on the ${day}th`).toEqual(monday);
    }
  });

  it('offers come from the pool, in pool order, three different powers', () => {
    for (const g of withPowers) {
      const pool = ids(TABLE.games[g]);
      for (let w = 0; w < 30; w++) {
        const got = ids(weeklyPowers(TABLE, g, new Date(2026, 10, 16 + w * 7)));
        expect(new Set(got).size, g).toBe(got.length);
        expect(got.every((id) => pool.includes(id)), g).toBe(true);
        expect([...got].sort((a, b) => pool.indexOf(a) - pool.indexOf(b)), `${g} keeps pool order`).toEqual(got);
      }
    }
  });

  it('each week changes the offer, and every power in a pool comes round', () => {
    for (const g of withPowers) {
      const n = TABLE.games[g].length;
      const cycle = cycleOf(g, n, Math.min(3, n));
      const seen = new Set<string>();
      let last: string[] | null = null;
      for (let w = 0; w < cycle.length; w++) {
        const got = ids(weeklyPowers(TABLE, g, new Date(2026, 10, 16 + w * 7)));
        if (last && n > 3) expect(got, `${g} week ${w} repeats last week`).not.toEqual(last);
        got.forEach((id) => seen.add(id));
        last = got;
      }
      expect(seen.size, g).toBe(n);
    }
  });

  it('a pool of 5 changes two powers most weeks, and never all three in a row of the same', () => {
    const cycle = cycleOf('demo', 5, 3);
    expect(cycle).toHaveLength(10);
    let twoChanged = 0;
    for (let i = 1; i < cycle.length; i++) {
      const kept = cycle[i].filter((x) => cycle[i - 1].includes(x)).length;
      expect(kept).toBeLessThan(3);
      if (kept === 1) twoChanged++;
    }
    expect(twoChanged).toBeGreaterThanOrEqual(6);
    // The same order every time (it is the same on every phone).
    expect(cycleOf('demo', 5, 3)).toEqual(cycle);
  });

  it('games without powers offer none', () => {
    for (const g of ['checkers', 'tictactoe', 'rps', 'nope']) expect(weeklyPowers(TABLE, g)).toEqual([]);
  });

  it('a dated set pins its powers in for its dates only, and the week fills the rest', () => {
    const table: PowerTable = {
      rotation: { perWeek: 3 },
      games: { snake: ['a', 'b', 'c', 'd', 'e'].map(def) },
      sets: [{ id: 'winter', name: 'Winter', from: '2026-12-21', to: '2027-01-04', games: { snake: { powers: [def('snowball')], offer: ['snowball', 'd'] } } }],
    };
    const before = new Date(2026, 11, 20, 12);
    const during = new Date(2026, 11, 24, 12);
    const after = new Date(2027, 0, 4, 0, 1);
    expect(liveSets(table, before)).toEqual([]);
    expect(liveSets(table, during).map((s) => s.id)).toEqual(['winter']);
    expect(liveSets(table, after)).toEqual([]);
    const got = ids(weeklyPowers(table, 'snake', during));
    expect(got.slice(0, 2)).toEqual(['snowball', 'd']);
    expect(got).toHaveLength(3);
    expect(new Set(got).size).toBe(3);
    // Outside its dates the normal week shows, and other games are untouched.
    expect(ids(weeklyPowers(table, 'snake', after))).not.toContain('snowball');
    expect(weeklyPowers(table, 'sumo', during)).toEqual([]);
  });

  it('the live table has no sets yet, and any it gets point at real powers', () => {
    for (const set of TABLE.sets) {
      expect(set.from < set.to, set.id).toBe(true);
      for (const [g, entry] of Object.entries(set.games)) {
        for (const id of entry.offer) expect(!!entry.powers?.some((p) => p.id === id) || TABLE.games[g]?.some((p) => p.id === id), `${set.id}/${g}/${id}`).toBe(true);
      }
    }
  });
});
