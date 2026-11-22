import { afterEach, describe, expect, it } from 'vitest';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { H, W } from '../src/engine/world';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { N, radarCells } from '../src/games/seabattle/logic';
import { DT, player, power } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; max: number; size: number; player: 0 | 1 };
type View = {
  update(dt: number, i: Input): void;
  game: { seas: { marks: number[] }[]; radar: { cell: number }[][] };
  layout(): { big: 0 | 1 };
  viewer: 0 | 1;
};

// Big grid in the viewer's frame (src/games/seabattle/index.ts).
const C = 27;
const GX = (W - N * C) / 2;
const GY = 82;

const box = (f: Floater): [number, number, number, number] => {
  const y = f.player === 1 ? H - f.y : f.y;
  const x = f.player === 1 ? W - f.x : f.x;
  const s = scaledSize(f.size);
  const w = Math.min(W - 16, [...f.str].length * s * 0.55);
  return [x - w / 2, y - s * 0.45, x + w / 2, y + s * 0.45];
};

// F409: a radar scan's words ("Ship nearby!", "All clear") popped 30 units above the scanned
// square, on the top row of the 3×3 box the scan was about: 61% of readable frames (71% with
// Bigger text) over a scanned square. They now start just outside the box, on the nearest line
// whose words and rise cross the fewest scanned squares, then marks: 4.5% (7.2%), mostly late
// in a match when the box sits mid-board and every line near it is full of marks.
describe('Sea Battle: radar words stay off the scanned box', () => {
  afterEach(() => setTextScale(1));
  for (const scale of [1, BIG_TEXT]) it(`in bot matches with every power${scale === 1 ? '' : ' (Bigger text)'}`, () => {
    setTextScale(scale);
    let pops = 0;
    let frames = 0;
    let onMarks = 0;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const pw of ['radar'] as const) {
        for (const seed of [1, 2, 3, 4, 5, 6]) {
          const p = power('seabattle', pw);
          const scanned = new Map<Floater, Set<number>>();
          const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: p }), player({ bot: level, power: p })];
          const fx = new Fx();
          let ended = false;
          const view = GAMES.seabattle.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as View;
          const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
          const seen = new Set<Floater>();
          let lastScan = new Set<number>();
          for (let i = 0; i < 60 * 600 && !ended; i++) {
            const before = view.game.radar.map((l) => l.length);
            view.update(DT, input);
            view.game.radar.forEach((l, k) => { if (l.length > before[k]) lastScan = new Set(radarCells(l[l.length - 1].cell)); });
            fx.update(DT);
            for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
              if (!/^(Ship nearby!|All clear)$/.test(f.str)) continue;
              if (!seen.has(f)) {
                seen.add(f);
                pops++;
                scanned.set(f, lastScan);
              }
              if (f.life / f.max < 0.3125) continue; // under half alpha from here on
              frames++;
              const b = box(f);
              let over = false;
              for (let c = 0; c < N * N && !over; c++) {
                if (!scanned.get(f)!.has(c)) continue;
                const cx = GX + (c % N) * C, cy = GY + Math.floor(c / N) * C;
                // the mark's dot / cross sits in the square's middle
                if (b[0] < cx + C - 6 && cx + 6 < b[2] && b[1] < cy + C - 6 && cy + 6 < b[3]) over = true;
              }
              if (over) onMarks++;
            }
          }
          expect(ended).toBe(true);
        }
      }
    }
    console.log(`seabattle radar words: ${pops}, readable frames ${frames}, over a scanned square ${onMarks} (${((100 * onMarks) / frames).toFixed(1)}%)`);
    expect(pops).toBeGreaterThan(30);
    expect(onMarks / frames).toBeLessThan(0.1);
  }, 240_000);
});
