import { afterEach, describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerInfo } from '../src/core/types';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { H, MID, W } from '../src/engine/world';
import type { QuickDraw } from '../src/games/quickdraw/logic';
import { GAMES } from '../src/games/registry';
import { DT, player, power } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };
type Box = { x0: number; y0: number; x1: number; y1: number };

// F261: a power's name was born at cowboyY + 60, on the top of the big SQUIRT! button, and
// Double Shot's "Phew! Forgiven 🎯" at signalY + 40, rising into the fake-out card's words.
// In each seat's own (local, upright) view, the things a readable pop must stay off:
const SIGNAL: Box = { x0: 24, y0: MID + 18, x1: W - 24, y1: MID + 98 }; // signal cards (fake-out, result, DRAW!)
const STARS: Box = { x0: W / 2 + 104, y0: MID + 116, x1: W / 2 + 128, y1: MID + 192 }; // round stars
const SCORE: Box = { x0: W / 2 + 96, y0: MID + 207, x1: W / 2 + 136, y1: MID + 221 }; // "1 – 0"
const BADGES: Box = { x0: 0, y0: MID + 207, x1: W / 2 - 40, y1: MID + 221 }; // "🎯 x1  ⏳ armed"
const BTN = { x: W / 2, y: H - 58, r: 47 }; // SQUIRT! button

const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('Quick Draw: power and "Forgiven" pops stay off the button, the signal and the score', () => {
  afterEach(() => setTextScale(1));
  for (const scale of [1, BIG_TEXT]) it(`in both seats, over bot matches with every power${scale === 1 ? '' : ' (Bigger text)'}`, () => {
    setTextScale(scale);
    const covered: Record<string, number> = { signal: 0, button: 0, stars: 0, score: 0, badges: 0 };
    const examples: string[] = [];
    const kinds = new Set<string>();
    let checked = 0;
    const ids = ['fakeout', 'slowtime', 'double', 'headstart', 'fly'];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const level of ['easy', 'normal'] as BotLevel[]) {
        const a = ids[seed % 5];
        const b = ids[(seed + 2) % 5];
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: power('quickdraw', a) }), player({ bot: level, power: power('quickdraw', b) })];
        const fx = new Fx();
        const view = GAMES.quickdraw.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: QuickDraw; update(dt: number, i: Input): void };
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        for (let i = 0; i < 60 * 120 && !view.game.done; i++) {
          view.update(DT, input);
          fx.update(DT);
          for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
            if (f.life < 0.45) continue;
            kinds.add(f.str.includes('Forgiven') ? 'forgiven' : f.str.includes('they used') ? 'they used' : 'power');
            checked++;
            // The seat's own upright view: the top seat's world is turned 180°.
            const x = f.player === 0 ? f.x : W - f.x;
            const y = f.player === 0 ? f.y : H - f.y;
            const size = scaledSize(f.size);
            const w = ([...f.str].length * size * 0.55) / 2;
            const box: Box = { x0: x - w, y0: y - size * 0.45, x1: x + w, y1: y + size * 0.45 };
            const near = Math.hypot(BTN.x - Math.max(box.x0, Math.min(box.x1, BTN.x)), BTN.y - Math.max(box.y0, Math.min(box.y1, BTN.y)));
            const on: [string, boolean][] = [['signal', hits(box, SIGNAL)], ['button', near < BTN.r], ['stars', hits(box, STARS)], ['score', hits(box, SCORE)], ['badges', hits(box, BADGES)]];
            for (const [k, hit] of on) {
              if (!hit) continue;
              covered[k]++;
              if (examples.length < 6) examples.push(`seed ${seed} ${level} step ${i}: "${f.str}" (seat ${f.player}, local y ${y.toFixed(0)}) on the ${k}`);
            }
          }
        }
      }
    }
    console.log(`quickdraw pops: ${checked} readable frames`, covered, examples);
    expect([...kinds].sort()).toEqual(['forgiven', 'power', 'they used']);
    expect(examples).toEqual([]);
  });
});
