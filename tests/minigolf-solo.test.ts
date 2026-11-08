import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { setReader, soloReader } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

/** For each strip (top, bottom): does "Hole" come before "Total" for the person reading it? */
function columns(players: [PlayerInfo, PlayerInfo]): { top: boolean; bottom: boolean } {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.minigolf.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} });
  const { g, words } = recorder();
  const reader = soloReader([players[0].bot, players[1].bot]);
  setReader(reader, g);
  try {
    view.render(g);
  } finally {
    setReader(null);
  }
  const at = (str: string, bottom: boolean) => words.filter((w) => w.str === str && w.y > 320 === bottom);
  const order = (bottom: boolean) => {
    const [h] = at('Hole', bottom);
    const [t] = at('Total', bottom);
    expect(h && t).toBeTruthy();
    // Seat 0 (bottom) reads left to right; seat 1 (top) reads from the far side, right to left.
    // Two people: each strip is read by its own seat.
    const seat = reader ?? (bottom ? 0 : 1);
    return seat === 0 ? h.x < t.x : h.x > t.x;
  };
  return { top: order(false), bottom: order(true) };
}

// F164: in Play the bot, the bot's strip turned to face the person read "Total | Hole".
describe('Minigolf score strips', () => {
  it('two people: each strip reads Hole then Total for its own player', () => {
    expect(columns([player({ bot: null }), player({ bot: null })])).toEqual({ top: true, bottom: true });
  });
  it('one person and a bot: both strips read Hole then Total for the person', () => {
    expect(columns([player({ bot: null }), player({ bot: 'easy' })])).toEqual({ top: true, bottom: true });
    expect(columns([player({ bot: 'hard' }), player({ bot: null })])).toEqual({ top: true, bottom: true });
  });
});
