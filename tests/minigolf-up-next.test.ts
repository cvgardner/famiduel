import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { setReader, soloReader } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import type { Minigolf } from '../src/games/minigolf/logic';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

// F216: after the bot's ball dropped, the person's strip still read "Wait · Bot shoots".
function strip(players: [PlayerInfo, PlayerInfo], setup: (g: Minigolf) => void): string[] {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.minigolf.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} }) as unknown as { game: Minigolf; t: number; render(g: unknown): void };
  setup(view.game);
  view.t = 3;
  const { g, words } = recorder();
  setReader(soloReader([players[0].bot, players[1].bot]), g);
  try {
    view.render(g);
  } finally {
    setReader(null);
  }
  return words.map((w) => w.str);
}

const settled = (shooter: 0 | 1, sunk: boolean) => (g: Minigolf) => {
  g.phase = 'settle';
  g.shooter = shooter;
  g.balls[shooter].done = sunk;
  g.balls[shooter].sunk = sunk;
};

describe('Minigolf: the strip says who is up once a ball settles', () => {
  const solo: [PlayerInfo, PlayerInfo] = [player({ bot: null, name: 'Ana' }), player({ bot: 'easy', name: 'Bot' })];
  const people: [PlayerInfo, PlayerInfo] = [player({ bot: null, name: 'Ana' }), player({ bot: null, name: 'Ben' })];

  it('the bot sank its ball: the person reads "You\'re up next!", not "Wait · Bot shoots"', () => {
    const w = strip(solo, settled(1, true));
    expect(w).toContain("You're up next!");
    expect(w).not.toContain('Wait · Bot shoots');
    expect(w).toContain('In the hole ✓');
  });

  it('between people, the waiting seat reads it too, and the shooter whose ball stopped short waits', () => {
    const w = strip(people, settled(0, false));
    expect(w).toContain("You're up next!");
    expect(w).not.toContain('Wait · Ana shoots');
  });

  it('a bot seat that shoots next never says "you"', () => {
    const w = strip(solo, settled(0, true));
    expect(w).toContain('Up next');
    expect(w.some((s) => /\byou/i.test(s) && s !== "You're up next!")).toBe(false);
  });

  it('nextShooter() matches who actually shoots after the settle', () => {
    for (const seed of [1, 2, 3]) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal' }), player({ bot: 'normal' })];
      const view = GAMES.minigolf.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx: new Fx(), end() {} }) as unknown as { game: Minigolf };
      const g = view.game;
      let checks = 0;
      let expectNext: 0 | 1 | null | undefined;
      for (let i = 0; i < 60 * 240 && g.phase !== 'over'; i++) {
        if (g.phase === 'settle' && expectNext === undefined) expectNext = g.nextShooter();
        if (g.phase !== 'settle' && expectNext !== undefined) {
          if (expectNext === null) expect(['card', 'over']).toContain(g.phase);
          else expect(g.shooter).toBe(expectNext);
          checks++;
          expectNext = undefined;
        }
        (view as unknown as { update(dt: number, i: unknown): void }).update(1 / 60, { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 });
      }
      expect(checks).toBeGreaterThan(3);
    }
  });
});
