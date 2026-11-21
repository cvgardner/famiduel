// Mini Pool bot table (`npm run pool`): see scripts/poollib.ts.
import type { BotLevel } from '../src/core/types';
import { poolPairing } from './poollib';

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--n');
  const n = i >= 0 ? Number(args[i + 1]) : 20;
  const powersOn = args.includes('--powers');
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
  console.log(`Mini Pool: ${n} matches per row, seats and break swapped, powers ${powersOn ? 'on (random pool power each)' : 'off'}.\n`);
  console.log(`${'pairing'.padEnd(18)} wins  unfin  8-last 8-early scratch8  cap   shots  secs`);
  const rows: [BotLevel, BotLevel][] = [['easy', 'easy'], ['normal', 'normal'], ['hard', 'hard'], ['normal', 'easy'], ['hard', 'normal'], ['hard', 'easy']];
  for (const [a, b] of rows) {
    const r = poolPairing(a, b, n, 0, powersOn);
    const e = r.ends;
    const racks = Math.max(1, e.eight + e.early8 + e.scratch8 + e.cap);
    console.log(
      `${`${a} v ${b}`.padEnd(18)}${pct(r.wins)} ${String(r.unfinished).padStart(5)} ${pct(e.eight / racks)}  ${pct(e.early8 / racks)}  ${pct(e.scratch8 / racks)}  ${pct(e.cap / racks)}  ${r.shots.toFixed(1).padStart(5)} ${r.seconds.toFixed(0).padStart(5)}`,
    );
  }
  console.log(`\nHead-start ladder: the EASY bot's wins with head start +0 / +1 / +2 / +3.`);
  for (const against of ['normal', 'hard'] as BotLevel[]) {
    const cells = [0, 1, 2, 3].map((a) => pct(poolPairing('easy', against, n, a, powersOn).wins));
    console.log(`easy+N v ${against.padEnd(8)}${cells.join(' ')}`);
  }
}

main();
