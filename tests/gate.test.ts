import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { gateOpens, gateQuestion } from '../src/app/gate';

describe('parental gate', () => {
  it('opens only for the right answer', () => {
    const q = gateQuestion(makeRng(1));
    expect(gateOpens(q, String(q.a * q.b))).toBe(true);
    expect(gateOpens(q, ` ${q.a * q.b} `)).toBe(true);
    expect(gateOpens(q, String(q.a * q.b + 1))).toBe(false);
    expect(gateOpens(q, '')).toBe(false);
    expect(gateOpens(q, `${q.a}${q.b}`)).toBe(q.a * q.b === Number(`${q.a}${q.b}`));
    expect(gateOpens(q, `${q.a * q.b}.0`)).toBe(false);
  });

  it('writes the sum in words, so there are no digits to copy', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const q = gateQuestion(rng);
      expect(q.text).not.toMatch(/\d/);
      expect(q.a).toBeGreaterThanOrEqual(3);
      expect(q.b).toBeLessThanOrEqual(9);
    }
  });

  it('a wrong answer brings a different question', () => {
    const rng = makeRng(3);
    let q = gateQuestion(rng);
    for (let i = 0; i < 200; i++) {
      const n = gateQuestion(rng, q);
      expect([n.a, n.b]).not.toEqual([q.a, q.b]);
      q = n;
    }
  });
});
