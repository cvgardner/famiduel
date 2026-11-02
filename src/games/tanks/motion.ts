// Measures how the Tank Duel bot steers (see core/motion.ts for the paddle games).
// A tank turns at a capped rate, so it can't snap like a paddle; what looks "spazzy"
// is a wag: turning one way and then straight back within a moment, which a thumb on
// a stick doesn't do. Used by the unit tests and `npm run motion`.
import { makeRng } from '../../core/rng';
import type { BotLevel, PlayerInfo } from '../../core/types';
import { TankBot, TankDuel, wrapAngle } from './logic';

const DT = 1 / 60;

export const STEER = {
  /** Heading change per frame (radians) that counts as turning. */
  turning: 0.02,
  /** A turn reversal this soon after the last one is a wag. */
  wagGap: 0.35,
};

export type SteerReport = {
  seconds: number;
  /** Turn reversals (left to right or back) per second. */
  reversalsPerSec: number;
  /** Reversals within `STEER.wagGap` of the previous one, per second. */
  wagsPerSec: number;
};

function seat(bot: BotLevel): PlayerInfo {
  return { name: 'P', color: '#3fa9ff', assist: 0, power: null, bot };
}

/** Plays `level` (seat 0) against `foe` and reports how seat 0's tank turns while in play. */
export function measureSteer(level: BotLevel, foe: BotLevel, seed: number, seconds = 120): SteerReport {
  const rng = makeRng(seed);
  const g = new TankDuel([seat(level), seat(foe)], false, rng);
  const me = new TankBot(0, level, rng);
  const them = new TankBot(1, foe, rng);
  let time = 0;
  let reversals = 0;
  let wags = 0;
  let prevA = g.tanks[0].a;
  let dir = 0;
  let lastRev = -9;
  for (let t = 0; t < seconds && !g.over; t += DT) {
    g.step(DT, [me.think(g, DT), them.think(g, DT)]);
    const a = g.tanks[0].a;
    const da = wrapAngle(a - prevA);
    prevA = a;
    if (g.phase !== 'play') {
      // A bonk resets the arena: the new heading isn't steering.
      dir = 0;
      continue;
    }
    time += DT;
    const s = Math.abs(da) > STEER.turning ? Math.sign(da) : 0;
    if (s && dir && s !== dir) {
      reversals++;
      if (t - lastRev < STEER.wagGap) wags++;
      lastRev = t;
    }
    if (s) dir = s;
  }
  return { seconds: time, reversalsPerSec: reversals / (time || 1), wagsPerSec: wags / (time || 1) };
}

export function measureSteerLevel(level: BotLevel, seeds = 8): SteerReport {
  let seconds = 0;
  let rev = 0;
  let wag = 0;
  for (let s = 1; s <= seeds; s++) {
    const r = measureSteer(level, 'normal', s);
    seconds += r.seconds;
    rev += r.reversalsPerSec * r.seconds;
    wag += r.wagsPerSec * r.seconds;
  }
  return { seconds, reversalsPerSec: rev / (seconds || 1), wagsPerSec: wag / (seconds || 1) };
}
