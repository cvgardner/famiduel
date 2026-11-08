import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { setReader, type G } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { MID, W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { RULES, type Snack } from '../src/games/snacksnatch/logic';
import { player } from './helpers';

/** A canvas that logs, in order, each word drawn and each fill (with the last arc's centre). */
function sequence() {
  const ops: { kind: 'fill' | 'word'; str?: string; x: number; y: number }[] = [];
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack: (typeof m)[] = [];
  let at = { x: 0, y: 0 };
  const noop = () => {};
  const mul = (n: typeof m) => {
    m = { a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d, e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f };
  };
  const base: Record<string, unknown> = {
    globalAlpha: 1,
    save: () => stack.push({ ...m }),
    restore: () => (m = stack.pop() ?? m),
    translate: (x: number, y: number) => mul({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }),
    rotate: (t: number) => mul({ a: Math.cos(t), b: Math.sin(t), c: -Math.sin(t), d: Math.cos(t), e: 0, f: 0 }),
    getTransform: () => ({ ...m }),
    measureText: (s: string) => ({ width: s.length * 10 }),
    arc: (x: number, y: number) => (at = { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }),
    fill: () => ops.push({ kind: 'fill', ...at }),
    fillText: (str: string, x: number, y: number) => ops.push({ kind: 'word', str, x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  const g = new Proxy(base, {
    get: (t, k: string) => (k in t ? t[k] : noop),
    set: (t, k: string, v) => ((t[k] = v), true),
  });
  return { g: g as unknown as G, ops };
}

// F182: a snack that rolled to a stop beside the pot covered that seat's seconds-left (the
// bottom seat's "20" sat under two candies in a bot match). The numbers now draw over snacks.
describe('Snack Snatch seconds-left', () => {
  const spots = [
    { p: 0, x: W / 2 + 74, y: MID + 14 },
    { p: 1, x: W / 2 - 74, y: MID - 14 },
  ];
  for (const spot of spots) {
    it(`a snack resting on seat ${spot.p}'s clock doesn't hide it`, () => {
      const sfx = { play() {} } as unknown as Sfx;
      const view = GAMES.snacksnatch.create({ seed: 1, rng: makeRng(1), players: [player(), player()], powersOn: false, sfx, fx: new Fx(), end() {} });
      const game = view.game as { snacks: Snack[]; timeLeft: number };
      game.snacks.push({ id: 999, x: spot.x, y: spot.y, vx: 0, vy: 0, gold: false, r: RULES.snackR, alive: true, kind: 4 });
      const { g, ops } = sequence();
      setReader(null, g);
      view.render(g);
      const sec = String(Math.ceil(game.timeLeft));
      const near = (o: { x: number; y: number }) => Math.hypot(o.x - spot.x, o.y - spot.y) < 30;
      const word = ops.findIndex((o) => o.kind === 'word' && o.str === sec && near(o));
      expect(word).toBeGreaterThan(-1);
      const snackFills = ops.map((o, i) => (o.kind === 'fill' && Math.hypot(o.x - spot.x, o.y - spot.y) <= RULES.snackR + 4 ? i : -1)).filter((i) => i >= 0);
      expect(snackFills.length).toBeGreaterThan(0);
      expect(word).toBeGreaterThan(Math.max(...snackFills));
    });
  }
  it('its digits cover at most a sliver of a snack a critter could gulp (even at full head start)', () => {
    // A critter gulps a snack whose centre is within headR + snackR of its head at full reach;
    // the digits may overlap such a snack's edge, never its centre.
    const gulp = RULES.reachMax + RULES.headR + RULES.goldR;
    const half = 36 / 2; // the biggest (last-5-seconds) digits
    expect(RULES.gum[0] + RULES.restBack - gulp).toBeGreaterThanOrEqual(MID + 14 + half - RULES.snackR);
    expect(RULES.gum[1] - RULES.restBack + gulp).toBeLessThanOrEqual(MID - 14 - half + RULES.snackR);
  });
});
