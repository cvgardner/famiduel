import { afterEach, describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerIndex, PlayerInfo } from '../src/core/types';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { H, W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { N } from '../src/games/seabattle/logic';
import { DT, player, power } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; max: number; size: number; player: 0 | 1 };
type View = { update(dt: number, i: Input): void; layout(): { big: PlayerIndex } };

// The big board in the viewer's frame (src/games/seabattle/index.ts); its frame is drawn 4 units out.
const C = 27;
const GX = (W - N * C) / 2;
const GY = 82;
const FRAME = { x0: GX - 4, y0: GY - 4, x1: GX + N * C + 4, y1: GY + N * C + 4 };
const WORDS = new Set(['Splash', 'HIT!', 'Hit back!', 'MINE!']);

afterEach(() => setTextScale(1));

// F382: shotWord() and fx sized a word by its unscaled size, so with Bigger text (an 18 drawn
// at 21.6) "Splash" ran over the big board's right and top frame at 320 px.
describe('Sea Battle with Bigger text: shot words stay inside the big board', () => {
  it('in bot matches with every power', () => {
    setTextScale(BIG_TEXT);
    let total = 0;
    let out = 0;
    const examples: string[] = [];
    for (const level of ['easy', 'normal'] as const) {
      for (const pw of ['radar', 'airstrike', 'mine', null] as const) {
        for (const seed of [1, 2, 3]) {
          const p = pw ? power('seabattle', pw) : null;
          const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: p }), player({ bot: level, power: p })];
          const fx = new Fx();
          let ended = false;
          const view = GAMES.seabattle.create({ seed, rng: makeRng(seed), players, powersOn: !!p, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as View;
          const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
          for (let i = 0; i < 60 * 600 && !ended; i++) {
            view.update(DT, input);
            fx.update(DT);
            for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
              if (!WORDS.has(f.str) || f.life / f.max < 0.5) continue;
              total++;
              const x = f.player === 1 ? W - f.x : f.x;
              const y = f.player === 1 ? H - f.y : f.y;
              const s = scaledSize(f.size);
              const w = ([...f.str].length * s * 0.55) / 2;
              const h = s * 0.45;
              if (x - w < FRAME.x0 || x + w > FRAME.x1 || y - h < FRAME.y0 || y + h > FRAME.y1) {
                out++;
                if (examples.length < 5) examples.push(`${f.str} at ${x.toFixed(0)},${y.toFixed(0)}`);
              }
            }
          }
          expect(ended).toBe(true);
        }
      }
    }
    console.log(`seabattle bigger-text shot words: ${out}/${total} readable frames over the board's frame`, examples);
    expect(total).toBeGreaterThan(300);
    expect(out).toBe(0);
  }, 180_000);
});
