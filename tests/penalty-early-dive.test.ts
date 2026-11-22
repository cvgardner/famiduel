// F432: the shooting bot punishes a keeper who dives early during the aim, the way a person
// does (it sees the dive a reaction time after it starts, F422, then aims the other way).
// Against a keeper who waits for the kick and guesses, it scores less. Guards the punish
// from being dropped by a later bot change.
import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { IDLE, Penalty, PenaltyBot, type Dive, type Intent } from '../src/games/penalty/logic';
import { DT, player } from './helpers';

const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];
const KICKS = 200;

/** Goals the bot (seat 0) scores in its first kick of each seeded shootout against a scripted keeper. */
function goals(level: BotLevel, early: boolean): number {
  let scored = 0;
  for (let k = 0; k < KICKS; k++) {
    const g = new Penalty([player({ bot: level }), player({})], false, makeRng(1000 + k), 0);
    const bot = new PenaltyBot(0, level, makeRng(3000 + k));
    const krng = makeRng(5000 + k);
    const side = krng.pick([-1, 0, 1] as const) as Dive;
    const diveAt = krng.range(0.5, 2);
    let dived = false;
    for (let t = 0; t < 30; t += DT) {
      const keeper: Intent = { ...IDLE };
      const due = early ? g.phase === 'aim' && g.phaseT >= diveAt : g.phase === 'flight';
      if (due && !dived) {
        keeper.dive = side;
        dived = true;
      }
      g.step(DT, [bot.think(g, DT), keeper]);
      const res = g.events.find((e) => e.type === 'result');
      if (res && res.type === 'result') {
        if (res.result === 'goal') scored++;
        break;
      }
    }
  }
  return scored;
}

describe('penalty: the shooter bot punishes an early dive', () => {
  for (const level of LEVELS) {
    it(`${level}: scores more against a keeper who dives during the aim than one who waits`, () => {
      const early = goals(level, true);
      const waits = goals(level, false);
      expect(early / KICKS, `${level}: early ${early}, waits ${waits}`).toBeGreaterThan(waits / KICKS + 0.1);
    });
  }
});
