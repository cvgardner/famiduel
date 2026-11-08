import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { player } from './helpers';

// F159: with two people, Sea Battle and RPS open on the pass-the-phone cover. The runner
// skips its "3 2 1" for a game that says so (opensOnCover), so no digit counts down over
// "Player 2, look away!". With a bot there is no cover and the countdown stays.
function open(id: string, players: [PlayerInfo, PlayerInfo]) {
  const sfx = { play() {} } as unknown as Sfx;
  return GAMES[id].create({ seed: 1, rng: makeRng(1), players, powersOn: true, sfx, fx: new Fx(), end() {} });
}

const people: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: null })];
const withBot: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: 'easy' })];

describe('games that open on a pass-the-phone cover', () => {
  it('Sea Battle and RPS with two people open on the cover', () => {
    for (const id of ['seabattle', 'rps']) expect(open(id, people).opensOnCover?.(), id).toBe(true);
  });

  it('with a bot they keep the countdown', () => {
    for (const id of ['seabattle', 'rps']) expect(open(id, withBot).opensOnCover?.() ?? false, id).toBe(false);
  });

  it('no action game opens on a cover', () => {
    for (const id of Object.keys(GAMES)) {
      if (id === 'seabattle' || id === 'rps') continue;
      expect(open(id, people).opensOnCover?.() ?? false, id).toBe(false);
    }
  });
});
