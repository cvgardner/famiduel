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

// F129: Mine never hit the other tank between easy bots (every bot drove round every
// mine it saw), so it lost to no power. Like a kid, a bot doesn't always notice the
// other tank's mine go down; it always knows its own.
describe('tank bot and mines', () => {
  const sees = (level: 'easy' | 'normal' | 'hard', owner: 0 | 1, n = 400) => {
    const bot = new TankBot(0, level, makeRng(3)) as unknown as { sees(m: unknown): boolean };
    let seen = 0;
    for (let id = 0; id < n; id++) if (bot.sees({ id, owner, x: 0, y: 0, arm: 0, alive: true })) seen++;
    return seen / n;
  };

  it('always knows its own mines', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) expect(sees(level, 0)).toBe(1);
  });

  it('notices the other tank\'s mines more often the stronger it is', () => {
    const [e, n, h] = (['easy', 'normal', 'hard'] as const).map((l) => sees(l, 1));
    expect(e).toBeGreaterThan(0.35);
    expect(e).toBeLessThan(0.65);
    expect(n).toBeGreaterThan(e);
    expect(h).toBeGreaterThan(n);
  });

  it('makes its mind up once per mine (no flicker between looks)', () => {
    const bot = new TankBot(0, 'easy', makeRng(4)) as unknown as { sees(m: unknown): boolean };
    const m = { id: 7, owner: 1, x: 0, y: 0, arm: 0, alive: true };
    const first = bot.sees(m);
    for (let i = 0; i < 20; i++) expect(bot.sees(m)).toBe(first);
  });

  it('a route goes straight over an unnoticed mine and round a noticed one', () => {
    const { g, bot, route } = setup(-Math.PI / 2);
    const [c, r] = [1, 6];
    Object.assign(g, { mines: [{ id: 1, owner: 1, ...g.arena.center(c, r), arm: 0, alive: true }] });
    const spotted = (bot as unknown as { spotted: Map<number, boolean> }).spotted;
    spotted.set(1, false);
    expect(route()).toContain(r * COLS + c);
    spotted.set(1, true);
    expect(route()).not.toContain(r * COLS + c);
  });
});
