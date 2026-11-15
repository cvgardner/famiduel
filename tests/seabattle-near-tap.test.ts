import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { MARK, N, type SeaBattle } from '../src/games/seabattle/logic';
import { DT, player } from './helpers';

// Layout in the person's frame (src/games/seabattle/index.ts): big grid at GX, GY, cells of C.
const C = 27;
const GX = (360 - N * C) / 2;
const GY = 82;
const centre = (cell: number) => ({ x: GX + (cell % N) * C + C / 2, y: GY + Math.floor(cell / N) * C + C / 2 });

type View = { update(dt: number, i: Input): void; game: SeaBattle; mode: { kind: string; p?: number } };

/** A person vs a bot, stepped to the person's first fire turn. */
function toFire() {
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: 'easy' })];
  const fx = new Fx();
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.seabattle.create({ seed: 5, rng: makeRng(5), players, powersOn: false, sfx, fx, end() {} }) as unknown as View;
  const input = new Input();
  const step = () => { view.update(DT, input); fx.update(DT); input.endFrame(); };
  const tapAt = (x: number, y: number) => { input.down(1, x, y); step(); input.up(1); step(); };
  for (let i = 0; i < 600 && view.mode.kind !== 'place'; i++) step();
  tapAt(204 + 70, 404 + 29); // Ready
  for (let i = 0; i < 3000 && !(view.mode.kind === 'fire' && view.mode.p === 0); i++) step();
  expect(view.mode.kind).toBe('fire');
  return { view, tapAt, marks: () => view.game.seas[1].marks };
}

// F270: NN/g kids' UX: don't punish near misses. The second tap had to land in the exact
// aimed square (27 units), so a slightly-off finger re-aimed the next square instead of firing.
describe('Sea Battle: a second tap a little off still fires the aimed square', () => {
  it('a tap just over the line into the next square fires the aimed one', () => {
    const { tapAt, marks } = toFire();
    const a = 4 * N + 4;
    const c = centre(a);
    tapAt(c.x, c.y);
    expect(marks()[a]).toBe(MARK.none);
    tapAt(c.x + 0.6 * C, c.y + 0.1 * C); // in the square to the right, near the shared line
    expect(marks()[a], 'the aimed square was fired at').not.toBe(MARK.none);
    expect(marks()[a + 1], 'not the neighbour').toBe(MARK.none);
  });

  it("a tap on a neighbour's middle re-aims (no shot)", () => {
    const { tapAt, marks } = toFire();
    const a = 4 * N + 4;
    const c = centre(a);
    tapAt(c.x, c.y);
    tapAt(c.x + C, c.y);
    expect(marks().every((m) => m === MARK.none), 'nothing fired yet').toBe(true);
    tapAt(c.x + C, c.y);
    expect(marks()[a + 1], 'the re-aimed square fires on its second tap').not.toBe(MARK.none);
  });
});
