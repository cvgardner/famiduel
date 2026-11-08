import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { setReader, soloReader } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { H } from '../src/engine/world';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

/** Which halves draw a kick tracker (its score digits sit 108 units from each end). */
function trackers(players: [PlayerInfo, PlayerInfo]): { top: number; bottom: number } {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.penalty.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} });
  const { g, words } = recorder();
  setReader(soloReader([players[0].bot, players[1].bot]), g);
  try {
    view.render(g);
  } finally {
    setReader(null);
  }
  const digits = (cy: number) => words.filter((w) => /^\d+$/.test(w.str) && Math.abs(w.y - cy) < 20).length;
  return { top: digits(108), bottom: digits(H - 108) };
}

// F167: in Play the bot, the bot's kick tracker turned to face the person read mirrored
// (its score on the left, the kicks running right to left) above the person's own.
describe('Penalty kick tracker', () => {
  it('two people: one tracker each, both scores on it', () => {
    expect(trackers([player({ bot: null }), player({ bot: null })])).toEqual({ top: 2, bottom: 2 });
  });
  it('one person and a bot: just the person\'s', () => {
    expect(trackers([player({ bot: null }), player({ bot: 'easy' })])).toEqual({ top: 0, bottom: 2 });
    expect(trackers([player({ bot: 'hard' }), player({ bot: null })])).toEqual({ top: 2, bottom: 0 });
  });
});
