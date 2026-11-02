// Prints how smoothly each Air Hockey bot level moves. `npm run motion`.
import { MOTION } from '../src/core/motion';
import { measureLevel } from '../src/games/airhockey/motion';

console.log('limits', MOTION);
for (const level of ['easy', 'normal', 'hard'] as const) {
  const r = measureLevel(level);
  console.log(
    level.padEnd(6),
    `speed ${r.speed.toFixed(0)}/s  flips ${r.flipsPerSec.toFixed(2)}/s  twitches ${r.twitchesPerSec.toFixed(2)}/s  harsh ${(r.harshShare * 100).toFixed(1)}%  wobble ${(r.wobbleShare * 100).toFixed(1)}%  (${r.seconds.toFixed(0)} s)`,
  );
}
