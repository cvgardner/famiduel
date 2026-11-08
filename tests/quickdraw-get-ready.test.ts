import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { MID, W, H } from '../src/engine/world';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import type { QuickDraw } from '../src/games/quickdraw/logic';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

// F178: Slow Time's "⏳ get ready…" line sat on the cowboy's hat (seen at 320x568, bottom seat).
describe('Quick Draw: "get ready…" clears the cowboy', () => {
  it('for both seats, with Steady/Wait words and the fake-out card around it', () => {
    const players: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: null })];
    const view = GAMES.quickdraw.create({ seed: 1, rng: makeRng(1), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx: new Fx(), end() {} }) as unknown as { game: QuickDraw; t: number; render(g: unknown): void };
    const q = view.game;
    q.focus[0] = true;
    q.focus[1] = true;
    q.phase = 'wait';
    q.phaseT = (q as unknown as { waitLen: number }).waitLen;
    view.t = 1;
    const { g, words } = recorder();
    view.render(g);
    const ready = words.filter((w) => w.str === '⏳ get ready…');
    expect(ready.length).toBe(2);
    const cowboyY = MID + 162;
    for (const w of ready) {
      // In the seat's own frame: the top seat's copy is turned, so mirror it back.
      const top = w.y < MID;
      const x = top ? W - w.x : w.x;
      const y = top ? H - w.y : w.y;
      const half = ([...'⏳ get ready…'].length * 17 * 0.55) / 2;
      const box = [x - half, y - 9, x + half, y + 9];
      // Cowboy: hat crown (y-64) to boots, brim and arms to x ± 33.
      const cowboy = [W / 2 - 33, cowboyY - 64, W / 2 + 33, cowboyY + 47];
      const hit = box[0] < cowboy[2] && cowboy[0] < box[2] && box[1] < cowboy[3] && cowboy[1] < box[3];
      expect(hit, `seat ${top ? 1 : 0}: "get ready" box ${box.map(Math.round)} on the cowboy`).toBe(false);
      // The left cactus (x 11..57, up to MID + 125) and the screen edge.
      expect(y - 9, 'below the cactus').toBeGreaterThan(MID + 125);
      expect(box[0]).toBeGreaterThan(0);
      // The signal line ("Wait for it…", the fake-out card down to MID + 88).
      expect(y - 9).toBeGreaterThan(MID + 88);
    }
  });
});
