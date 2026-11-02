import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { Arena, TankBot, TankDuel } from '../src/games/tanks/logic';
import { COLS, ROWS } from '../src/games/tanks/mazes';
import { player } from './helpers';

// The bot's driving route (backlog: "a route that prefers the current heading on ties").
// On an open floor many routes are equally short; picking a different one on each look
// made the tank turn toward one and then back toward another.
function setup(heading: number) {
  const g = new TankDuel([player({ bot: 'normal' }), player({ bot: 'normal' })], false, makeRng(1));
  g.arena = new Arena(new Array(COLS * ROWS).fill(false));
  g.mines = [];
  const at = (c: number, r: number) => g.arena.center(c, r);
  Object.assign(g.tanks[0], at(1, 9), { a: heading });
  Object.assign(g.tanks[1], at(5, 2));
  const bot = new TankBot(0, 'normal', makeRng(2));
  const route = () => (bot as unknown as { route(g: TankDuel, a: unknown, b: unknown): number[] }).route(g, g.tanks[0], g.tanks[1]);
  return { g, bot, route };
}
const dirs = (path: number[]) =>
  path.slice(1).map((id, i) => `${(id % COLS) - (path[i] % COLS)},${Math.floor(id / COLS) - Math.floor(path[i] / COLS)}`);
const turns = (path: number[]) => dirs(path).filter((d, i, a) => i > 0 && d !== a[i - 1]).length;

describe('tank bot route', () => {
  it('is a shortest route that runs straight (diagonals cost more than side steps)', () => {
    // 4 across and 7 up: 4 diagonal steps and 3 straight ones, with one bend.
    const { route } = setup(-Math.PI / 2);
    const p = route();
    expect(p.length - 1).toBe(7);
    expect(dirs(p).filter((d) => d === '1,-1').length).toBe(4);
    expect(turns(p)).toBe(1);
  });

  it('starts the way the tank already faces', () => {
    expect(dirs(setup(-Math.PI / 2).route())[0]).toBe('0,-1'); // facing up: straight up first
    expect(dirs(setup(-Math.PI / 4).route())[0]).toBe('1,-1'); // facing up-right: diagonal first
  });

  it('keeps the route it is driving when the other is just as short', () => {
    const facingUp = setup(-Math.PI / 2);
    const first = facingUp.route();
    // Same spot, but the tank has swung to face up-right (it was steering round a
    // block corner). Fresh, it would start diagonally; mid-drive it keeps its route.
    const s = setup(-Math.PI / 4);
    expect(dirs(s.route())[0]).toBe('1,-1');
    Object.assign(s.bot as object, { path: first, pathI: 1 });
    expect(s.route()).toEqual(first);
  });
});
