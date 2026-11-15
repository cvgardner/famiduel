import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { MARK, N, type SeaBattle } from '../src/games/seabattle/logic';
import { DT, player, power } from './helpers';

// Layout in the person's frame (src/games/seabattle/index.ts): big grid at GX, GY, cells of C;
// the power button at (264, 478).
const C = 27;
const GX = (360 - N * C) / 2;
const GY = 82;
const centre = (cell: number) => ({ x: GX + (cell % N) * C + C / 2, y: GY + Math.floor(cell / N) * C + C / 2 });

type View = { update(dt: number, i: Input): void; game: SeaBattle; mode: { kind: string; p?: number } };
type Floater = { str: string; life: number };

/** A person vs a bot, stepped to the person's first fire turn. */
function toFire(powersOn: boolean) {
  const players: [PlayerInfo, PlayerInfo] = [
    player({ bot: null, power: powersOn ? power('seabattle', 'radar') : null }),
    player({ bot: 'easy', power: powersOn ? power('seabattle', 'airstrike') : null }),
  ];
  const fx = new Fx();
  const sounds: string[] = [];
  const sfx = { play(n: string) { sounds.push(n); } } as unknown as Sfx;
  const view = GAMES.seabattle.create({ seed: 5, rng: makeRng(5), players, powersOn, sfx, fx, end() {} }) as unknown as View;
  const input = new Input();
  const step = () => { view.update(DT, input); fx.update(DT); input.endFrame(); };
  const tapAt = (x: number, y: number) => { input.down(1, x, y); step(); input.up(1); step(); };
  const myTurn = () => view.mode.kind === 'fire' && view.mode.p === 0 && view.game.turn === 0;
  const toMyTurn = () => { for (let i = 0; i < 6000 && !myTurn(); i++) step(); expect(myTurn()).toBe(true); };
  for (let i = 0; i < 600 && view.mode.kind !== 'place'; i++) step();
  tapAt(204 + 70, 404 + 29); // Ready
  toMyTurn();
  const words = () => (fx as unknown as { floaters: Floater[] }).floaters.map((f) => f.str);
  return { view, tapAt, toMyTurn, words, sounds };
}

// F293: Xbox Accessibility Guideline 103 / families playing with the sound off. A refused tap
// (a square already fired at, a power not charged) only buzzed, so a kid saw nothing happen.
describe('Sea Battle says why a tap was refused', () => {
  it('firing at a square already fired at pops "Already fired there"', () => {
    const { view, tapAt, toMyTurn, words, sounds } = toFire(false);
    // Fire at squares until one misses (a hit goes again), then wait for the next turn.
    let a = -1;
    for (let k = 0; k < N * N && view.game.turn === 0; k++) {
      const c = centre(k);
      tapAt(c.x, c.y);
      tapAt(c.x, c.y);
      a = k;
    }
    expect(view.game.seas[1].marks[a]).not.toBe(MARK.none);
    toMyTurn();
    sounds.length = 0;
    const c = centre(a);
    tapAt(c.x, c.y);
    tapAt(c.x, c.y);
    expect(sounds).toContain('buzz');
    expect(words()).toContain('Already fired there');
  });

  it('a normal shot pops none of the refusal words', () => {
    const { tapAt, words } = toFire(false);
    const c = centre(4 * N + 4);
    tapAt(c.x, c.y);
    tapAt(c.x, c.y);
    expect(words().filter((w) => w === 'Already fired there' || w === 'Not charged yet')).toEqual([]);
  });

  it('tapping a power that is not charged pops "Not charged yet"', () => {
    const { view, tapAt, words, sounds } = toFire(true);
    expect(view.game.energy[0].ready).toBe(false);
    tapAt(264, 478);
    expect(sounds).toContain('buzz');
    expect(words()).toContain('Not charged yet');
  });
});
