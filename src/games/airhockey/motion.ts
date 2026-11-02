// Measures how the Air Hockey bot's paddle moves over whole matches (see core/motion.ts).
// Used by the unit tests and `npm run motion`, so a "spazzy" bot fails a check.
import { makeRng } from '../../core/rng';
import { mergeReports, MotionTrace, type MotionReport } from '../../core/motion';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { AirHockey, AirHockeyBot, type Intent } from './logic';

const DT = 1 / 60;

function seat(bot: BotLevel | null): PlayerInfo {
  return { name: 'P', color: '#3fa9ff', assist: 0, power: null, bot };
}

/** A paddle that stays home: what a toddler or a walked-away player does. */
function idle(g: AirHockey, p: PlayerIndex): Intent {
  return { tx: g.paddles[p].x, ty: g.paddles[p].y, power: false };
}

/**
 * Plays `level` (seat 0) against `foe` (another bot level, or 'idle') and returns the
 * motion report for seat 0's paddle, plus the result. Serve pauses and goal resets
 * are cut out, since a paddle snapping home after a goal isn't the bot's doing.
 */
export function measureBot(level: BotLevel, foe: BotLevel | 'idle', seed: number, seconds = 120): { motion: MotionReport; score: [number, number] } {
  const rng = makeRng(seed);
  const g = new AirHockey([seat(level), seat(foe === 'idle' ? null : foe)], false, rng);
  const me = new AirHockeyBot(0, level, rng);
  const them = foe === 'idle' ? null : new AirHockeyBot(1, foe, rng);
  const trace = new MotionTrace();
  const parts: MotionReport[] = [];
  let t = 0;
  while (t < seconds) {
    if (g.winner !== null) break;
    const a = me.think(g, DT);
    const b = them ? them.think(g, DT) : idle(g, 1);
    g.step(DT, [a, b]);
    t += DT;
    if (g.events.some((e) => e.type === 'goal') || g.serve > 0) {
      parts.push(trace.cut());
      continue;
    }
    trace.record(g.paddles[0].x, g.paddles[0].y, DT);
  }
  parts.push(trace.cut());
  return { motion: mergeReports(parts.filter((r) => r.seconds > 0.5)), score: [g.score[0], g.score[1]] };
}

export function measureLevel(level: BotLevel, seeds = 8): MotionReport {
  const rs: MotionReport[] = [];
  for (let s = 1; s <= seeds; s++) {
    rs.push(measureBot(level, 'normal', s).motion);
    rs.push(measureBot(level, 'idle', 100 + s).motion);
  }
  return mergeReports(rs);
}
