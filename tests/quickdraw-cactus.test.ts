import { describe, expect, it } from 'vitest';
import { MID } from '../src/engine/world';
import { POWER_R_BIG, powerSpot } from '../src/engine/widgets';
import { cacti, READY_X, READY_Y, SIGNAL_CARD } from '../src/games/quickdraw/index';

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

// F312: the worded fake-out card ("Open the DRAW-er!") and the DRAW! card covered the top
// half of the left cactus (it peeked out under the card's corner on a 320 px phone).
describe('Quick Draw: the cacti stay clear of the signal card and "get ready"', () => {
  for (const lefty of [false, true]) {
    it(lefty ? 'left-handed' : 'right-handed', () => {
      for (const [x, y, k] of cacti(lefty)) {
        // A cactus spans 26k either side, from its flower (56k up) to 6k below its foot.
        const box = { x0: x - 26 * k, x1: x + 26 * k, y0: MID + y - 56 * k, y1: MID + y + 6 * k };
        const c = SIGNAL_CARD;
        const overlapsCard = box.x0 < c.x1 && box.x1 > c.x0 && box.y0 < MID + (c.y1 - MID) && box.y1 > c.y0;
        expect(overlapsCard, `cactus at ${x},${y} under the signal card`).toBe(false);
        // "⏳ get ready…" (size 17, up to ~20 with Bigger text) is centred at READY_X, READY_Y.
        const half = 21 / 2;
        const readyBox = { x0: READY_X - 55, x1: READY_X + 55, y0: READY_Y - half, y1: READY_Y + half };
        const overlapsReady = box.x0 < readyBox.x1 && box.x1 > readyBox.x0 && box.y0 < readyBox.y1 && box.y1 > readyBox.y0;
        expect(overlapsReady, `cactus at ${x},${y} under "get ready"`).toBe(false);
      }
    });
  }
});
