// A "monkey" player: real-time taps, holds, drags and swipes in one player's
// half of the canvas, dispatched as touch pointer events, so the game sees the
// same input a person's finger would produce.
import type { Page } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };

export async function installFingers(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Like a real finger, a touch goes to whatever is under it when it lands (the
    // canvas, or the pause button on the centre line) and stays with it until lifted.
    const targets = new Map<number, Element>();
    (window as unknown as { __finger: unknown }).__finger = (id: number, type: string, x: number, y: number) => {
      if (type === 'pointerdown') targets.set(id, document.elementFromPoint(x, y) ?? document.querySelector('#stage')!);
      const c = targets.get(id) ?? document.querySelector('#stage')!;
      if (type === 'pointerup') targets.delete(id);
      c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' }));
    };
  });
}

/** The world rectangle inside the letterboxed canvas, in client pixels. */
export async function worldBox(page: Page): Promise<Box> {
  const c = (await page.locator('#stage').boundingBox())!;
  const s = Math.min(c.width / 360, c.height / 640);
  return { x: c.x + (c.width - 360 * s) / 2, y: c.y + (c.height - 640 * s) / 2, width: 360 * s, height: 640 * s };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seeded so a failing playtest can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Play as `player` for `ms` milliseconds of real time. Half the gestures land
 * in the strip nearest the player's edge, where most games put their buttons.
 */
export async function monkey(page: Page, player: 0 | 1, ms: number, seed: number): Promise<number> {
  const box = await worldBox(page);
  const r = rng(seed);
  const id0 = player === 0 ? 100 : 200;
  let gestures = 0;
  const end = Date.now() + ms;
  // World-space point in this player's half -> client pixels.
  const pt = (edgeBias: boolean) => {
    const wx = 12 + r() * 336;
    const depth = edgeBias ? r() * 110 : r() * 300; // distance from the player's own edge
    const wy = player === 0 ? 630 - depth : 10 + depth;
    return { x: box.x + (wx / 360) * box.width, y: box.y + (wy / 640) * box.height };
  };
  const f = (id: number, type: string, p: { x: number; y: number }) =>
    page.evaluate(([i, t, x, y]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(i, t, x, y), [id, type, p.x, p.y] as const);
  while (Date.now() < end) {
    const id = id0 + (gestures % 50);
    const kind = r();
    const a = pt(r() < 0.5);
    try {
      await f(id, 'pointerdown', a);
      if (kind < 0.4) {
        await sleep(40 + r() * 80); // tap
      } else if (kind < 0.65) {
        await sleep(250 + r() * 700); // hold
      } else {
        // drag or swipe toward another point (often toward the middle)
        const b = pt(false);
        const steps = 4 + Math.floor(r() * 8);
        for (let i = 1; i <= steps; i++) {
          await f(id, 'pointermove', { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps });
          await sleep(kind < 0.85 ? 30 : 8);
        }
      }
      await f(id, 'pointerup', a);
    } catch {
      return gestures; // page navigated (match ended): stop quietly
    }
    gestures++;
    await sleep(60 + r() * 300);
  }
  return gestures;
}
