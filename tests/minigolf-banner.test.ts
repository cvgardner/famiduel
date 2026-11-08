import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { MID, W } from '../src/engine/world';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { DT, player } from './helpers';

type View = { update(dt: number, input: Input): void; render(g: unknown): void; game: { phase: string } };

/**
 * Plays bot-vs-bot minigolf, drawing every frame. Returns how many frames showed "YOUR SHOT!",
 * and the frames that showed it together with a centre pop ("HOLE IN ONE!", "Par",
 * "Splash! +1 stroke"...).
 */
function play(seed: number): { banners: number; clashes: string[]; pops: number } {
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal' }), player({ bot: 'normal' })];
  const sfx = { play() {} } as unknown as Sfx;
  const fx = new Fx();
  const centre = new Set<string>();
  const pop = fx.pop.bind(fx);
  fx.pop = (str, x, y, ...rest) => {
    if (x === W / 2 && (y === MID + 40 || y === MID - 40)) centre.add(str);
    pop(str, x, y, ...rest);
  };
  const view = GAMES.minigolf.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx, fx, end() {} }) as unknown as View;
  const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined } as unknown as Input;
  let banners = 0;
  const clashes: string[] = [];
  for (let i = 0; i < 60 * 240 && view.game.phase !== 'over'; i++) {
    view.update(DT, input);
    fx.update(DT);
    const { g, words } = recorder();
    view.render(g);
    fx.render(g);
    const strs = words.map((w) => w.str);
    if (!strs.includes('YOUR SHOT!')) continue;
    banners++;
    const with_ = strs.filter((s) => centre.has(s));
    if (with_.length) clashes.push(`frame ${i}: YOUR SHOT! with ${with_.join(', ')}`);
  }
  return { banners, clashes, pops: centre.size };
}

// F173: the turn passed 0.7 s after a sink, so "YOUR SHOT!" printed over the still-rising
// "HOLE IN ONE!" / "Birdie!" pop in the middle of the course.
describe('Minigolf: the turn banner waits for the centre pop', () => {
  it('never draws "YOUR SHOT!" while a sink or splash pop is on screen', () => {
    for (const seed of [1, 2, 3]) {
      const r = play(seed);
      expect(r.pops, `seed ${seed}: some centre pops were shown`).toBeGreaterThan(0);
      expect(r.banners, `seed ${seed}: the banner still shows`).toBeGreaterThan(0);
      expect(r.clashes, `seed ${seed}`).toEqual([]);
    }
  }, 60_000);
});
