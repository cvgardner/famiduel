import { afterEach, describe, expect, it } from 'vitest';
import { BIG_TEXT, fitSize, MIN_TEXT, scaledSize, setTextScale, type G } from '../src/engine/draw';
import { TIME_W, timeLine } from '../src/games/quickdraw/index';

// F263: a seat that never drew read "You —" on the round card (solo-round-quickdraw.png);
// a young kid won't read a dash.
describe('Quick Draw round card: no-shot words', () => {
  afterEach(() => setTextScale(1));

  it('says "no shot" in words, keeps the time otherwise', () => {
    expect(timeLine('You', null)).toBe('You: no shot');
    expect(timeLine('Bot', null)).toBe('Bot: no shot');
    expect(timeLine('Them', null)).toBe('Them: no shot');
    expect(timeLine('You', 0.4204)).toBe('You 420 ms');
    for (const who of ['You', 'Bot', 'Them']) expect(timeLine(who, null)).not.toMatch(/—/);
  });

  // A wide system font: about 0.62 em a character at weight 800.
  const fake: { font: string; measureText(s: string): { width: number } } = {
    font: '',
    measureText(s: string) {
      const px = Number(/(\d+(?:\.\d+)?)px/.exec(fake.font)?.[1] ?? 10);
      return { width: [...s].length * 0.62 * px };
    },
  };
  const gx = fake as unknown as G;

  for (const scale of [1, BIG_TEXT]) {
    it(`each line fits its half of the card (text scale ${scale})`, () => {
      setTextScale(scale);
      for (const who of ['You', 'Bot', 'Them']) {
        for (const t of [null, 0.999]) {
          const str = timeLine(who, t);
          const size = fitSize(gx, str, TIME_W, 17);
          expect(size).toBeGreaterThanOrEqual(MIN_TEXT);
          expect([...str].length * 0.62 * scaledSize(size), str).toBeLessThanOrEqual(TIME_W);
        }
      }
    });
  }
});
