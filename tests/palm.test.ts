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
