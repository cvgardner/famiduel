import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { setReader, soloReader, type G } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { player } from './helpers';

/** A canvas that does nothing but record the words drawn (any other call is a no-op). */
function recorder() {
  const words: string[] = [];
  const m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const noop = () => {};
  const base: Record<string, unknown> = {
    globalAlpha: 1,
    getTransform: () => ({ ...m }),
    measureText: (s: string) => ({ width: s.length * 10 }),
    fillText: (s: string) => words.push(s),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  const g = new Proxy(base, {
    get: (t, k: string) => (k in t ? t[k] : noop),
    set: (t, k: string, v) => ((t[k] = v), true),
  });
  return { g: g as unknown as G, words };
}

function clocks(players: [PlayerInfo, PlayerInfo]): number {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.snacksnatch.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} });
  const { g, words } = recorder();
  setReader(soloReader([players[0].bot, players[1].bot]), g);
  try {
    (view as unknown as { renderClock(g: G): void }).renderClock(g);
  } finally {
    setReader(null);
  }
  const sec = String(Math.ceil((view.game as { timeLeft: number }).timeLeft));
  return words.filter((w) => w === sec).length;
}

// F160: Play the bot showed the seconds left twice beside the pot (the bot seat's copy turned
// to face the person, so two clocks; at the end two pink "0"s).
describe('Snack Snatch clock', () => {
  it('two people each read their own copy', () => {
    expect(clocks([player({ bot: null }), player({ bot: null })])).toBe(2);
  });
  it('one person and a bot: one clock, in the person\'s half', () => {
    expect(clocks([player({ bot: null }), player({ bot: 'easy' })])).toBe(1);
    expect(clocks([player({ bot: 'hard' }), player({ bot: null })])).toBe(1);
  });
  it('two bots keep both (nobody to confuse)', () => {
    expect(clocks([player({ bot: 'easy' }), player({ bot: 'easy' })])).toBe(2);
  });
});
