import { describe, expect, it } from 'vitest';
import { scoreLabels } from '../src/app/resulttitle';

// F311: each number on a result half says whose it is.
describe('result score labels', () => {
  it('two people: each half reads "You" first, then the other player', () => {
    expect(scoreLabels(['Mia', 'Dad'], [false, false], 0)).toEqual(['You', 'Dad']);
    expect(scoreLabels(['Mia', 'Dad'], [false, false], 1)).toEqual(['You', 'Mia']);
  });
  it('playing the bot: the person reads "You" and "Bot"', () => {
    expect(scoreLabels(['Mia', 'Robo'], [false, true], 0)).toEqual(['You', 'Bot']);
    expect(scoreLabels(['Robo', 'Mia'], [true, false], 1)).toEqual(['You', 'Bot']);
  });
  it('two bots keep their names (nobody there is "You")', () => {
    expect(scoreLabels(['Bot 1', 'Bot 2'], [true, true], 0)).toEqual(['Bot 1', 'Bot 2']);
    expect(scoreLabels(['Bot 1', 'Bot 2'], [true, true], 1)).toEqual(['Bot 2', 'Bot 1']);
  });
});
