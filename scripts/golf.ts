// Minigolf strokes table (`npm run golf`): every hole played by two bots of the same
// level over several seeds, in list order. Prints the par, average strokes per level,
// how often a level aces it and how often a ball is picked up at the cap, so a new or
// changed hole gets its par and place in the list (easiest first) from numbers.
// Options: `npm run golf -- --n 12 --hole twingates`.
import type { BotLevel } from '../src/core/types';
import { makeRng } from '../src/core/rng';
import { HOLES, Minigolf, MinigolfBot } from '../src/games/minigolf/logic';

const DT = 1 / 60;
const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];

function main() {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const n = Number(opt('--n') ?? 12);
  const only = opt('--hole');
  const player = (bot: BotLevel) => ({ name: 'P', color: '#3fa9ff', assist: 0, power: null, bot });
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
  console.log(`Minigolf strokes per hole, both seats, ${n} seeds per level (avg strokes · aces · picked up)\n`);
  console.log(`${'hole'.padEnd(18)} par cap  ${LEVELS.map((l) => l.padEnd(20)).join('')}`);
  for (const h of HOLES) {
    if (only && h.id !== only) continue;
    let cap = 0;
    const cells: string[] = [];
    for (const level of LEVELS) {
      let strokes = 0;
      let aces = 0;
      let picked = 0;
      let balls = 0;
      for (let seed = 0; seed < n; seed++) {
        const rng = makeRng(900 + seed);
        const g = new Minigolf([player(level), player(level)], false, rng, [h.id]);
        cap = g.cap;
        const bots = [new MinigolfBot(0, level, rng), new MinigolfBot(1, level, rng)];
        for (let t = 0; !g.finished && t < 900; t += DT) {
          g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
          picked += g.events.filter((e) => e.type === 'pickup').length;
        }
        for (const st of g.card[0].strokes) {
          strokes += st;
          if (st === 1) aces++;
          balls++;
        }
      }
      cells.push(`${(strokes / balls).toFixed(1)} · ${pct(aces / balls)} · ${pct(picked / balls)}`.padEnd(20));
    }
    console.log(`${h.name.padEnd(18)} ${String(h.par).padStart(3)} ${String(cap).padStart(3)}  ${cells.join('')}`);
  }
}

main();
