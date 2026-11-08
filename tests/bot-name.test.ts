import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { setReader, soloReader } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import type { ChopChop } from '../src/games/chopchop/logic';
import type { QuickDraw, RoundResult } from '../src/games/quickdraw/logic';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

function words(id: 'quickdraw' | 'chopchop', players: [PlayerInfo, PlayerInfo], setup: (game: unknown) => void): string[] {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES[id].create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} }) as unknown as { game: unknown; t: number; render(g: unknown): void };
  setup(view.game);
  view.t = 1; // past GO
  const { g, words: w } = recorder();
  setReader(soloReader([players[0].bot, players[1].bot]), g);
  try {
    view.render(g);
  } finally {
    setReader(null);
  }
  return w.map((x) => x.str);
}

const result = (r: Partial<RoundResult>) => (game: unknown) => {
  const q = game as QuickDraw;
  q.phase = 'result';
  q.phaseT = 1;
  q.last = { winner: 1, reason: 'faster', early: null, times: [null, 0.5], penalty: [0, 0], ...r };
};
const people: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: null })];
const solo: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: 'easy' })];

// F165: in Play the bot, the person's half called the bot "them" ("Them 500 ms", "them: 9").
describe('the person\'s half names the bot', () => {
  it('Quick Draw result card: "Bot" against a bot, "Them" between people', () => {
    expect(words('quickdraw', solo, result({}))).toContain('Bot 500 ms');
    expect(words('quickdraw', solo, result({})).some((s) => /\bthem\b/i.test(s))).toBe(false);
    expect(words('quickdraw', people, result({}))).toContain('Them 500 ms');
    expect(words('quickdraw', solo, result({ winner: 0, reason: 'fooled', early: 1 }))).toContain('Bot got fooled!');
    expect(words('quickdraw', people, result({ winner: 0, reason: 'fooled', early: 1 }))).toContain('They got fooled!');
  });
  it('Chop Chop rival pill: "bot: N" against a bot, "them: N" between people', () => {
    const chops = (game: unknown) => {
      (game as ChopChop).choppers[1].chops = 9;
    };
    expect(words('chopchop', solo, chops)).toContain('bot: 9');
    expect(words('chopchop', people, chops)).toContain('them: 9');
  });
});
