import { describe, expect, it } from 'vitest';
import { Input, LANDING_AGE } from '../src/engine/input';

// Bottom half of the 360x640 world belongs to player 0.
const frames = (inp: Input, n: number, each?: () => void) => {
  for (let i = 0; i < n; i++) {
    each?.();
    inp.endFrame();
  }
};

describe('a resting palm never takes the paddle (F100)', () => {
  it('palm resting first: a finger that lands and drags steers', () => {
    const inp = new Input();
    inp.down(1, 40, 600); // palm by the corner
    frames(inp, 60);
    inp.down(2, 180, 520); // the playing finger
    expect(inp.steering(0)?.id).toBe(2);
    let x = 180;
    frames(inp, 30, () => inp.move(2, (x += 4), 520));
    expect(inp.steering(0)?.id).toBe(2);
  });

  it('palm landing mid-rally: the finger that is dragging keeps the paddle', () => {
    const inp = new Input();
    inp.down(2, 180, 520);
    let x = 180;
    frames(inp, 20, () => inp.move(2, (x += 4), 520));
    inp.down(1, 40, 600); // palm lands while the finger plays
    expect(inp.steering(0)?.id).toBe(2);
    frames(inp, LANDING_AGE + 30, () => {
      inp.move(2, (x -= 3), 520);
      inp.move(1, 40.5, 600.5); // palm jitter below MOVE_STEP
    });
    expect(inp.steering(0)?.id).toBe(2);
  });

  it('when the playing finger stops for a beat, a fresh finger still takes over', () => {
    const inp = new Input();
    inp.down(2, 180, 520);
    frames(inp, LANDING_AGE + 5);
    inp.down(3, 260, 560);
    expect(inp.steering(0)?.id).toBe(3);
  });

  it('a palm that starts sliding takes the paddle (it is steering now)', () => {
    const inp = new Input();
    inp.down(2, 180, 520);
    inp.down(1, 40, 600);
    frames(inp, 30);
    inp.move(1, 60, 600);
    expect(inp.steering(0)?.id).toBe(1);
  });

  it('skips rejected fingers and the other seat', () => {
    const inp = new Input();
    inp.down(1, 40, 600);
    inp.down(2, 180, 100); // top seat
    expect(inp.steering(0, (p) => p.id === 1)).toBeUndefined();
    expect(inp.steering(1)?.id).toBe(2);
  });
});

describe('a resting palm never takes the Tank Duel stick (F105)', () => {
  it('palm in the stick zone first: the thumb that lands takes the stick', () => {
    const inp = new Input();
    inp.down(1, 20, 630); // palm
    frames(inp, 30);
    let held = inp.holding(0, null)?.id ?? null;
    expect(held).toBe(1);
    inp.down(2, 78, 584); // thumb lands on the stick
    held = inp.holding(0, held)?.id ?? null;
    expect(held).toBe(2);
    let x = 78;
    frames(inp, 20, () => {
      inp.move(2, (x += 2), 584);
      held = inp.holding(0, held)?.id ?? null;
    });
    expect(held).toBe(2);
  });

  it('a thumb holding the stick still keeps it when a palm lands', () => {
    const inp = new Input();
    inp.down(2, 78, 584);
    let held: number | null = null;
    frames(inp, 4, () => {
      inp.move(2, 110, 584); // push right, then hold
      held = inp.holding(0, held)?.id ?? null;
    });
    frames(inp, 60, () => {
      held = inp.holding(0, held)?.id ?? null;
    });
    inp.down(1, 20, 630); // palm lands
    frames(inp, 60, () => {
      inp.move(1, 20.5, 630.5); // palm jitter
      held = inp.holding(0, held)?.id ?? null;
    });
    expect(held).toBe(2);
  });

  it('when the holder lifts, another finger down takes over; skip rejects fingers', () => {
    const inp = new Input();
    inp.down(1, 20, 630);
    inp.down(2, 78, 584);
    inp.move(2, 100, 584);
    let held = inp.holding(0, null)?.id ?? null;
    expect(held).toBe(2);
    inp.up(2);
    held = inp.holding(0, held)?.id ?? null;
    expect(held).toBe(1);
    expect(inp.holding(0, held, (p) => p.id === 1)).toBeUndefined();
  });
});
