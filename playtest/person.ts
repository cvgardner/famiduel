// A "person" for games where random touches can't get anywhere: they read the
// screen and do the obvious next thing (tap Ready, pick a square and tap it
// again to fire), through the same touch events a finger makes. The monkey
// stays the model for real-time games; this one is for turn-based games whose
// steps need intent. Each game here reads its own view state through the
// debug hook only to know where to tap, never to change it.
import type { Page } from '@playwright/test';
import { worldBox } from './monkey';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A person plays for `ms` of real time; returns gestures made and moves made per seat. */
export type Person = (page: Page, ms: number, seed: number) => Promise<{ gestures: number; moves: number[] }>;

/** What a person looking at the Sea Battle screen would do next. */
type SeaStep = { kind: 'wait' } | { kind: 'tap'; x: number; y: number } | { kind: 'fire'; x: number; y: number };

/**
 * Play Sea Battle as whoever holds the phone, for `ms` of real time: wake the
 * pass-the-phone cover, tap Ready on the fleet screen, then on each turn pick
 * an untried square and tap it twice (aim, then fire). Returns gestures made.
 * Sea Battle passes one phone between seats, so one person drives both humans.
 */
export const seaBattlePerson: Person = async (page, ms, seed) => {
  const gestures = await seaBattleTaps(page, ms, seed);
  const moves = await page
    .evaluate(() => (window as unknown as { __famiduel: { runner: { game: { game: { shotsFired: number[] } } } | null } }).__famiduel.runner?.game.game.shotsFired ?? [0, 0])
    .catch(() => [0, 0]);
  return { gestures, moves: [...moves] };
};

async function seaBattleTaps(page: Page, ms: number, seed: number): Promise<number> {
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

/** What a person looking at a board game would do next: wait, or tap these world points in order. */
type BoardStep = { taps: { x: number; y: number }[]; sig: string; seat: number };

/**
 * Play a face-to-face board game (Checkers, Four in a Row, Tic-Tac-Toe) as whichever
 * human seat is to move: wait for the bot and the animations, then pick a legal move
 * and tap it the way the game asks (Checkers: the piece, then every square it lands
 * on; Four in a Row: the column, in the mover's own half; Tic-Tac-Toe: the square).
 * A move counts when the board changes after the person's taps.
 */
function boardPerson(id: 'checkers' | 'fourinarow' | 'tictactoe'): Person {
  return async (page, ms, seed) => {
    const box = await worldBox(page);
    let gestures = 0;
    const moves = [0, 0];
    let n = seed * 7919;
    const end = Date.now() + ms;
    const tap = async (x: number, y: number) => {
      const c = { x: box.x + (x / 360) * box.width, y: box.y + (y / 640) * box.height };
      const fid = 400 + (gestures % 50);
      const f = (t: string) =>
        page.evaluate(([i, tt, cx, cy]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(i, tt, cx, cy), [fid, t, c.x, c.y] as const);
      await f('pointerdown');
      await sleep(70);
      await f('pointerup');
      gestures++;
    };
    // Read-only look at the screen: whose turn, is anything still moving, and where to tap.
    const look = (pick: number) =>
      page.evaluate(
        ([gid, pk]) => {
          type Any = Record<string, any>;
          const v = (window as unknown as { __famiduel: { runner: { game: Any } | null } }).__famiduel.runner?.game;
          const none = { taps: [], sig: '', seat: -1 };
          if (!v) return none;
          const g = v.game as Any;
          const sig = (b: ArrayLike<number>) => Array.from(b).join(',') + '|' + JSON.stringify(g.score);
          if (g.done) return none;
          const p = g.turn as number;
          if (v.bots[p]) return none;
          if (gid === 'checkers') {
            // Board geometry from src/games/checkers/index.ts (world coordinates, not rotated).
            const SQ = 39, BX = 40, BY = 320 - SQ * 4;
            const at = (i: number) => ({ x: BX + (i & 7) * SQ + SQ / 2, y: BY + (i >> 3) * SQ + SQ / 2 });
            if (v.anim) return none;
            // A half-made selection from an earlier tap: tap the piece again to start over.
            if (v.sel) return { taps: [at(v.sel.from)], sig: sig(g.cells), seat: -1 };
            const legal = g.legal() as { from: number; path: number[] }[];
            if (!legal.length) return none;
            const m = legal[pk % legal.length];
            return { taps: [m.from, ...m.path].map(at), sig: sig(g.cells), seat: p };
          }
          if (gid === 'fourinarow') {
            // src/games/fourinarow/index.ts: 43-unit columns from x=48; tap in your own half, off the board.
            if (v.busy || v.busyDiscs() || g.roundOver) return none;
            const cols = g.legalCols(p) as number[];
            if (!cols.length) return none;
            const c = cols[pk % cols.length];
            return { taps: [{ x: 48 + c * 43 + 21.5, y: p === 0 ? 320 + 200 : 320 - 200 }], sig: sig(g.board), seat: p };
          }
          // Tic-Tac-Toe: 90-unit cells centred on the screen.
          if (g.between) return none;
          const open = g.legal() as number[];
          if (!open.length) return none;
          const c = open[pk % open.length];
          return { taps: [{ x: 180 - 135 + (c % 3) * 90 + 45, y: 320 - 135 + Math.floor(c / 3) * 90 + 45 }], sig: sig(g.board), seat: p };
        },
        [id, pick] as const,
      );
    while (Date.now() < end) {
      try {
        const step: BoardStep = await look(n);
        n = (n * 1103515245 + 12345) >>> 0;
        if (!step.taps.length) {
          await sleep(120);
          continue;
        }
        for (const t of step.taps) {
          await tap(t.x, t.y);
          await sleep(260); // look at the highlighted piece / landing square before the next tap
        }
        if (step.seat < 0) continue;
        const after = await page.evaluate((gid) => {
          type Any = Record<string, any>;
          const g = (window as unknown as { __famiduel: { runner: { game: Any } | null } }).__famiduel.runner?.game.game as Any | undefined;
          if (!g) return '';
          const b = gid === 'checkers' ? g.cells : g.board;
          return Array.from(b as ArrayLike<number>).join(',') + '|' + JSON.stringify(g.score);
        }, id);
        if (after && after !== step.sig) moves[step.seat]++;
        await sleep(200);
      } catch {
        break; // page navigated (match ended): stop quietly
      }
    }
    return { gestures, moves };
  };
}

export const checkersPerson = boardPerson('checkers');
export const fourInARowPerson = boardPerson('fourinarow');
export const ticTacToePerson = boardPerson('tictactoe');
