import { describe, expect, it } from 'vitest';
import { colorDistance, HIGHLIGHT_GOLD, LOOK_ALIKE, lookAlikeFor, PLAYER_COLORS, safePair, VISIONS } from '../src/core/colors';
import { COLORS } from '../src/engine/draw';
import { Store } from '../src/app/store';

const hexes = PLAYER_COLORS.map((c) => c.hex);

describe('colour-blind safe player colours', () => {
  it('the simulation sees what colour-blind players see', () => {
    // Red and green collapse for red-green colour blindness, not for typical vision.
    expect(colorDistance('#ff0000', '#00ff00', 'typical')).toBeGreaterThan(0.5);
    expect(colorDistance('#d03030', '#6a8a00', 'deutan')).toBeLessThan(LOOK_ALIKE);
    // Grey stays grey for everyone.
    for (const v of VISIONS) expect(colorDistance('#808080', '#808080', v)).toBe(0);
    // The old palette had look-alike pairs: green/teal, blue/purple, pink/green...
    expect(lookAlikeFor('#4ade80', '#26d0ce')).toContain('tritan');
    expect(lookAlikeFor('#3fa9ff', '#b06cff')).toContain('deutan');
    expect(lookAlikeFor('#ff5c7a', '#4ade80')).toContain('deutan');
  });

  it('every pair of player colours stays apart for every kind of vision', () => {
    for (let i = 0; i < hexes.length; i++)
      for (let j = i + 1; j < hexes.length; j++)
        expect(lookAlikeFor(hexes[i], hexes[j]), `${PLAYER_COLORS[i].name} vs ${PLAYER_COLORS[j].name}`).toEqual([]);
  });

  it('no player colour looks like the gold "ready" highlight', () => {
    expect(HIGHLIGHT_GOLD).toBe(COLORS.gold);
    for (const c of PLAYER_COLORS) expect(lookAlikeFor(c.hex, HIGHLIGHT_GOLD), c.name).toEqual([]);
  });

  it('every colour has a name for screen readers', () => {
    expect(new Set(PLAYER_COLORS.map((c) => c.name)).size).toBe(PLAYER_COLORS.length);
  });

  it('old and clashing saved colours move to safe ones', () => {
    expect(safePair('#3fa9ff', '#ff5c7a')).toEqual(['#3fa9ff', '#ff5c7a']);
    expect(safePair('#4ade80', '#26d0ce')).toEqual(['#15e5b4', '#3fa9ff']); // green + teal were both mint now
    expect(safePair('#3fa9ff', '#3fa9ff')).toEqual(['#3fa9ff', '#ff5c7a']);
    expect(safePair('nonsense', '#B06CFF')).toEqual(['#3fa9ff', '#7a5cff']);
    for (const a of hexes) for (const b of hexes) expect(lookAlikeFor(...safePair(a, b))).toEqual([]);
  });

  it('a saved match night with look-alike colours loads with safe ones', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as Storage;
    const s1 = new Store(storage);
    s1.data.profiles[0].color = '#4ade80';
    s1.data.profiles[1].color = '#26d0ce';
    s1.save();
    const s2 = new Store(storage);
    expect(s2.data.profiles.map((p) => p.color)).toEqual(['#15e5b4', '#3fa9ff']);
  });
});
