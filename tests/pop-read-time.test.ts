import { describe, expect, it } from 'vitest';
import { Fx, POP_LIFE, POP_RISE, READ_PER_WORD, popLife } from '../src/engine/fx';

type Floater = { str: string; y: number; life: number; max: number };
const floaters = (fx: Fx) => (fx as unknown as { floaters: Floater[] }).floaters;
const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

// F306: every pop lived 0.9 s, so "What a rally! 12 hits" flashed by at ~330 words a minute.
describe('pops stay long enough to read', () => {
  const samples = ['GOAL!', 'Your point!', '+3 ×2!', '🛡️ Branch Shield!', "Super Robot's point", 'What a rally! 12 hits', 'Ouch! Next round in a moment'];
  it('short pops keep 0.9 s; every pop gets at least 0.4 s a word', () => {
    expect(popLife('GOAL!')).toBe(POP_LIFE);
    expect(popLife('Your point!')).toBe(POP_LIFE);
    expect(popLife('🛡️ Shield!')).toBe(POP_LIFE);
    for (const s of samples) expect(popLife(s), s).toBeGreaterThanOrEqual(words(s) * READ_PER_WORD - 1e-9);
  });
  it('a long pop rises the same distance as a short one, just slower', () => {
    for (const s of samples) {
      const fx = new Fx();
      fx.pop(s, 180, 400, '#fff', 0, 22);
      const y0 = floaters(fx)[0].y;
      let last = y0;
      for (let t = 0; t < 5 && floaters(fx).length; t += 1 / 60) {
        last = floaters(fx)[0].y;
        fx.update(1 / 60);
      }
      expect(y0 - last, s).toBeLessThanOrEqual(POP_RISE + 1);
      expect(y0 - last, s).toBeGreaterThan(POP_RISE - 2);
    }
  });
  it('a long pop stays bright for its extra reading time: a new pop beside it still moves off it', () => {
    const fx = new Fx();
    fx.pop('What a rally! 12 hits', 180, 400, '#fff', 0, 22);
    for (let i = 0; i < 60; i++) fx.update(1 / 60); // 1 s: a 0.9 s pop would be gone
    expect(fx.popFits('Wow!', 180, floaters(fx)[0].y, 22, 0)).toBe(false);
  });
});
