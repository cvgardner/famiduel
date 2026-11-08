import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { setReader, soloReader } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import type { TankDuel } from '../src/games/tanks/logic';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

/**
 * Each tank takes one bonk; returns, per row (top, bottom), whether the lost heart sits at
 * the right-hand end as the person (or, with two people, the row's owner) reads it.
 */
function lostOnRight(players: [PlayerInfo, PlayerInfo]): { top: boolean; bottom: boolean } {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.tanks.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} }) as unknown as { game: TankDuel; render(g: unknown): void };
  for (const t of view.game.tanks) t.hits = 1;
  const { g, words } = recorder();
  const reader = soloReader([players[0].bot, players[1].bot]);
  setReader(reader, g);
  try {
    view.render(g);
  } finally {
    setReader(null);
  }
  const row = (bottom: boolean) => {
    const hearts = words.filter((w) => w.str === '♥' && w.y > 320 === bottom).sort((a, b) => a.x - b.x);
    expect(hearts.length).toBeGreaterThan(1);
    const lost = hearts.findIndex((h) => h.color !== '#ff5c7a');
    const seat = reader ?? (bottom ? 0 : 1);
    // Seat 1 reads the row from the far side: its right is the screen's left.
    return seat === 0 ? lost === hearts.length - 1 : lost === 0;
  };
  return { top: row(false), bottom: row(true) };
}

// F164: in Play the bot, the bot's hearts turned to face the person emptied from the left
// while the person's own emptied from the right.
describe('Tank Duel hearts', () => {
  it('two people: each row empties from its owner\'s right', () => {
    expect(lostOnRight([player({ bot: null }), player({ bot: null })])).toEqual({ top: true, bottom: true });
  });
  it('one person and a bot: both rows empty from the person\'s right', () => {
    expect(lostOnRight([player({ bot: null }), player({ bot: 'easy' })])).toEqual({ top: true, bottom: true });
    expect(lostOnRight([player({ bot: 'hard' }), player({ bot: null })])).toEqual({ top: true, bottom: true });
  });
});
