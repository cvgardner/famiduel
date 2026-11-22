import { afterEach, describe, expect, it } from 'vitest';
import { COUNT_DY, countdownDy } from '../src/app/demo';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { GameInstance } from '../src/engine/game';
import type { Sfx } from '../src/engine/sfx';
import { MID, W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { COUNT_DY_TUG, DIGIT, L, LINE_HALF, LINE_PX } from '../src/games/tugofwar/index';
import type { TugOfWar } from '../src/games/tugofwar/logic';
import { player } from './helpers';

type Box = { x0: number; x1: number; y0: number; y1: number };
type View = GameInstance & { game: TugOfWar };

function create(assist: [number, number]): View {
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: null, assist: assist[0] }), player({ bot: null, assist: assist[1] })];
  return GAMES.tugofwar.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx: new Fx(), end() {} }) as View;
}

/** The biggest "3 2 1" digit (size 110, runner.ts) in a seat's own frame, centred MID + dy:
 *  Chromium's bold "3" is 49 above its middle and 35 below, plus half its 18-unit stroke. */
const digit = (dy: number): Box => ({ x0: W / 2 - DIGIT.halfW, x1: W / 2 + DIGIT.halfW, y0: MID + dy - DIGIT.up, y1: MID + dy + DIGIT.down });
const overlap = (a: Box, b: Box) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0;
const depth = (a: Box, b: Box) => Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** What a player looks at in their half before PULL!, in their own frame (drawPuller,
 *  drawLine): the puller around the hands (drawn 1.3x, hands to feet), the chalk line, the
 *  "your line" label, and the ribbon's knot on the rope in the mud. */
function pieces(g: TugOfWar, p: 0 | 1) {
  const lineY = MID + g.lineNow(p) * LINE_PX;
  const label = scaledSize(13);
  const hands = L.pullerY; // no strain, no slide before PULL!
  return {
    puller: { x0: W / 2 - 6, x1: W / 2 + 46, y0: hands - 14, y1: hands + 58 },
    line: { x0: 14, x1: W - 14, y0: lineY - LINE_HALF, y1: lineY + LINE_HALF },
    label: { x0: W / 2 - 104 - label * 2.6, x1: W / 2 - 104 + label * 2.6, y0: lineY + 15 - label * 0.5, y1: lineY + 15 + label * 0.5 },
    knot: { x0: W / 2 - 7, x1: W / 2 + 7, y0: MID - 7, y1: MID + 7 },
  };
}

afterEach(() => setTextScale(1));

describe('F412: Tug of War\'s "3 2 1" digit stays off the puller, the chalk line and its label', () => {
  it('the old spot covered the chalk line and the puller', () => {
    const g = create([0, 0]).game;
    const box = digit(COUNT_DY);
    expect(overlap(box, pieces(g, 0).line)).toBe(true);
    expect(overlap(box, pieces(g, 0).puller)).toBe(true);
  });

  for (const scale of [1, BIG_TEXT]) {
    for (const assist of [[0, 0], [1, 0], [2, 0], [3, 0], [0, 3], [3, 3], [2, 1]] as [number, number][]) {
      it(`head starts ${assist.join('/')}${scale > 1 ? ', Bigger text' : ''}`, () => {
        setTextScale(scale);
        const view = create(assist);
        const dy = countdownDy(view);
        expect(dy).toBeGreaterThanOrEqual(COUNT_DY_TUG.least);
        // The two seats' digits (one turned) never meet across the middle.
        expect(2 * (dy - DIGIT.up)).toBeGreaterThanOrEqual(4);
        const box = digit(dy);
        for (const p of [0, 1] as const) {
          const at = pieces(view.game, p);
          expect(overlap(box, at.puller), `seat ${p} digit on the puller`).toBe(false);
          expect(overlap(box, at.label), `seat ${p} digit on "your line"`).toBe(false);
          // A 3-star head start's line (104 from the middle) leaves no full-size row: only the
          // biggest frames of each step graze its edge, under the 7-unit stroke's middle.
          const graze = depth(box, at.line);
          if (view.game.line[p] * LINE_PX > 105) expect(graze, `seat ${p} digit on its line`).toBe(0);
          else expect(graze, `seat ${p} digit deep in its line`).toBeLessThanOrEqual(6);
        }
        // The knot only clears when no line is near (the line wins the room).
        if (Math.min(...view.game.line) * LINE_PX > 120) expect(overlap(box, pieces(view.game, 0).knot)).toBe(false);
      });
    }
  }
});
