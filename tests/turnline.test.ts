import { describe, expect, it } from 'vitest';
import { shortName, waitingLine } from '../src/core/turnline';
import { fitSize, MIN_TEXT, type G } from '../src/engine/draw';

describe('waiting line (board games)', () => {
  it('says Waiting… while a person moves', () => {
    expect(waitingLine({ name: 'Mum', bot: null })).toBe('Waiting…');
    expect(waitingLine({ name: 'Mum' })).toBe('Waiting…');
  });
  it("names the bot while it thinks, so its pause isn't a stuck game", () => {
    expect(waitingLine({ name: 'Player 2', bot: 'normal' })).toBe('🤖 Player 2 is thinking…');
  });
  it('shortens long names the same way as the countdown', () => {
    expect(shortName('Grandma Rosalind')).toBe('Grandma Ros…');
    expect(shortName('Grandma Rose')).toBe('Grandma Rose');
    expect(waitingLine({ name: 'Grandma Rosalind', bot: 'easy' })).toBe('🤖 Grandma Ros… is thinking…');
  });
});

describe('fitSize', () => {
  // A canvas whose text is 0.6 of the font size wide per character.
  const fake = () => {
    const g = { font: '', measureText: (s: string) => ({ width: [...s].length * 0.6 * Number(/(\d+)px/.exec(g.font)![1]) }) };
    return g as unknown as G & { font: string };
  };
  it('keeps the size when the words fit', () => {
    expect(fitSize(fake(), 'Waiting…', 186, 17, 700)).toBe(17);
  });
  it('shrinks a long line until it fits, never below MIN_TEXT', () => {
    const line = '🤖 Player 2 is thinking…';
    const s = fitSize(fake(), line, 186, 17, 700);
    expect(s).toBeLessThan(17);
    expect([...line].length * 0.6 * s).toBeLessThanOrEqual(186);
    expect(fitSize(fake(), 'x'.repeat(80), 186, 17)).toBe(MIN_TEXT);
  });
});
