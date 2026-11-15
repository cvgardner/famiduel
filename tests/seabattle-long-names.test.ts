import { afterEach, describe, expect, it } from 'vitest';
import { BIG_TEXT, fitFirst, scaledSize, setTextScale, type G } from '../src/engine/draw';
import { noticeLines } from '../src/games/seabattle/index';

// A canvas whose words measure like a bold system font: ~0.62 em a letter, a wide W ~0.95 em.
function fakeG(): G & { measureText(s: string): { width: number } } {
  const g = { font: '' } as Record<string, unknown>;
  g.measureText = (s: string) => {
    const px = Number(/(\d+(\.\d+)?)px/.exec(g.font as string)![1]);
    return { width: [...s].reduce((w, c) => w + (c === 'W' ? 0.95 : c === ' ' ? 0.3 : 0.62) * px, 0) };
  };
  return g as unknown as G & { measureText(s: string): { width: number } };
}

// F321: "💥 <12-letter name> hid a mine somewhere in their sea!" ran off a 320 px screen with
// Bigger text (cover note size 14, play note size 13 in a pill W - 24 wide).
describe('Sea Battle notices fit 12-letter names', () => {
  afterEach(() => setTextScale(1));
  for (const kind of ['scan', 'mine'] as const) {
    for (const [room, size] of [[360 - 24, 14], [360 - 40, 13]]) {
      it(`${kind} notice fits ${room} units at size ${size} with Bigger text`, () => {
        setTextScale(BIG_TEXT);
        const g = fakeG();
        const lines = noticeLines(kind, 'WWWWWWWWWWWW');
        g.font = `700 ${scaledSize(size)}px x`;
        if (kind === 'mine') expect(g.measureText(lines[0]).width, 'the old line did not fit').toBeGreaterThan(room);
        const got = fitFirst(g, lines, room, size, 700);
        g.font = `700 ${scaledSize(got.size)}px x`;
        expect(g.measureText(got.str).width).toBeLessThanOrEqual(room);
      });
    }
  }
  it('short names keep the full notice at usual text size', () => {
    setTextScale(1);
    const g = fakeG();
    expect(fitFirst(g, noticeLines('mine', 'Mia'), 360 - 24, 14, 700).str).toBe('💥 Mia hid a mine somewhere in their sea!');
  });
});
