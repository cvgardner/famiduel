import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { setReader, soloReader } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { MID } from '../src/engine/world';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

function countAndGoal(players: [PlayerInfo, PlayerInfo], seat: 0 | 1) {
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES.chopchop.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} });
  const { g, words } = recorder();
  setReader(soloReader([players[0].bot, players[1].bot]), g);
  try {
    view.render(g);
  } finally {
    setReader(null);
  }
  const half = words.filter((w) => (seat === 0 ? w.y > MID : w.y < MID));
  const goal = half.find((w) => /^\/ \d+$/.test(w.str))!;
  const count = half.find((w) => w.str === '0')!;
  return { goal, count };
}

// F161: in Play the bot, the bot's half reads upright for the person, but its "/ 50" kept
// the mirrored spot and showed left of the count ("/ 50  1").
describe('Chop Chop count and goal', () => {
  it('two people: each seat reads "N / 50" from its own side', () => {
    const people: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: null })];
    const b = countAndGoal(people, 0);
    expect(b.goal.x).toBeGreaterThan(b.count.x);
    const t = countAndGoal(people, 1);
    expect(t.goal.upright).toBe(false);
    expect(t.goal.x).toBeLessThan(t.count.x); // right of the count for the top player
  });

  it('a bot on top: its count reads "N / 50" left to right for the person', () => {
    const solo: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: 'easy' })];
    const t = countAndGoal(solo, 1);
    expect(t.goal.upright && t.count.upright).toBe(true);
    expect(t.goal.x).toBeGreaterThan(t.count.x);
    const b = countAndGoal(solo, 0);
    expect(b.goal.x).toBeGreaterThan(b.count.x);
  });

  it('a bot at the bottom: same for the person on top', () => {
    const solo: [PlayerInfo, PlayerInfo] = [player({ bot: 'easy' }), player({ bot: null })];
    const b = countAndGoal(solo, 0);
    expect(b.goal.upright || b.count.upright).toBe(false);
    expect(b.goal.x).toBeLessThan(b.count.x);
  });
});
