import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { setReader, soloReader } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

function vsLines(players: [PlayerInfo, PlayerInfo]): number {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.pingpong.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} });
  const { g, words } = recorder();
  setReader(soloReader([players[0].bot, players[1].bot]), g);
  try {
    view.render(g);
  } finally {
    setReader(null);
  }
  return words.filter((w) => /^vs \d+$/.test(w.str)).length;
}

// F163: in Play the bot, the bot's score card turned upright with its "vs N" (the person's
// points) above the number; the person's own card already says "vs" the bot.
describe('Ping Pong score cards', () => {
  it('two people: each card says "vs" the other', () => {
    expect(vsLines([player({ bot: null }), player({ bot: null })])).toBe(2);
  });
  it('one person and a bot: only the person\'s card', () => {
    expect(vsLines([player({ bot: null }), player({ bot: 'easy' })])).toBe(1);
    expect(vsLines([player({ bot: 'hard' }), player({ bot: null })])).toBe(1);
  });
});
