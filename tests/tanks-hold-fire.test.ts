import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { HUMAN } from '../src/core/human';
import { IDLE, RULES, TankDuel, type Intent } from '../src/games/tanks/logic';
import { DT, player } from './helpers';

// F298 (Xbox Accessibility Guideline 107): a kid can hold FIRE instead of tapping every shell.
function shotTimes(intent: (t: number) => Intent, secs = 4): number[] {
  const g = new TankDuel([player({ bot: null }), player({ bot: null })], false, makeRng(1));
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < Math.round(secs / DT); i++, t += DT) {
    g.step(DT, [intent(t), IDLE]);
    for (const e of g.events) if (e.type === 'fire' || e.type === 'dud') times.push(t);
    for (const s of g.shells) s.alive = false; // keep the shell cap out of it
  }
  return times;
}

describe('tank duel: hold FIRE', () => {
  it('holding FIRE fires again a human reaction after each reload', () => {
    expect(RULES.holdFire).toBe(HUMAN.reaction);
    const times = shotTimes((t) => ({ ...IDLE, fire: t === 0, hold: true }));
    expect(times.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(RULES.reload + RULES.holdFire - DT * 1.5);
      expect(times[i] - times[i - 1]).toBeLessThanOrEqual(RULES.reload + RULES.holdFire + DT * 2.5);
    }
  });

  it('holding is never quicker than tapping fast', () => {
    const held = shotTimes((t) => ({ ...IDLE, fire: t === 0, hold: true })).length;
    const tapped = shotTimes((t) => ({ ...IDLE, fire: Math.floor((t + DT) * 7) !== Math.floor(t * 7) })).length;
    expect(held).toBeLessThanOrEqual(tapped);
  });

  it('letting go stops the firing', () => {
    const times = shotTimes((t) => ({ ...IDLE, fire: t === 0, hold: t < 1 }));
    expect(times.every((x) => x < 1 + RULES.reload)).toBe(true);
  });
});
