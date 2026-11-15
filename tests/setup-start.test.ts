import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { player } from './helpers';

// F274: playing the bot, Sea Battle opens on "hide your fleet", not on play. The runner skips
// its "3 2 1" there (the digit sat on Shuffle and Ready) and the app skips the in-play ghost
// finger (its firing tap looped over Ready). Every other game opens on play.
function open(id: string, players: [PlayerInfo, PlayerInfo]) {
  const sfx = { play() {} } as unknown as Sfx;
  return GAMES[id].create({ seed: 1, rng: makeRng(1), players, powersOn: true, sfx, fx: new Fx(), end() {} });
}

const people: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: null })];
const withBot: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: 'easy' })];
const botFirst: [PlayerInfo, PlayerInfo] = [player({ bot: 'easy' }), player({ bot: null })];

describe('games that open on a setup screen', () => {
  it('Sea Battle against the bot opens on placing the fleet, either seat', () => {
    expect(open('seabattle', withBot).opensOnSetup?.()).toBe(true);
    expect(open('seabattle', botFirst).opensOnSetup?.()).toBe(true);
  });

  it('with two people it opens on the cover instead', () => {
    const g = open('seabattle', people);
    expect(g.opensOnCover?.()).toBe(true);
    expect(g.opensOnSetup?.()).toBe(false);
  });

  it('no other game opens on a setup screen', () => {
    for (const id of Object.keys(GAMES)) {
      if (id === 'seabattle') continue;
      for (const ps of [people, withBot]) expect(open(id, ps).opensOnSetup?.() ?? false, id).toBe(false);
    }
  });
});
