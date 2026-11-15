import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { setReader, type G } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { player } from './helpers';

/** A canvas that logs each word drawn. */
function words() {
  const out: string[] = [];
  const noop = () => {};
  const base: Record<string, unknown> = {
    globalAlpha: 1,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: (s: string) => ({ width: s.length * 10 }),
    fillText: (str: string) => out.push(str),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  const g = new Proxy(base, {
    get: (t, k: string) => (k in t ? t[k] : noop),
    set: (t, k: string, v) => ((t[k] = v), true),
  });
  return { g: g as unknown as G, out };
}

function viewAt(timeLeft: number) {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.snacksnatch.create({ seed: 1, rng: makeRng(1), players: [player(), player()], powersOn: false, sfx, fx: new Fx(), end() {} });
  const game = view.game as { timeLeft: number; score: [number, number] };
  game.timeLeft = timeLeft;
  game.score = [3, 5];
  const { g, out } = words();
  setReader(null, g);
  view.render(g);
  return out;
}

// F266: once time ran out the seconds-left beside the pot stayed a red "0" in the field next
// to the bowl, which read like a third score. The clock goes blank at 0.
describe('Snack Snatch clock when time is up', () => {
  it('shows no "0" once time has run out', () => {
    expect(viewAt(0)).not.toContain('0');
    expect(viewAt(-0.2)).not.toContain('0');
  });
  it('still shows the last second in both halves', () => {
    expect(viewAt(0.4).filter((w) => w === '1')).toHaveLength(2);
  });
});
