import { describe, expect, it } from 'vitest';
import { Energy, ENERGY } from '../src/core/energy';
import { effectiveAssist, lerpAssist } from '../src/core/handicap';
import { hashSeed, makeRng } from '../src/core/rng';
import games from '../content/games.json';
import powers from '../content/powers.json';
import { Store } from '../src/app/store';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
    expect(hashSeed('daily-2026-10-30')).toBe(hashSeed('daily-2026-10-30'));
  });
});

describe('energy', () => {
  it('fills faster with assist and when trailing, caps at 1, spends only when full', () => {
    const plain = new Energy(0);
    const helped = new Energy(2);
    plain.charge(0.1);
    helped.charge(0.1, true);
    expect(plain.value).toBeCloseTo(0.1);
    expect(helped.value).toBeCloseTo(0.1 * (1 + 2 * ENERGY.assistBonus + ENERGY.trailingBonus));
    expect(plain.spend()).toBe(false);
    plain.charge(5);
    expect(plain.value).toBe(1);
    expect(plain.spend(2)).toBe(true);
    expect(plain.value).toBe(0);
    plain.tick(1.5);
    expect(plain.active).toBeCloseTo(0.5);
  });
});

describe('handicap', () => {
  it('adds catch-up for the trailing player only, capped at 3', () => {
    expect(effectiveAssist([0, 1], [4, 1], true, 1)).toBe(3);
    expect(effectiveAssist([0, 1], [4, 1], true, 0)).toBe(0);
    expect(effectiveAssist([0, 1], [4, 1], false, 1)).toBe(1);
    expect(lerpAssist(0, 10, 40)).toBe(10);
    expect(lerpAssist(3, 10, 40)).toBe(40);
    expect(lerpAssist(9, 10, 40)).toBe(40);
  });
});

describe('content', () => {
  it('every game has a unique id, and powers only reference known games, 3 each', () => {
    const ids = games.games.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [game, list] of Object.entries(powers.games)) {
      expect(ids).toContain(game);
      expect(list).toHaveLength(3);
      expect(new Set(list.map((p) => p.id)).size).toBe(3);
    }
  });
});

describe('store', () => {
  it('records results into the night and history', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as Storage;
    const s = new Store(storage);
    s.record('airhockey', { winner: 1, score: [3, 5] }, ['freeze', null]);
    expect(s.data.night.wins).toEqual([0, 1]);
    const again = new Store(storage);
    expect(again.data.history).toHaveLength(1);
    again.newNight();
    expect(again.data.night.games).toHaveLength(0);
  });
});

describe('button', () => {
  it('counts a tap that lands and lifts within one frame', async () => {
    const { Input } = await import('../src/engine/input');
    const { Button } = await import('../src/engine/widgets');
    const input = new Input();
    const b = new Button(100, 500, 30, 0);
    input.down(1, 100, 500);
    input.up(1);
    b.update(input);
    expect(b.pressed).toBe(true);
    input.endFrame();
    b.update(input);
    expect(b.released).toBe(true);
    expect(b.held).toBe(false);
  });
});
