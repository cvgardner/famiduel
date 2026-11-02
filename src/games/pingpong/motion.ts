// Measures how the Ping Pong bot's paddle moves over whole matches (see core/motion.ts).
// Used by the unit tests and `npm run motion`, so a "spazzy" bot fails a check.
import { makeRng } from '../../core/rng';
import { mergeReports, MotionTrace, type MotionReport } from '../../core/motion';
import type { BotLevel, PlayerInfo } from '../../core/types';
import { PingPong, PingPongBot } from './logic';

const DT = 1 / 60;

function seat(bot: BotLevel): PlayerInfo {
  return { name: 'P', color: '#3fa9ff', assist: 0, power: null, bot };
}

/**
 * Plays `level` (seat 0) against `foe` and returns the motion report for seat 0's
 * paddle. Serves and the pause after a point are cut out: the bot only stands there.
 */
export function measureBot(level: BotLevel, foe: BotLevel, seed: number, seconds = 120): MotionReport {
  const rng = makeRng(seed);
  const g = new PingPong([seat(level), seat(foe)], false, rng);
  const me = new PingPongBot(0, level, rng);
  const them = new PingPongBot(1, foe, rng);
  const trace = new MotionTrace();
  const parts: MotionReport[] = [];
  for (let t = 0; t < seconds && g.winner === null; t += DT) {
    g.step(DT, [me.think(g, DT), them.think(g, DT)]);
    if (g.pointT > 0 || g.serveT > 0) {
      parts.push(trace.cut());
      continue;
    }
    trace.record(g.paddles[0].x, g.paddles[0].y, DT);
  }
  parts.push(trace.cut());
  return mergeReports(parts.filter((r) => r.seconds > 0.5));
}

export function measureLevel(level: BotLevel, seeds = 8): MotionReport {
  const rs: MotionReport[] = [];
  for (let s = 1; s <= seeds; s++) rs.push(measureBot(level, 'normal', s));
  return mergeReports(rs);
}
