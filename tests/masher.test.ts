import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { H, MID } from '../src/engine/world';
import { Masher, pairing, SPECS } from '../scripts/simlib';

// One model of a small kid who mashes without following the game (backlog 2026-10-31):
// `Masher` in scripts/simlib.ts. Sumo's tests, `npm run sim` (kid / kid+3 rows) and these
// one-button games all use it, so "can a masher ever win?" means the same thing everywhere.
describe('the shared mashing kid', () => {
  it('presses in short bursts with short gaps and stays in its own half', () => {
    for (const p of [0, 1] as const) {
      const m = new Masher(p, makeRng(3));
      let presses = 0;
      let pressed = 0;
      const DT = 1 / 60;
      for (let t = 0; t < 30; t += DT) {
        m.tick(DT);
        if (m.tap()) presses++;
        if (m.press) pressed += DT;
        expect(p === 0 ? m.y > MID : m.y < MID).toBe(true);
        expect(m.y).toBeGreaterThan(0);
        expect(m.y).toBeLessThan(H);
      }
      // ~1.6 presses a second, held a bit over half the time.
      expect(presses / 30).toBeGreaterThan(1);
      expect(presses / 30).toBeLessThan(3);
      expect(pressed / 30).toBeGreaterThan(0.4);
      expect(pressed / 30).toBeLessThan(0.75);
    }
  });

  // Win rates of a masher vs the easy bot, with no head start and a full one (★★★). Numbers
  // go in docs/backlog.md (F134); F21 decides whether a mashing kid should ever win these.
  for (const id of ['chopchop', 'quickdraw']) {
    it(`${id}: a masher's matches finish, and it never beats the hard bot`, () => {
      const spec = SPECS.find((s) => s.id === id)!;
      const rate = (levels: Parameters<typeof pairing>[1]) => {
        const r = pairing(spec, levels, 20);
        expect(r.unfinished, `${id} ${levels.join(' v ')} unfinished`).toBe(0);
        return r.wins;
      };
      const kidEasy = rate(['kid', 'easy']);
      const kid3Easy = rate(['kid+3', 'easy']);
      const kidHard = rate(['kid', 'hard']);
      console.log(`${id}: masher v easy ${Math.round(kidEasy * 100)}%, masher+3 v easy ${Math.round(kid3Easy * 100)}%, masher v hard ${Math.round(kidHard * 100)}%`);
      expect(kidHard).toBeLessThanOrEqual(0.05);
      // A head start never makes a masher worse off.
      expect(kid3Easy).toBeGreaterThanOrEqual(kidEasy);
    }, 60_000);
  }
});
