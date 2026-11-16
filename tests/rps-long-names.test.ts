import { afterEach, describe, expect, it } from 'vitest';
import { BIG_TEXT, MIN_TEXT, fitFirst, scaledSize, setTextScale, type G } from '../src/engine/draw';
import { ROOM, nextLines, pickLines, scoreLines } from '../src/games/rps/index';

// A canvas whose words measure like a bold system font: ~0.62 em a letter, a wide W ~0.95 em.
function fakeG(): G & { measureText(s: string): { width: number } } {
  const g = { font: '' } as Record<string, unknown>;
  g.measureText = (s: string) => {
    const px = Number(/(\d+(\.\d+)?)px/.exec(g.font as string)![1]);
    return { width: [...s].reduce((w, c) => w + (c === 'W' ? 0.95 : c === ' ' ? 0.3 : 0.62) * px, 0) };
  };
  return g as unknown as G & { measureText(s: string): { width: number } };
}

const LONG = 'WWWWWWWWWWWW';
const cases: [string, string[], number, number][] = [
  ['heading', pickLines(LONG), 24, 800],
  ['picked line', nextLines(LONG, true), 14, 700],
  ['picks-next line', nextLines(LONG, false), 14, 700],
  ['score', scoreLines(LONG, LONG, 2, 1), 16, 700],
];

describe('F319: Rock Paper Scissors pass-and-play lines fit 12-letter names', () => {
  afterEach(() => setTextScale(1));
  for (const scale of [1, BIG_TEXT]) {
    for (const [what, lines, size, weight] of cases) {
      it(`${what} fits the screen (text scale ${scale})`, () => {
        setTextScale(scale);
        const g = fakeG();
        const got = fitFirst(g, lines, ROOM, size, weight);
        expect(got.size).toBeGreaterThanOrEqual(MIN_TEXT);
        g.font = `${weight} ${scaledSize(got.size)}px x`;
        expect(g.measureText(got.str).width, got.str).toBeLessThanOrEqual(ROOM);
      });
    }
  }
  it('short names keep the full wording at full size', () => {
    setTextScale(BIG_TEXT);
    const g = fakeG();
    expect(fitFirst(g, pickLines('Mia'), ROOM, 24)).toEqual({ str: 'Mia, pick in secret', size: 24 });
    expect(fitFirst(g, scoreLines('Mia', 'Dad', 1, 0), ROOM, 16, 700)).toEqual({ str: 'Mia 1 – 0 Dad', size: 16 });
  });
  it('the old fixed lines ran off a 320 px screen with Bigger text', () => {
    setTextScale(BIG_TEXT);
    const g = fakeG();
    g.font = `700 ${16 * BIG_TEXT}px x`;
    expect(g.measureText(scoreLines(LONG, LONG, 0, 0)[0]).width).toBeGreaterThan(ROOM);
  });
});
