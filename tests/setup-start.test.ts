import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { RULES as GOLF } from '../src/games/minigolf/logic';
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

// F275: Rock Paper Scissors against the bot opens on the person's pick, which nothing times,
// so the runner skips the "3 2 1" there too (its digit sat on the hands and "Pick one!").
describe('games that open on an untimed pick', () => {
  it('RPS against the bot opens on a pick, either seat; two people get the cover', () => {
    expect(open('rps', withBot).opensOnPick?.()).toBe(true);
    expect(open('rps', botFirst).opensOnPick?.()).toBe(true);
    expect(open('rps', people).opensOnPick?.()).toBe(false);
    expect(open('rps', people).opensOnCover?.()).toBe(true);
  });

  it('no other game opens on a pick', () => {
    for (const id of Object.keys(GAMES)) {
      if (id === 'rps') continue;
      for (const ps of [people, withBot]) expect(open(id, ps).opensOnPick?.() ?? false, id).toBe(false);
    }
  });
});

// F276: Minigolf opens on its hole card ("HOLE 1 OF 3 · ... tees off first"), which no shot is
// timed against, so the runner skips the "3 2 1" (it counted on the bare course, then the card
// faded in at GO). The card still shows its usual RULES.introTime before the first turn.
describe('games that open on a hole card', () => {
  it('Minigolf opens on the hole card with two people or the bot, either seat', () => {
    for (const ps of [people, withBot, botFirst]) {
      const g = open('minigolf', ps);
      expect(g.opensOnCard?.()).toBe(true);
      const rules = g.game as { phase: string; timer: number };
      expect(rules.phase).toBe('intro');
      expect(rules.timer).toBe(GOLF.introTime);
    }
  });

  it('no other game opens on a hole card', () => {
    for (const id of Object.keys(GAMES)) {
      if (id === 'minigolf') continue;
      for (const ps of [people, withBot]) expect(open(id, ps).opensOnCard?.() ?? false, id).toBe(false);
    }
  });
});
