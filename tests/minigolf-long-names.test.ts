import { afterEach, describe, expect, it } from 'vitest';
import { setTextScale, type G } from '../src/engine/draw';
import { fitName, nameWidth } from '../src/games/minigolf/index';

// A canvas whose words are 0.6 of their font size per letter (W is wider: 0.9).
function fakeCanvas(): G {
  const g = { font: '', measureText: (s: string) => {
    const px = Number(/(\d+(\.\d+)?)px/.exec(g.font)![1]);
    return { width: [...s].reduce((a, ch) => a + px * (ch === 'W' ? 0.9 : 0.6), 0) };
  } };
  return g as unknown as G;
}

// F315: a 12-letter name ran under Minigolf's "Hole" header and out of the "<name>'s shot"
// card with Bigger text on a 320 px phone.
describe('Minigolf fits long names', () => {
  afterEach(() => setTextScale(1));
  it('a name that fits is left alone', () => {
    const g = fakeCanvas();
    expect(fitName(g, 'Mia', 150, 17)).toEqual({ str: 'Mia', size: 17 });
  });
  it('a longer name shrinks before it is cut', () => {
    const g = fakeCanvas();
    const r = fitName(g, 'Grandma Jose', 110, 17);
    expect(r.str).toBe('Grandma Jose');
    expect(r.size).toBeLessThan(17);
    expect(nameWidth(g, r.str, r.size)).toBeLessThanOrEqual(110);
  });
  it('12 W\'s with Bigger text are cut with "…", keeping the tail, inside the room', () => {
    setTextScale(1.2);
    const g = fakeCanvas();
    for (const [str, room, tail] of [['WWWWWWWWWWWW', 150, ''], ["WWWWWWWWWWWW's shot", 200, "'s shot"]] as const) {
      const r = fitName(g, str, room, 17, tail);
      expect(r.str.endsWith(`…${tail}`), r.str).toBe(true);
      expect(nameWidth(g, r.str, r.size)).toBeLessThanOrEqual(room);
      expect(r.str.length).toBeGreaterThan(tail.length + 4);
    }
  });
});
