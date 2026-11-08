import { describe, expect, it } from 'vitest';
import { Fx, POP_FRESH, popProbe } from '../src/engine/fx';
import { H, MID } from '../src/engine/world';

type Floater = { str: string; y: number; size: number; player: 0 | 1 };
const floaters = (fx: Fx) => (fx as unknown as { floaters: Floater[] }).floaters;

describe('pops born together stack (F150)', () => {
  it('a second pop on the same spot moves a line down in that seat\'s view', () => {
    const fx = new Fx();
    fx.pop('⏳ Slow Time!', 180, MID + 222, '#fff', 0, 22);
    fx.pop('🎯 they used Double Shot', 180, MID + 222, '#fff', 0, 15);
    fx.pop('⏳ Slow Time!', 180, MID - 222, '#fff', 1, 22);
    fx.pop('🎯 they used Double Shot', 180, MID - 222, '#fff', 1, 15);
    const [a, b, c, d] = floaters(fx);
    // Seat 0 reads down the screen, seat 1 (turned) up it.
    expect(b.y - a.y).toBeGreaterThanOrEqual((22 + 15) / 2);
    expect(c.y - d.y).toBeGreaterThanOrEqual((22 + 15) / 2);
  });

  it('three at once make three lines, and nothing moves for the other seat', () => {
    const fx = new Fx();
    fx.pop('+1', 100, 400, '#fff', 0, 22);
    fx.pop('+3 ×2!', 100, 400, '#fff', 0, 22);
    fx.pop('+1 ×3!', 100, 400, '#fff', 0, 22);
    fx.pop('+1', 100, 400, '#fff', 1, 22);
    expect(floaters(fx).map((f) => f.y)).toEqual([400, 426, 452, 400]);
  });
});

// F184: Snack Snatch (Play the bot) printed "+3 ×3!" over the "×2!" of a catch a few frames
// earlier: only pops born in the same step stacked.
describe('a pop a moment later stacks too, until the first one fades (F184)', () => {
  for (const player of [0, 1] as const) {
    it(`seat ${player}: by a still-bright pop it takes the line above (into the field); over a fading one it lands where asked`, () => {
      const fx = new Fx();
      const y = player === 0 ? 400 : 240;
      const down = player === 0 ? 1 : -1;
      fx.pop('+2 ×2!', 100, y, '#fff', player, 22);
      for (let i = 0; i < 8; i++) fx.update(1 / 60);
      popProbe.hits = [];
      popProbe.on = true;
      fx.pop('+3 ×3!', 100, y, '#fff', player, 22);
      popProbe.on = false;
      expect(popProbe.hits).toEqual([]);
      const [first, second] = floaters(fx);
      // A line above in that seat's view: away from its own edge, where its pieces sit.
      expect((first.y - second.y) * down).toBeGreaterThanOrEqual(22);
      // Long after (the first has mostly faded) a new pop takes its own spot.
      const late = new Fx();
      late.pop('+1', 100, y, '#fff', player, 22);
      for (let t = 0; t < POP_FRESH + 0.05; t += 1 / 60) late.update(1 / 60);
      const at = floaters(late)[0].y; // right on top of the fading one
      late.pop('+1', 100, at, '#fff', player, 22);
      expect(floaters(late)[1].y).toBe(at);
    });
  }

  it('stays on screen at the edge, and the probe finds no pops on top of each other', () => {
    const fx = new Fx();
    popProbe.hits = [];
    popProbe.on = true;
    fx.pop('GOAL!', 180, H - 10, '#fff', 0, 40);
    fx.pop('🧊 Freeze!', 180, H - 10, '#fff', 0, 26);
    popProbe.on = false;
    for (const f of floaters(fx)) expect(f.y).toBeLessThanOrEqual(H - f.size / 2);
    // At the very bottom there is no line below: the newer pop goes a line above instead.
    expect(popProbe.hits).toEqual([]);
    expect(floaters(fx)[1].y).toBeLessThan(floaters(fx)[0].y);
  });
});
