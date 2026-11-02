// Prints how smoothly each bot level moves in the real-time paddle games. `npm run motion`.
import { MOTION, type MotionReport } from '../src/core/motion';
import { measureLevel as airhockey } from '../src/games/airhockey/motion';
import { measureLevel as pingpong } from '../src/games/pingpong/motion';

console.log('limits', MOTION);
for (const [game, measure] of [['airhockey', airhockey], ['pingpong', pingpong]] as [string, (l: 'easy' | 'normal' | 'hard') => MotionReport][]) {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    const r = measure(level);
    console.log(
      game.padEnd(10),
      level.padEnd(6),
      `speed ${r.speed.toFixed(0)}/s  flips ${r.flipsPerSec.toFixed(2)}/s  twitches ${r.twitchesPerSec.toFixed(2)}/s  harsh ${(r.harshShare * 100).toFixed(1)}%  wobble ${(r.wobbleShare * 100).toFixed(1)}%  (${r.seconds.toFixed(0)} s)`,
    );
  }
}
