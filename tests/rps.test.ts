import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { beats, Rps, RpsBot, RULES } from '../src/games/rps/logic';
import { player } from './helpers';

function play(seed: number) {
  const rng = makeRng(seed);
  const g = new Rps([player(), player()]);
  const bots = [new RpsBot(0, 'normal', rng), new RpsBot(1, 'normal', rng)];
  const log: string[] = [];
  while (!g.done) {
    if (g.revealing) g.next();
    g.pick(0, bots[0].choose());
    g.pick(1, bots[1].choose());
    log.push(g.last!.picks.join('-'));
  }
  return { g, log };
}

describe('rock paper scissors', () => {
  it('rock beats scissors beats paper beats rock', () => {
    expect(beats('rock', 'scissors')).toBe(true);
    expect(beats('scissors', 'paper')).toBe(true);
    expect(beats('paper', 'rock')).toBe(true);
    expect(beats('rock', 'paper')).toBe(false);
    expect(beats('rock', 'rock')).toBe(false);
  });

  it('bot vs bot ends at 3 round wins (ties replay)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { g } = play(seed);
      expect(g.done).toBe(true);
      expect(g.rounds).toBeLessThanOrEqual(RULES.maxRounds);
      if (g.winner !== null) expect(g.score[g.winner]).toBe(RULES.winRounds);
    }
  });

  it('is deterministic for a seed', () => {
    expect(play(9).log).toEqual(play(9).log);
  });

  it('picks stay hidden until both are in, and cannot be changed', () => {
    const g = new Rps([player(), player()]);
    expect(g.pick(0, 'rock')).toBe(true);
    expect(g.pick(0, 'paper')).toBe(false);
    expect(g.revealing).toBe(false);
    expect(g.last).toBeNull();
    g.pick(1, 'scissors');
    expect(g.revealing).toBe(true);
    expect(g.last).toEqual({ picks: ['rock', 'scissors'], winner: 0 });
    expect(g.score).toEqual([1, 0]);
    // No new picks during the reveal.
    expect(g.pick(1, 'rock')).toBe(false);
    g.next();
    expect(g.picks).toEqual([null, null]);
  });

  it('a tie scores nothing', () => {
    const g = new Rps([player(), player()]);
    g.pick(0, 'paper');
    g.pick(1, 'paper');
    expect(g.last?.winner).toBeNull();
    expect(g.score).toEqual([0, 0]);
    expect(g.rounds).toBe(1);
  });

  it('the bot picks each option about a third of the time', () => {
    const bot = new RpsBot(0, 'hard', makeRng(3));
    const n: Record<string, number> = { rock: 0, paper: 0, scissors: 0 };
    for (let i = 0; i < 900; i++) n[bot.choose()]++;
    for (const k of Object.keys(n)) expect(n[k]).toBeGreaterThan(240);
  });

  it('a pick is never exposed before both are in', () => {
    const g = new Rps([player(), player()]);
    g.pick(0, 'rock');
    expect(g.events).toEqual([{ type: 'picked', p: 0 }]);
    expect(g.last).toBeNull();
    expect(g.revealing).toBe(false);
    expect(g.pick(0, 'paper'), 'no changing a locked pick').toBe(false);
    g.pick(1, 'scissors');
    expect(g.last?.picks).toEqual(['rock', 'scissors']);
    expect(g.picksMade).toEqual([1, 1]);
  });
});
