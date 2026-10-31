import { describe, expect, it } from 'vitest';
import { SECRET, SecretTurns } from '../src/engine/secret';

const run = (s: SecretTurns, secs: number, tapped = false) => {
  for (let t = 0; t < secs; t += 0.05) s.update(0.05, tapped);
};

describe('pass-and-play secret turns', () => {
  it('cover → secret → locked → other cover → reveal', () => {
    const s = new SecretTurns();
    s.start(1);
    expect(s.step).toMatchObject({ kind: 'cover', p: 1 });
    expect(s.picking).toBeNull();
    run(s, SECRET.coverGuard + 0.1); // no tap: the cover stays
    expect(s.step?.kind).toBe('cover');
    expect(s.update(0.05, true)).toBe(true);
    expect(s.picking).toBe(1);
    s.lock(1);
    expect(s.step).toMatchObject({ kind: 'locked', p: 1 });
    run(s, SECRET.locked + 0.1);
    expect(s.step).toMatchObject({ kind: 'cover', p: 0 });
    s.update(SECRET.coverGuard, true);
    s.lock(0);
    run(s, SECRET.locked + 0.1);
    expect(s.step).toBeNull();
    expect(s.revealed).toBe(true);
    expect(s.moved).toEqual([true, true]);
  });

  it('a tap right as the cover appears does not lift it (the last finger lifting)', () => {
    const s = new SecretTurns();
    s.start(0);
    s.update(0.05, true);
    expect(s.step?.kind).toBe('cover');
  });

  it('only the player the screen faces can lock in, and only while picking', () => {
    const s = new SecretTurns();
    s.start(0);
    s.lock(0); // still covered
    expect(s.moved).toEqual([false, false]);
    s.update(1, true);
    s.lock(1); // wrong seat
    expect(s.moved).toEqual([false, false]);
    s.lock(0);
    expect(s.moved).toEqual([true, false]);
  });

  it('start() resets the round', () => {
    const s = new SecretTurns();
    s.start(0);
    s.update(1, true);
    s.lock(0);
    s.start(1);
    expect(s.moved).toEqual([false, false]);
    expect(s.step).toMatchObject({ kind: 'cover', p: 1 });
  });
});
