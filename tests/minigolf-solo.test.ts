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

/** Every "<name>'s shot" line drawn while the person (seat `person`) is on the tee. */
function shotLines(players: [PlayerInfo, PlayerInfo]): { str: string; bottom: boolean }[] {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.minigolf.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} }) as unknown as {
    game: { phase: string; shooter: number };
    update(dt: number, input: unknown): void;
    render(g: unknown): void;
  };
  const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined };
  const seen: { str: string; bottom: boolean }[] = [];
  // Through the hole card to the first turn, while its banner shows.
  for (let i = 0; i < 60 * 6; i++) {
    view.update(1 / 60, input);
    if (view.game.phase !== 'aim' && view.game.phase !== 'turn') continue;
    const { g, words } = recorder();
    setReader(soloReader([players[0].bot, players[1].bot]), g as never);
    try {
      view.render(g);
    } finally {
      setReader(null);
    }
    for (const w of words) if (/'s shot$/.test(w.str)) seen.push({ str: w.str, bottom: w.y > 320 });
  }
  return seen;
}

// F174: playing the bot, the bot's half also showed "<person>'s shot" (turned upright at the
// top), so the person read their turn twice, once under their own name.
describe('Minigolf: the waiting pill', () => {
  it('two people: the waiting seat reads whose shot it is', () => {
    expect(shotLines([player({ bot: null, name: 'Ana' }), player({ bot: null, name: 'Ben' })]).length).toBeGreaterThan(0);
  });
  it('one person and a bot: the bot\'s half never says whose shot it is', () => {
    for (const bots of [[null, 'easy'], ['easy', null]] as const) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: bots[0], name: 'Ana' }), player({ bot: bots[1], name: 'Ben' })];
      const person = bots[0] ? 1 : 0;
      const shots = shotLines(players);
      expect(shots.filter((s) => s.str === `${players[person].name}'s shot`), `bot in seat ${person ? 0 : 1}`).toEqual([]);
    }
  });
});
