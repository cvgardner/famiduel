import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { setReader, soloReader } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

function banners(players: [PlayerInfo, PlayerInfo], str: string) {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.sumo.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} });
  (view as unknown as { showBanner(s: string, c: string, t: number): void }).showBanner(str, '#fff', 1);
  const { g, words } = recorder();
  setReader(soloReader([players[0].bot, players[1].bot]), g);
  try {
    view.render(g);
    view.render(g);
  } finally {
    setReader(null);
  }
  return words.filter((w) => w.str === str).length / 2;
}

// F201: the round-end banner is long, so it fits below the size draw.ts dedupes; playing the
// bot it showed twice, both upright in the person's half.
describe('Sumo round banner, Play the bot', () => {
  const long = 'Player 1 wins the round!';
  it('two people: each seat gets its own copy', () => {
    expect(banners([player({ bot: null }), player({ bot: null })], long)).toBe(2);
  });
  it('a bot on top: the banner shows once', () => {
    expect(banners([player({ bot: null }), player({ bot: 'easy' })], long)).toBe(1);
    expect(banners([player({ bot: null }), player({ bot: 'easy' })], 'Round 2')).toBe(1);
  });
  it('a bot at the bottom: the banner shows once', () => {
    expect(banners([player({ bot: 'easy' }), player({ bot: null })], long)).toBe(1);
  });
  it('two bots: both copies stay', () => {
    expect(banners([player({ bot: 'easy' }), player({ bot: 'easy' })], long)).toBe(2);
  });
});
