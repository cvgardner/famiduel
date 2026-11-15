import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { COUNT_DY, countdownDy } from '../src/app/demo';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { GameInstance } from '../src/engine/game';
import type { Sfx } from '../src/engine/sfx';
import { MID, W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { RULES, type Sumo } from '../src/games/sumo/logic';
import { player } from './helpers';

type Circle = { x: number; y: number; r: number };
type View = GameInstance & { game: Sumo; buttons: Circle[]; powerBtns: ({ button: Circle } | null)[] };

function create(id: string, lefty = false): GameInstance {
  const list = (powers.games as Record<string, PowerDef[]>)[id] ?? [];
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: null, power: list[0], lefty }), player({ bot: null, power: list[1], lefty })];
  return GAMES[id].create({ seed: 1, rng: makeRng(1), players, powersOn: list.length > 0, sfx: { play() {} } as unknown as Sfx, fx: new Fx(), end() {} });
}

/** The biggest "3 2 1" digit's box (size 110, runner.ts), centred on (W / 2, y). */
function digit(y: number) {
  const size = 110;
  return { x0: W / 2 - size * 0.32, x1: W / 2 + size * 0.32, y0: y - size * 0.38, y1: y + size * 0.38 };
}
function touches(b: ReturnType<typeof digit>, c: Circle): boolean {
  const nx = Math.max(b.x0, Math.min(b.x1, c.x));
  const ny = Math.max(b.y0, Math.min(b.y1, c.y));
  return Math.hypot(c.x - nx, c.y - ny) < c.r;
}

// F280: the digit sat at MID ± 120, on the wrestler waiting at MID ± 72, for the whole 1.8 s.
describe('Sumo: the "3 2 1" digit stays off the wrestlers and the buttons', () => {
  for (const lefty of [false, true]) {
    it(`both seats${lefty ? ', left-handed' : ''}`, () => {
      const view = create('sumo', lefty) as View;
      const dy = countdownDy(view);
      const wrestlers = view.game.wrestlers.map((w) => ({ x: w.x, y: w.y, r: RULES.bodyR + 6 }));
      const controls = [...view.buttons, ...view.powerBtns.filter((b) => !!b).map((b) => b!.button)];
      expect(wrestlers.some((w) => [0, 1].some((p) => touches(digit(p === 0 ? MID + COUNT_DY : MID - COUNT_DY), w))), 'the old spot did cover one').toBe(true);
      for (const p of [0, 1]) {
        const box = digit(p === 0 ? MID + dy : MID - dy);
        for (const w of wrestlers) expect(touches(box, w), `seat ${p} digit on a wrestler`).toBe(false);
        for (const c of controls) expect(touches(box, c), `seat ${p} digit on a button`).toBe(false);
      }
    });
  }

  it('other games keep the usual spot', () => {
    for (const id of ['airhockey', 'pingpong', 'tanks', 'snake']) expect(countdownDy(create(id)), id).toBe(COUNT_DY);
  });
});
