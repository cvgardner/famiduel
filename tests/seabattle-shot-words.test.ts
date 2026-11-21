import { afterEach, describe, expect, it } from 'vitest';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { makeRng } from '../src/core/rng';
import type { PlayerIndex, PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { H, W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { N, type Sea } from '../src/games/seabattle/logic';
import { DT, player, power } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; max: number; size: number; player: 0 | 1 };
type View = {
  update(dt: number, i: Input): void;
  layout(): { big: PlayerIndex; bigShips: boolean };
  game: { seas: [Sea, Sea] };
};

// The big board in the viewer's frame (src/games/seabattle/index.ts).
const C = 27;
const GX = (W - N * C) / 2;
const GY = 82;
const WORDS = new Set(['Splash', 'HIT!', 'Hit back!', 'MINE!']);

/** Ship cells on the big board that a word's box covers (the board shows that sea's ships). */
function onShip(f: Floater, sea: Sea): boolean {
  const x = f.player === 1 ? W - f.x : f.x;
  const y = f.player === 1 ? H - f.y : f.y;
  const w = ([...f.str].length * scaledSize(f.size) * 0.55) / 2;
  const h = scaledSize(f.size) * 0.45;
  for (let c = 0; c < N * N; c++) {
    if (sea.occ[c] < 0) continue;
    const cx = GX + (c % N) * C;
    const cy = GY + Math.floor(c / N) * C;
    // A ship is drawn inset a little in its cells.
    if (x - w < cx + C - 3 && cx + 3 < x + w && y - h < cy + C - 3 && cy + 3 < y + h) return true;
  }
  return false;
}

// F273: a shot's "Splash" / "HIT!" popped a fixed 22-26 units above (or below) the cell, often
// right on one of the defender's own ships on their big "Your ships" board.
describe('Sea Battle: shot words start off the ships on the big board', () => {
  afterEach(() => setTextScale(1));
  for (const scale of [1, BIG_TEXT]) it(`in bot matches with every power${scale === 1 ? '' : ' (Bigger text)'}`, () => {
    setTextScale(scale);
    let total = 0;
    let covered = 0;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const pw of ['radar', 'airstrike', 'mine', null] as const) {
        for (const seed of [1, 2, 3, 4]) {
          const p = pw ? power('seabattle', pw) : null;
          const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: p }), player({ bot: level, power: p })];
          const fx = new Fx();
          let ended = false;
          const view = GAMES.seabattle.create({ seed, rng: makeRng(seed), players, powersOn: !!p, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as View;
          const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
          for (let i = 0; i < 60 * 600 && !ended; i++) {
            view.update(DT, input);
            fx.update(DT);
            const lay = view.layout();
            if (!lay.bigShips) continue;
            for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
              if (!WORDS.has(f.str) || f.life / f.max < 0.5) continue;
              total++;
              if (onShip(f, view.game.seas[lay.big])) covered++;
            }
          }
          expect(ended).toBe(true);
        }
      }
    }
    console.log(`seabattle shot words: ${covered}/${total} readable frames on a ship of the big board`);
    expect(total).toBeGreaterThan(500);
    expect(covered / total).toBeLessThan(0.02);
  }, 180_000);
});
