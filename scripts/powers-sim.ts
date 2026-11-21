// Power balance table (`npm run sim:powers`): for each real-time action game, the bots
// play every power against every other power (and against no power), same bot level
// on both seats, seats swapped every other match. Each cell is the row power's win
// share; a power far from 50% against most others is an outlier worth a look, and a
// power that loses to "none" is one the bot can't use. Options: `--n 20`,
// `--level normal`, `--game sumo`.
import type { BotLevel, PowerDef } from '../src/core/types';
import { pairing, powersOf, SPECS } from './simlib';

/** A row power is flagged when its average share against the other POWERS is outside this band. */
export const OUTLIER = [0.35, 0.65] as const;

/**
 * F332: the outlier list judges each power on its average against the other powers only.
 * The "avg" column also counts the match against no power, so in a game where any power
 * crushes none (Chop Chop: ~90%) every power read 66-67% and was flagged although each
 * head-to-head pair sat in 33-63%. Losing to none is a separate flag: the bot can't use it.
 * `vsPowers` = the row power's shares against each other power, `vsNone` = against none.
 */
export function judge(game: string, power: string, vsPowers: number[], vsNone: number | undefined): string[] {
  const out: string[] = [];
  if (vsPowers.length) {
    const avg = vsPowers.reduce((s, x) => s + x, 0) / vsPowers.length;
    if (avg < OUTLIER[0] || avg > OUTLIER[1]) out.push(`${game}/${power}: ${Math.round(avg * 100)}% vs the other powers`);
  }
  if (vsNone !== undefined && vsNone < OUTLIER[0]) out.push(`${game}/${power}: loses to no power (${Math.round(vsNone * 100)}%)`);
  return out;
}

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
      const vsPowers: number[] = [];
      let vsNone: number | undefined;
      const row = list.map((b) => {
        if (a === b) return '         -';
        const r = pairing(spec, [level, level], n, true, [a, b]);
        cells.push(r.wins);
        if (b) vsPowers.push(r.wins);
        else vsNone = r.wins;
        return pct(r.wins);
      });
      const avg = cells.reduce((s, x) => s + x, 0) / cells.length;
      console.log([name(a).padEnd(11), ...row, pct(avg)].join(''));
      if (a) flags.push(...judge(spec.id, a.id, vsPowers, vsNone));
    }
  }
  console.log(`\nOutliers (average vs the other powers outside ${OUTLIER[0] * 100}–${OUTLIER[1] * 100}%, or under ${OUTLIER[0] * 100}% vs none): ${flags.length ? flags.join('; ') : 'none'}`);
}

if (!process.env.VITEST) main();
