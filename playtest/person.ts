// A "person" for games where random touches can't get anywhere: they read the
// screen and do the obvious next thing (tap Ready, pick a square and tap it
// again to fire), through the same touch events a finger makes. The monkey
// stays the model for real-time games; this one is for turn-based games whose
// steps need intent. Each game here reads its own view state through the
// debug hook only to know where to tap, never to change it.
import type { Page } from '@playwright/test';
import { worldBox } from './monkey';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What a person looking at the Sea Battle screen would do next. */
type SeaStep = { kind: 'wait' } | { kind: 'tap'; x: number; y: number } | { kind: 'fire'; x: number; y: number };

/**
 * Play Sea Battle as whoever holds the phone, for `ms` of real time: wake the
 * pass-the-phone cover, tap Ready on the fleet screen, then on each turn pick
 * an untried square and tap it twice (aim, then fire). Returns gestures made.
 * Sea Battle passes one phone between seats, so one person drives both humans.
 */
export async function seaBattlePerson(page: Page, ms: number, seed: number): Promise<number> {
  const box = await worldBox(page);
  let gestures = 0;
  let n = seed * 7919;
  const end = Date.now() + ms;
  const tap = async (x: number, y: number) => {
    const c = { x: box.x + (x / 360) * box.width, y: box.y + (y / 640) * box.height };
    const id = 300 + (gestures % 50);
    const f = (t: string) =>
      page.evaluate(([i, tt, cx, cy]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(i, tt, cx, cy), [id, t, c.x, c.y] as const);
    await f('pointerdown');
    await sleep(70);
    await f('pointerup');
    gestures++;
  };
  while (Date.now() < end) {
    let step: SeaStep;
    try {
      step = await page.evaluate((pick) => {
        type View = {
          mode: { kind: string; p: number; t: number };
          viewer: number;
          shells: unknown[];
          game: { seas: { marks: number[] }[] };
        };
        const v = (window as unknown as { __famiduel: { runner: { game: View } | null } }).__famiduel.runner?.game;
        if (!v) return { kind: 'wait' } as const;
        // Grid and Ready button in the active player's own frame (src/games/seabattle/index.ts).
        const N = 10, C = 27, GX = (360 - N * C) / 2, GY = 82;
        const world = (x: number, y: number) => (v.viewer === 1 ? { x: 360 - x, y: 640 - y } : { x, y });
        const m = v.mode;
        if (m.kind === 'cover' && m.t > 0.7) return { kind: 'tap', ...world(180, 320) } as const;
        if (m.kind === 'place' && m.t > 0.6) return { kind: 'tap', ...world(204 + 70, 404 + 29) } as const;
        if (m.kind === 'fire' && v.shells.length === 0) {
          const marks = v.game.seas[1 - m.p].marks;
          const open = marks.map((k, i) => (k === 0 ? i : -1)).filter((i) => i >= 0);
          if (!open.length) return { kind: 'wait' } as const;
          const c = open[pick % open.length];
          return { kind: 'fire', ...world(GX + (c % N) * C + C / 2, GY + Math.floor(c / N) * C + C / 2) } as const;
        }
        return { kind: 'wait' } as const;
      }, n);
      n = (n * 1103515245 + 12345) >>> 0;
      if (step.kind === 'wait') await sleep(120);
      else if (step.kind === 'tap') {
        await tap(step.x, step.y);
        await sleep(300);
      } else {
        // Aim, look at it for a moment, then tap the same square again to fire.
        await tap(step.x, step.y);
        await sleep(350);
        await tap(step.x, step.y);
        await sleep(450);
      }
    } catch {
      return gestures; // page navigated (match ended): stop quietly
    }
  }
  return gestures;
}
