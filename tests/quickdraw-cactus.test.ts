import { describe, expect, it } from 'vitest';
import { MID } from '../src/engine/world';
import { POWER_R_BIG, powerSpot } from '../src/engine/widgets';
import { cacti } from '../src/games/quickdraw/index';

// F262: a left-hander's power button moves to their right corner, where Quick Draw drew a
// cactus, so the button sat on it (lefty-quickdraw.png).
describe('Quick Draw: no cactus under a power button', () => {
  for (const lefty of [false, true]) {
    it(lefty ? 'left-handed' : 'right-handed', () => {
      // The bottom seat's spot in its own (local) view; the top seat's view is the same turned.
      const [bx, by] = powerSpot(0, 40, 42, lefty);
      for (const [x, y, k] of cacti(lefty)) {
        // A cactus spans about 26k left/right and 52k up from its foot.
        const nx = Math.max(x - 26 * k, Math.min(x + 26 * k, bx));
        const ny = Math.max(MID + y - 56 * k, Math.min(MID + y + 6 * k, by));
        expect(Math.hypot(bx - nx, by - ny), `cactus at ${x},${y}`).toBeGreaterThan(POWER_R_BIG + 4);
      }
    });
  }
});
