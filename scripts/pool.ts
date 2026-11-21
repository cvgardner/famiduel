// Mini Pool bot table (`npm run pool`): see scripts/poollib.ts.
import type { BotLevel } from '../src/core/types';
import { POOL, poolPairing, type PowerDef } from './poollib';
import { judge, OUTLIER } from './simlib';

/**
 * F366: `npm run pool -- --powers-table [--n 40] [--level normal]`, Mini Pool's row of
 * `npm run sim:powers`: every pool power against every other (and none), same bot level on
 * both seats, seats and break swapped. Cells = the row power's share of finished matches.
 * Judged with the same 35-65% rule (powers-sim judge()).
 */
function powersTable(n: number, level: BotLevel) {
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(10);
  const list: (PowerDef | null)[] = [...POOL, null];
  const name = (p: PowerDef | null) => (p ? p.id : 'none');
  console.log(`Mini Pool powers: ${n} matches per cell, ${level} bots on both seats, seats and break swapped.\n`);
  console.log(['row \\ col'.padEnd(11), ...list.map((p) => name(p).padStart(10)), '       avg'].join(''));
  const flags: string[] = [];
  for (const a of list) {
    const cells: number[] = [];
    const vsPowers: number[] = [];
    let vsNone: number | undefined;
    const row = list.map((b) => {
      if (a === b) return '         -';
      const r = poolPairing(level, level, n, 0, true, 1, [a, b]);
      cells.push(r.wins);
      if (b) vsPowers.push(r.wins);
      else vsNone = r.wins;
      return pct(r.wins);
    });
    console.log([name(a).padEnd(11), ...row, pct(cells.reduce((s, x) => s + x, 0) / cells.length)].join(''));
    if (a) flags.push(...judge('minipool', a.id, vsPowers, vsNone));
  }
  console.log(`\nOutliers (average vs the other powers outside ${OUTLIER[0] * 100}–${OUTLIER[1] * 100}%, or under ${OUTLIER[0] * 100}% vs none): ${flags.length ? flags.join('; ') : 'none'}`);
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--n');
  const n = i >= 0 ? Number(args[i + 1]) : 20;
  const powersOn = args.includes('--powers');
  if (args.includes('--powers-table')) {
    const l = args.indexOf('--level');
    return powersTable(n, (l >= 0 ? args[l + 1] : 'normal') as BotLevel);
  }
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
