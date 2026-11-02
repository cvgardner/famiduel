// Power balance table (`npm run sim:powers`): for each real-time action game, the bots
// play every power against every other power (and against no power), same bot level
// on both seats, seats swapped every other match. Each cell is the row power's win
// share; a power far from 50% against most others is an outlier worth a look, and a
// power that loses to "none" is one the bot can't use. Options: `--n 20`,
// `--level normal`, `--game sumo`.
import type { BotLevel, PowerDef } from '../src/core/types';
import { pairing, powersOf, SPECS } from './simlib';

/** A row power is flagged when its average share against the others is outside this band. */
export const OUTLIER = [0.35, 0.65] as const;

function main() {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const n = Number(opt('--n') ?? 20);
  const level = (opt('--level') ?? 'normal') as BotLevel;
  const only = opt('--game');
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(10);
  console.log(`Power balance: ${n} matches per cell, ${level} bots on both seats, seats swapped every other match.`);
  console.log('Each cell = the row power\'s win share against the column power (draws and unfinished count as not won).');
  const flags: string[] = [];
  for (const spec of SPECS) {
    if (only && spec.id !== only) continue;
    const list: (PowerDef | null)[] = [...powersOf(spec.id), null];
    const name = (p: PowerDef | null) => (p ? p.id : 'none');
    console.log(`\n${spec.id}`);
    console.log(['row \\ col'.padEnd(11), ...list.map((p) => name(p).padStart(10)), '       avg'].join(''));
    for (const a of list) {
      const cells: number[] = [];
      const row = list.map((b) => {
        if (a === b) return '         -';
        const r = pairing(spec, [level, level], n, true, [a, b]);
        cells.push(r.wins);
        return pct(r.wins);
      });
      const avg = cells.reduce((s, x) => s + x, 0) / cells.length;
      console.log([name(a).padEnd(11), ...row, pct(avg)].join(''));
      if (a && (avg < OUTLIER[0] || avg > OUTLIER[1])) flags.push(`${spec.id}/${a.id}: ${Math.round(avg * 100)}% on average`);
    }
  }
  console.log(`\nOutliers (average outside ${OUTLIER[0] * 100}–${OUTLIER[1] * 100}%): ${flags.length ? flags.join('; ') : 'none'}`);
}

main();
