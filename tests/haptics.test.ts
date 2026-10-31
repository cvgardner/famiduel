import { describe, expect, it } from 'vitest';
import { Haptics, HAPTICS, MIN_GAP_MS } from '../src/engine/haptics';
import { Sfx } from '../src/engine/sfx';
import { Store } from '../src/app/store';

function rig() {
  const calls: (number | number[])[] = [];
  let t = 1000;
  const h = new Haptics((p) => (calls.push(p), true), () => t);
  return { h, calls, advance: (ms: number) => (t += ms) };
}

describe('haptics', () => {
  it('buzzes for hits, goals and the win, not for taps or countdown beeps', () => {
    const { h, calls, advance } = rig();
    for (const n of ['tap', 'click', 'count', 'go', 'bounce', 'whoosh'] as const) {
      expect(h.feel(n)).toBe(false);
      advance(200);
    }
    expect(calls).toEqual([]);
    for (const n of ['hit', 'thud', 'score', 'win', 'buzz'] as const) {
      expect(h.feel(n)).toBe(true);
      advance(200);
    }
    expect(calls).toEqual([HAPTICS.hit, HAPTICS.thud, HAPTICS.score, HAPTICS.win, HAPTICS.buzz]);
  });

  it('every pattern is short (a tick, never a long rumble)', () => {
    for (const p of Object.values(HAPTICS)) {
      const total = ([] as number[]).concat(p!).reduce((a, b) => a + b, 0);
      expect(total).toBeLessThanOrEqual(400);
    }
  });

  it('drops small buzzes closer than the gap, but never a goal or the win', () => {
    const { h, calls, advance } = rig();
    expect(h.feel('hit')).toBe(true);
    advance(MIN_GAP_MS - 10);
    expect(h.feel('hit')).toBe(false);
    expect(h.feel('score')).toBe(true);
    expect(h.feel('win')).toBe(true);
    advance(MIN_GAP_MS);
    expect(h.feel('hit')).toBe(true);
    expect(calls.length).toBe(4);
  });

  it('does nothing when turned off or when the device cannot vibrate', () => {
    const { h, calls } = rig();
    h.enabled = false;
    expect(h.feel('win')).toBe(false);
    expect(calls).toEqual([]);
    const none = new Haptics(null);
    expect(none.supported).toBe(false);
    expect(none.feel('win')).toBe(false);
  });

  it('a throwing vibrate call never breaks the game', () => {
    const h = new Haptics(() => {
      throw new Error('blocked');
    });
    expect(h.feel('hit')).toBe(false);
  });

  it('sound playback triggers the haptic even when sound is muted', () => {
    const { h, calls } = rig();
    const sfx = new Sfx(h);
    sfx.muted = true;
    sfx.play('score');
    expect(calls).toEqual([HAPTICS.score]);
  });
});

describe('store settings migration', () => {
  it('an older save without the vibration setting keeps the default (on) and its other choices', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    } as unknown as Storage;
    mem.set('famiduel.v1', JSON.stringify({ settings: { powers: false, autoHandicap: true, sound: false } }));
    const s = new Store(storage);
    expect(s.data.settings).toEqual({ powers: false, autoHandicap: true, sound: false, haptics: true });
  });
});
