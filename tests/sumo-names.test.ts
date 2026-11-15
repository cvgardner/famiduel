import { describe, expect, it } from 'vitest';
import { nameRoom } from '../src/games/sumo/index';

// F316: each seat's name is centred over its round pips at W - 62 (62 for a lefty); a 12-letter
// name ran off the screen edge and into the HOLD button (x 180, r 46, ring + 9).
describe('Sumo seat names keep clear of the edge and HOLD', () => {
  for (const x of [360 - 62, 62]) {
    it(`centred at ${x}`, () => {
      const half = nameRoom(x) / 2;
      expect(x + half).toBeLessThanOrEqual(360 - 6);
      expect(x - half).toBeGreaterThanOrEqual(6);
      const dist = Math.abs(x - 180);
      expect(dist - half, 'clear of the charge ring').toBeGreaterThanOrEqual(46 + 9 + 4);
      expect(nameRoom(x), 'room for a usual name').toBeGreaterThanOrEqual(100);
    });
  }
});
