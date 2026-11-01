import { describe, expect, it } from 'vitest';
import { StarterLog, starterLines } from '../src/app/starter';
import { makeRng } from '../src/core/rng';
import type { PlayerIndex, PlayerInfo } from '../src/core/types';
import { Checkers } from '../src/games/checkers/logic';
import { FourInARow } from '../src/games/fourinarow/logic';
import { Minigolf } from '../src/games/minigolf/logic';
import { Penalty } from '../src/games/penalty/logic';
import { SeaBattle } from '../src/games/seabattle/logic';
import { TicTacToe } from '../src/games/tictactoe/logic';
import { player } from './helpers';

const two = (): [PlayerInfo, PlayerInfo] => [player(), player()];

/** Each turn game: build it with a seed (and an optional starter) and read who went first. */
const GAMES: Record<string, (seed: number, s?: PlayerIndex) => PlayerIndex | null> = {
  checkers: (seed, s) => new Checkers(two(), makeRng(seed), s).starter,
  fourinarow: (seed, s) => new FourInARow(two(), false, makeRng(seed), s).firstStarter,
  tictactoe: (seed, s) => new TicTacToe(two(), makeRng(seed), s).starters[0],
  penalty: (seed, s) => new Penalty(two(), false, makeRng(seed), s).first,
  minigolf: (seed, s) => new Minigolf(two(), false, makeRng(seed), undefined, s).firstLeadOff,
  seabattle: (seed, s) => {
    const g = new SeaBattle(two(), false, makeRng(seed), s);
    g.setReady(0);
    g.setReady(1);
    return g.firstShooter;
  },
};

describe('starting takes turns', () => {
  it('the first match is a coin toss, then each rematch hands the start to the other seat', () => {
    const log = new StarterLog();
    expect(log.next('checkers')).toBeUndefined();
    log.record('checkers', 1);
    expect(log.next('checkers')).toBe(0);
    log.record('checkers', 0);
    expect(log.next('checkers')).toBe(1);
    // Games keep their own turn; a game with no first mover records nothing.
    expect(log.next('fourinarow')).toBeUndefined();
    log.record('sumo', undefined);
    log.record('seabattle', null);
    expect(log.next('sumo')).toBeUndefined();
    expect(log.next('seabattle')).toBeUndefined();
  });

  for (const [id, make] of Object.entries(GAMES)) {
    it(`${id}: honours the starter, and without one still tosses a coin from the seed`, () => {
      const firsts = new Set<PlayerIndex | null>();
      for (let seed = 1; seed <= 40; seed++) {
        firsts.add(make(seed));
        expect(make(seed)).toBe(make(seed));
        expect(make(seed, 0)).toBe(0);
        expect(make(seed, 1)).toBe(1);
      }
      expect([...firsts].sort()).toEqual([0, 1]);
    });

    it(`${id}: three rematches in a row alternate who starts`, () => {
      const log = new StarterLog();
      const seen: (PlayerIndex | null)[] = [];
      for (let m = 0; m < 4; m++) {
        const first = make(100 + m, log.next(id));
        log.record(id, first);
        seen.push(first);
      }
      for (let m = 1; m < 4; m++) expect(seen[m]).not.toBe(seen[m - 1]);
    });
  }

  it('a given starter leaves the rest of the seeded match unchanged (the coin is still drawn)', () => {
    // Same seed, starter forced to what the coin gave: identical holes and lead-off.
    for (let seed = 1; seed <= 10; seed++) {
      const a = new Minigolf(two(), false, makeRng(seed));
      const b = new Minigolf(two(), false, makeRng(seed), undefined, a.firstLeadOff);
      expect(b.holes.map((h) => h.id)).toEqual(a.holes.map((h) => h.id));
    }
  });
});

describe('the countdown says who goes first', () => {
  it('tells the starter it goes first and the other seat who does, by name', () => {
    expect(starterLines(0, ['Mia', 'Dad'])).toEqual(['You go first!', 'Mia goes first']);
    expect(starterLines(1, ['Mia', 'Dad'])).toEqual(['Dad goes first', 'You go first!']);
  });

  it('says nothing when the game has no first mover (yet)', () => {
    expect(starterLines(null, ['Mia', 'Dad'])).toEqual([null, null]);
    expect(starterLines(undefined, ['Mia', 'Dad'])).toEqual([null, null]);
  });

  it('shortens a long name so the line fits across the phone', () => {
    const [, line] = starterLines(0, ['Grandma Josephine', 'Dad']);
    expect(line).toBe('Grandma Jos… goes first');
    expect(line!.length).toBeLessThanOrEqual(23);
  });

  it('every turn game gives the countdown a starter once it is built (Sea Battle after placement)', () => {
    for (const [id, make] of Object.entries(GAMES)) {
      const [a, b] = starterLines(make(7), ['A', 'B']);
      expect([a, b].filter((l) => l === 'You go first!'), id).toHaveLength(1);
    }
  });
});
