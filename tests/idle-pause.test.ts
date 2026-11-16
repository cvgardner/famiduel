import { describe, expect, it } from 'vitest';
import { IDLE_PAUSE, Runner } from '../src/app/runner';
import type { PlayerInfo } from '../src/core/types';
import { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import type { Stage } from '../src/engine/stage';
import { STEP } from '../src/engine/stage';
import { GAMES } from '../src/games/registry';
import { player } from './helpers';

function runner(id: string, bots: [string | null, string | null] = [null, null]) {
  const stage = { input: new Input(), onStep: null, onRender: null } as unknown as Stage;
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: bots[0] as never }), player({ bot: bots[1] as never })];
  const r = new Runner(stage, GAMES[id], 1, players, false, { play() {} } as unknown as Sfx, () => {}, true);
  let paused = 0;
  r.onIdle = () => {
    paused++;
    r.paused = true;
  };
  const run = (s: number, each?: (i: number) => void) => {
    for (let i = 0; i < Math.round(s / STEP); i++) {
      each?.(i);
      r.step(STEP);
      stage.input.endFrame();
    }
  };
  return { r, stage, run, paused: () => paused };
}

// F322: Air Hockey, Sumo and Ping Pong never end when both people walk away.
describe('two people both idle pause the match', () => {
  for (const id of ['airhockey', 'sumo', 'pingpong']) {
    it(`${id}: pauses after ${IDLE_PAUSE} s with nobody touching`, () => {
      const t = runner(id);
      t.run(IDLE_PAUSE - 1);
      expect(t.paused()).toBe(0);
      t.run(2);
      expect(t.paused()).toBe(1);
      expect(t.r.result).toBeNull();
    });
  }

  it('a tap now and then keeps it going', () => {
    const t = runner('airhockey');
    t.run(IDLE_PAUSE * 3, (i) => {
      if (i % Math.round(20 / STEP) === 0) t.stage.input.down(1, 100, 500);
      else t.stage.input.up(1);
    });
    expect(t.paused()).toBe(0);
  });

  it('a finger resting on the screen is not idle (holding in Sumo)', () => {
    const t = runner('sumo');
    t.stage.input.down(1, 100, 500);
    t.run(IDLE_PAUSE * 2);
    expect(t.paused()).toBe(0);
  });

  it('a bot seat never pauses (it plays on; bot vs bot runs to the end)', () => {
    const t = runner('airhockey', ['normal', null]);
    t.run(IDLE_PAUSE * 3);
    expect(t.paused()).toBe(0);
  });
});
