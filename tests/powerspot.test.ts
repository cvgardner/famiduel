import { describe, expect, it } from 'vitest';
import { powerSpot } from '../src/engine/widgets';
import { H, W } from '../src/engine/world';

describe('corner power buttons (powerSpot)', () => {
  it('sit in each right-hander\'s left corner, seat 1 turned 180°', () => {
    expect(powerSpot(0, 40, 42, false)).toEqual([40, H - 42]);
    expect(powerSpot(1, 40, 42, false)).toEqual([W - 40, 42]);
  });
  it('move to the mirrored corner for a left-handed player', () => {
    expect(powerSpot(0, 40, 42, true)).toEqual([W - 40, H - 42]);
    expect(powerSpot(1, 40, 42, true)).toEqual([40, 42]);
  });
});
