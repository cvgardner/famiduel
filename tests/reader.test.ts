import { afterEach, describe, expect, it } from 'vitest';
import { facing, setReader, silentSeat, soloReader, text, type G } from '../src/engine/draw';

type M = { a: number; b: number; c: number; d: number; e: number; f: number };

/** Just enough of a 2D canvas to follow transforms and record where words land. */
function fakeCanvas() {
  let m: M = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack: M[] = [];
  const drawn: { str: string; upright: boolean; align: string; x: number; y: number }[] = [];
  const mul = (n: M) => {
    m = { a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d, e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f };
  };
  const g = {
    globalAlpha: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    save: () => stack.push({ ...m }),
    restore: () => (m = stack.pop()!),
    translate: (x: number, y: number) => mul({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }),
    rotate: (t: number) => mul({ a: Math.cos(t), b: Math.sin(t), c: -Math.sin(t), d: Math.cos(t), e: 0, f: 0 }),
    getTransform: () => ({ ...m }),
    measureText: (s: string) => ({ width: s.length * 10 }),
    fillText: (str: string, x: number, y: number) => drawn.push({ str, upright: m.a > 0, align: g.textAlign, x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }),
    strokeText: () => {},
  };
  return { g: g as unknown as G, drawn };
}

afterEach(() => setReader(null));

describe('Play the bot: canvas words face the one person (F118)', () => {
  it('finds the only person at the table', () => {
    expect(soloReader([null, 'easy'])).toBe(0);
    expect(soloReader(['hard', null])).toBe(1);
    expect(soloReader([null, null])).toBe(null);
    expect(soloReader(['easy', 'hard'])).toBe(null);
  });

  it('two people: the top seat\'s words stay turned to the top', () => {
    const { g, drawn } = fakeCanvas();
    text(g, 'Top', 100, 50, { player: 1 });
    expect(drawn[0].upright).toBe(false);
  });

  it('a bot on top: its labels, and words inside its turned half, read upright for the bottom person', () => {
    const { g, drawn } = fakeCanvas();
    setReader(0, g);
    text(g, 'Score', 20, 30, { player: 1, align: 'left' });
    facing(g, 1, 180, 320, () => text(g, 'Half label', 180, 100));
    text(g, 'Mine', 180, 600, { player: 0 });
    expect(drawn.map((d) => d.upright)).toEqual([true, true, true]);
    // A left-aligned label turned about its anchor keeps its span: the anchor is its right end now.
    expect(drawn[0].align).toBe('right');
    expect(drawn[0].x).toBeCloseTo(20);
    // The turned half's label stays in the top half, where the bot's half is.
    expect(drawn[1].y).toBeCloseTo(2 * 320 - 100);
  });

  it('a person on top, bot below: every word faces the top', () => {
    const { g, drawn } = fakeCanvas();
    setReader(1, g);
    text(g, 'Bot score', 20, 600, { player: 0 });
    text(g, 'Mine', 180, 40, { player: 1 });
    expect(drawn.map((d) => d.upright)).toEqual([false, false]);
  });

  it('a bot facing a person gets no words addressed to "you" (F120)', () => {
    expect(silentSeat([{ bot: null }, { bot: 'easy' }], 1)).toBe(true);
    expect(silentSeat([{ bot: null }, { bot: 'easy' }], 0)).toBe(false);
    expect(silentSeat([{ bot: 'hard' }, { bot: null }], 0)).toBe(true);
    expect(silentSeat([{ bot: 'easy' }, { bot: 'easy' }], 0)).toBe(false);
    expect(silentSeat([{ bot: null }, { bot: null }], 1)).toBe(false);
  });

  it('a banner both seats draw shows once: the bot\'s copy is skipped, scores and small lines stay (F123)', () => {
    const { g, drawn } = fakeCanvas();
    setReader(0, g);
    text(g, 'Round 2', 180, 200, { player: 1, size: 30 });
    text(g, 'Round 2', 180, 440, { player: 0, size: 30 });
    // Next frame, the bot's copy comes first: last frame's person copy still counts.
    setReader(0, g);
    text(g, 'Round 2', 180, 200, { player: 1, size: 30 });
    text(g, 'Round 2', 180, 440, { player: 0, size: 30 });
    // Scores (no letters), small status lines and words only the bot drew still show.
    text(g, '3', 40, 40, { player: 1, size: 30 });
    text(g, '3', 40, 600, { player: 0, size: 30 });
    text(g, 'In the hole', 40, 60, { player: 1, size: 14 });
    text(g, 'In the hole', 40, 580, { player: 0, size: 14 });
    text(g, 'Bot wins the round!', 180, 200, { player: 1, size: 30 });
    expect(drawn.map((d) => `${d.str}@${Math.round(d.y)}`)).toEqual([
      // Frame 1: the bot's copy came before the person's, so both drew this once.
      'Round 2@200', 'Round 2@440',
      'Round 2@440',
      '3@40', '3@600', 'In the hole@60', 'In the hole@580', 'Bot wins the round!@200',
    ]);
  });
});
