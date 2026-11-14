import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { cellsOf, N, type SeaBattle } from '../src/games/seabattle/logic';
import { DT, player } from './helpers';

// Layout in the person's frame (src/games/seabattle/index.ts): big grid at GX, GY, cells of C.
const C = 27;
const GX = (360 - N * C) / 2;
const GY = 82;
const centre = (cell: number) => ({ x: GX + (cell % N) * C + C / 2, y: GY + Math.floor(cell / N) * C + C / 2 });

type View = { update(dt: number, i: Input): void; game: SeaBattle; mode: { kind: string } };
type Floater = { str: string; life: number; max: number };

function setup() {
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: 'easy' })];
  const fx = new Fx();
  const sounds: string[] = [];
  const sfx = { play(n: string) { sounds.push(n); } } as unknown as Sfx;
  const view = GAMES.seabattle.create({ seed: 3, rng: makeRng(3), players, powersOn: false, sfx, fx, end() {} }) as unknown as View;
  const input = new Input();
  for (let i = 0; i < 600 && view.mode.kind !== 'place'; i++) { view.update(DT, input); input.endFrame(); }
  expect(view.mode.kind).toBe('place');
  const step = () => { view.update(DT, input); fx.update(DT); input.endFrame(); };
  const words = () => (fx as unknown as { floaters: Floater[] }).floaters.map((f) => f.str);
  return { view, input, step, words, sounds };
}

// F257: a ship dropped where it can't go only buzzed and snapped back, so with the sound off
// nothing said why. Game Accessibility Guidelines: no essential information by sound alone.
describe('Sea Battle placement says why a ship snapped back', () => {
  it('dropping a ship on another ship pops "Doesn\'t fit there"', () => {
    const { view, input, step, words, sounds } = setup();
    const sea = view.game.seas[0];
    const [a, b] = sea.ships;
    const from = centre(cellsOf(a)[0]);
    const to = centre(cellsOf(b)[0]);
    input.down(1, from.x, from.y);
    step();
    for (let k = 1; k <= 10; k++) { input.move(1, from.x + ((to.x - from.x) * k) / 10, from.y + ((to.y - from.y) * k) / 10); step(); }
    const before = { x: a.x, y: a.y };
    input.up(1);
    step();
    expect({ x: a.x, y: a.y }, 'the ship snaps back').toEqual(before);
    expect(sounds).toContain('buzz');
    expect(words()).toContain("Doesn't fit there");
  });

  it('a good drop and a tap that turns a ship pop nothing', () => {
    const { view, input, step, words } = setup();
    const sea = view.game.seas[0];
    const i = sea.ships.findIndex((s, k) => view.game.rotateShip(0, k) && view.game.rotateShip(0, k) && s);
    expect(i).toBeGreaterThanOrEqual(0);
    const c = centre(cellsOf(sea.ships[i])[0]);
    input.down(1, c.x, c.y);
    step();
    input.up(1);
    step();
    expect(words().filter((w) => w === "Doesn't fit there" || w === 'No room to turn')).toEqual([]);
  });
});
