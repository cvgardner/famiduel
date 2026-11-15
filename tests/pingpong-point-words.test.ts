import { describe, expect, it } from 'vitest';
import { pointLines } from '../src/games/pingpong/index';

// F302: both seats used to read "POINT!", so the player who lost the point read it as theirs.
describe('ping pong point words', () => {
  const people = [{ name: 'Player 1' }, { name: 'Player 2' }];
  it('the scorer reads "Your point!", the other seat "Their point"', () => {
    expect(pointLines(0, people)).toEqual(['Your point!', 'Their point']);
    expect(pointLines(1, people)).toEqual(['Their point', 'Your point!']);
  });
  it("a person beaten by the bot reads the bot's name", () => {
    const solo = [{ name: 'Player 1' }, { name: 'Bot', bot: 'normal' }];
    expect(pointLines(1, solo)[0]).toBe("Bot's point");
    expect(pointLines(0, solo)[0]).toBe('Your point!');
  });
  it('no seat reads the same words as the other', () => {
    for (const s of [0, 1] as const) {
      const [a, b] = pointLines(s, people);
      expect(a).not.toBe(b);
    }
  });
});
