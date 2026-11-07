// Bot pace table (`npm run sim`): every real-time action game's bots played against
// each other at every level pairing, seats swapped half the time, powers off so the
// numbers are about the bots. Prints win rates (for the first-named level), draws,
// unfinished matches and the average match length, so difficulty tuning across games
// starts from numbers. The kid rows show whether a mashing small kid, with no head start
// and with the full one, ever beats the easy bot. Options: `npm run sim -- --n 40 --game sumo --powers`.
import { LONG_T, pairing, type SimLevel, SPECS } from './simlib';

// "kid" is a small kid who just mashes (scripts/simlib.ts Masher); "kid+3" has the full head start.
const PAIRS: [SimLevel, SimLevel][] = [
  ['easy', 'easy'],
  ['normal', 'normal'],
  ['hard', 'hard'],
  ['normal', 'easy'],
  ['hard', 'normal'],
  ['hard', 'easy'],
  ['kid', 'easy'],
  ['kid+3', 'easy'],
];

function main() {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const n = Number(opt('--n') ?? 20);
  const only = opt('--game');
  const powers = args.includes('--powers');
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
  if (args.includes('--idle')) {
    console.log(`Idle-seat table: ${n} matches per row, one seat never touches the screen, seats swapped every other match, powers ${powers ? 'on' : 'off'}.`);
    console.log(`"bot wins" = share the bot won; "long" = matches over ${LONG_T / 60} min; "unfin" = not over at 5 min.`);
    console.log(['game'.padEnd(12), 'bot'.padEnd(7), 'bot wins', 'draws', ' long', ' unfin', ' avg s'].join(' '));
    let stalls = 0;
    for (const spec of SPECS) {
      if (only && spec.id !== only) continue;
      for (const lvl of ['easy', 'normal', 'hard'] as const) {
        const r = pairing(spec, [lvl, 'idle'], n, powers);
        if (r.long > 0) stalls++;
        console.log([spec.id.padEnd(12), lvl.padEnd(7), pct(r.wins).padStart(8), pct(r.draws), pct(r.long), pct(r.unfinished), r.avgT.toFixed(0).padStart(6)].join(' '));
      }
    }
    console.log(stalls ? `${stalls} row(s) with matches over ${LONG_T / 60} min against an idle seat.` : 'Every match against an idle seat ends inside 3 min.');
    return;
  }
  console.log(`Bot pace table: ${n} matches per row, seats swapped every other match, powers ${powers ? 'on' : 'off'}.`);
  console.log('"wins" = share won by the first-named level; for a mirror match it shows seat bias instead (bottom seat).');
  console.log(['game'.padEnd(12), 'pairing'.padEnd(15), 'wins', ' draws', ' unfin', ' avg s'].join(' '));
  for (const spec of SPECS) {
    if (only && spec.id !== only) continue;
    for (const pr of PAIRS) {
      const r = pairing(spec, pr, n, powers);
      const mirror = pr[0] === pr[1];
      const name = mirror ? `${pr[0]} (seat 0)` : `${pr[0]} v ${pr[1]}`;
      console.log([spec.id.padEnd(12), name.padEnd(15), pct(mirror ? r.seat0 : r.wins), pct(r.draws), pct(r.unfinished), r.avgT.toFixed(0).padStart(6)].join(' '));
    }
  }
}

main();
