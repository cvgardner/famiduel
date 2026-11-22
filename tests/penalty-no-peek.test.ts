import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerIndex } from '../src/core/types';
import { IDLE, Penalty, PenaltyBot, type Dive, type Intent, type Shot } from '../src/games/penalty/logic';
import { DT, player } from './helpers';

// F403: rival reviews say a hard bot "just literally CHEATED" and "kept on getting them all
// right". FamiDuel's keeper bot never sees the shooter's pick: until the ball is struck its
// dives can't depend on where the person aimed, and after the kick it only reads the ball's
// flight after its reaction delay. Same seed, same kick, two different hidden picks: the
// keeper must do exactly the same thing until it could have seen the ball move.
const REACT: Record<BotLevel, number> = { easy: 0.36, normal: 0.24, hard: 0.15 };
const LEFT: Shot = { aimX: 120, power: 0.45, bow: 0 };
const RIGHT: Shot = { aimX: 240, power: 0.45, bow: 0 };

type Step = { phase: string; flightT: number; dive: Dive | null };

/** One kick, a person shooting `shot` at `pickAt` s into the aim, the bot keeping. */
function oneKick(level: BotLevel, seed: number, shot: Shot, pickAt: number) {
  const g = new Penalty([player({ bot: null }), player({ bot: null })], false, makeRng(seed));
  const k = g.keeper as PlayerIndex;
  const s = g.shooter as PlayerIndex;
  const bot = new PenaltyBot(k, level, makeRng(seed * 7919 + 1));
  const trace: Step[] = [];
  let picked = false;
  for (let i = 0; i < 60 * 20 && (g.phase === 'ready' || g.phase === 'aim' || g.phase === 'flight'); i++) {
    const intents: [Intent, Intent] = [{ ...IDLE }, { ...IDLE }];
    const bi = bot.think(g, DT);
    intents[k] = { ...IDLE, dive: bi.dive };
    if (g.phase === 'aim' && !picked && g.phaseT >= pickAt) {
      intents[s] = { ...IDLE, shot };
      picked = true;
    }
    trace.push({ phase: g.phase, flightT: g.flightT, dive: bi.dive });
    g.step(DT, intents);
  }
  return { trace, dive: g.dive };
}

describe('penalty keeper bot never peeks (F403)', () => {
  for (const level of ['easy', 'normal', 'hard'] as BotLevel[]) {
    it(`${level}: same dives whatever the hidden pick, until the ball has flown its reaction time`, () => {
      let differAfter = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const pickAt = 0.4 + (seed % 5) * 0.4;
        const a = oneKick(level, seed, LEFT, pickAt);
        const b = oneKick(level, seed, RIGHT, pickAt);
        const blind = (st: Step) => st.phase === 'ready' || st.phase === 'aim' || (st.phase === 'flight' && st.flightT < REACT[level]);
        const n = Math.min(a.trace.length, b.trace.length);
        for (let i = 0; i < n && blind(a.trace[i]); i++) {
          expect(b.trace[i].phase).toBe(a.trace[i].phase);
          expect(b.trace[i].dive, `seed ${seed} step ${i} (${a.trace[i].phase} ${a.trace[i].flightT.toFixed(2)} s)`).toBe(a.trace[i].dive);
        }
        if (a.dive !== b.dive) differAfter++;
      }
      // The keeper does read the ball once it can: opposite shots get different dives often.
      expect(differAfter).toBeGreaterThan(10);
    });
  }
});
