import { describe, expect, it } from 'vitest';
import { Store } from '../src/app/store';
import { makeRng } from '../src/core/rng';
import { dailyHoleIds, dayKey, isLongHole } from '../src/games/minigolf/daily';
import { HOLES, Minigolf, MinigolfBot, RULES } from '../src/games/minigolf/logic';
import { DT, player } from './helpers';

// Minigolf's today's course (F94): the same 3 holes on every phone on a day, a new set the
// next day, and the day's best total kept on this phone (people only).
describe("minigolf: today's course", () => {
  it('a day key is the local date', () => {
    expect(dayKey(new Date(2026, 10, 7, 23, 59))).toBe('2026-11-07');
    expect(dayKey(new Date(2026, 0, 3, 0, 1))).toBe('2026-01-03');
  });
  it('the same day gives the same holes; 3 different real holes, easier first', () => {
    const ids = dailyHoleIds('2026-11-07');
    expect(dailyHoleIds('2026-11-07')).toEqual(ids);
    expect(ids).toHaveLength(RULES.holesPerMatch);
    expect(new Set(ids).size).toBe(ids.length);
    const idx = ids.map((id) => HOLES.findIndex((h) => h.id === id));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
  it('the next day differs, and a month of days uses many holes', () => {
    expect(dailyHoleIds('2026-11-08')).not.toEqual(dailyHoleIds('2026-11-07'));
    const seen = new Set<string>();
    let repeats = 0;
    let prev = '';
    for (let d = 1; d <= 30; d++) {
      const ids = dailyHoleIds(dayKey(new Date(2026, 10, d)));
      ids.forEach((id) => seen.add(id));
      if (ids.join() === prev) repeats++;
      prev = ids.join();
    }
    expect(repeats).toBe(0);
    expect(seen.size).toBeGreaterThan(HOLES.length * 0.6);
  });
  it('a year of days has at most one long hole a day, and long holes still turn up (F99)', () => {
    const longIds = new Set(HOLES.filter((_, i) => isLongHole(i)).map((h) => h.id));
    expect(longIds.size).toBeGreaterThan(0);
    let withLong = 0;
    for (let d = 0; d < 365; d++) {
      const ids = dailyHoleIds(dayKey(new Date(2026, 10, 8 + d)));
      expect(ids).toHaveLength(RULES.holesPerMatch);
      const n = ids.filter((id) => longIds.has(id)).length;
      expect(n).toBeLessThanOrEqual(1);
      if (n) withLong++;
    }
    expect(withLong).toBeGreaterThan(365 * 0.3);
  });
  it('a match on the course plays those holes whatever the match seed', () => {
    const ids = dailyHoleIds('2026-11-07');
    for (const seed of [1, 2, 3]) {
      const rng = makeRng(seed);
      const g = new Minigolf([player({ bot: 'normal' }), player({ bot: 'normal' })], false, rng, ids);
      expect(g.holes.map((h) => h.id)).toEqual(ids);
      const bots = [new MinigolfBot(0, 'normal', rng), new MinigolfBot(1, 'normal', rng)];
      let t = 0;
      while (!g.finished && t < 900) {
        g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
        t += DT;
      }
      expect(g.finished).toBe(true);
    }
  }, 60_000);
  it("the day's best: fewer strokes wins, a new day starts over", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as unknown as Storage;
    const s = new Store(storage);
    expect(s.dailyBest('2026-11-07')).toBeNull();
    expect(s.recordDaily('2026-11-07', [{ name: 'Mia', strokes: 9 }, { name: 'Dad', strokes: 8 }])).toEqual({ best: { day: '2026-11-07', strokes: 8, name: 'Dad' }, newBest: true });
    expect(s.recordDaily('2026-11-07', [{ name: 'Mia', strokes: 8 }]).newBest).toBe(false); // a tie keeps the first
    expect(s.recordDaily('2026-11-07', [{ name: 'Mia', strokes: 7 }]).best?.name).toBe('Mia');
    expect(new Store(storage).dailyBest('2026-11-07')?.strokes).toBe(7); // saved
    expect(s.dailyBest('2026-11-08')).toBeNull();
    expect(s.recordDaily('2026-11-08', [{ name: 'Dad', strokes: 12 }]).best?.strokes).toBe(12);
  });
});

// F101: the list stays easiest-first at the long end. Twin Gates got easier (wider gates)
// and played under Switchback at every level (n=24: easy 5.2 vs 5.5, normal 3.1 vs 4.0),
// so Switchback is now the last hole.
describe('minigolf: hole order', () => {
  it('the last hole takes normal bots at least as many strokes as the one before it', () => {
    const strokes = (id: string) => {
      let total = 0;
      let balls = 0;
      for (let seed = 0; seed < 12; seed++) {
        const rng = makeRng(900 + seed);
        const g = new Minigolf([player({ bot: 'normal' }), player({ bot: 'normal' })], false, rng, [id]);
        const bots = [new MinigolfBot(0, 'normal', rng), new MinigolfBot(1, 'normal', rng)];
        for (let t = 0; !g.finished && t < 900; t += DT) g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
        for (const st of g.card[0].strokes) (total += st), balls++;
      }
      return total / balls;
    };
    const [a, b] = HOLES.slice(-2);
    expect(strokes(b.id)).toBeGreaterThanOrEqual(strokes(a.id));
  }, 60_000);
});
