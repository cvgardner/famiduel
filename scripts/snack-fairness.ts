import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { SnackSnatch, SnackSnatchBot } from '../src/games/snacksnatch/logic';
import { player } from '../tests/helpers';

const DT = 1 / 60;
type R = { winner: 0 | 1 | null; score: [number, number]; goldToward: [number, number]; goldEaten: [number, number]; sudden: boolean };
function play(levels: [BotLevel, BotLevel], spawnSeed: number, botSeed: number): R {
  const g = new SnackSnatch([player({ bot: levels[0] }), player({ bot: levels[1] })], false, makeRng(spawnSeed));
  const br = makeRng(botSeed);
  const bots = [new SnackSnatchBot(0, levels[0], br), new SnackSnatchBot(1, levels[1], br)];
  const goldToward: [number, number] = [0, 0];
  const goldEaten: [number, number] = [0, 0];
  let wasSudden = false;
  let t = 0;
  const seen = new Set<number>();
  while (!g.finished && t < 600) {
    g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
    if (g.sudden) wasSudden = true;
    for (const s of g.snacks) if (!seen.has(s.id)) { seen.add(s.id); if (s.gold && !g.sudden) goldToward[s.vy > 0 ? 0 : 1]++; }
    for (const e of g.events) if (e.type === 'grab' && e.gold && !g.sudden) goldEaten[e.p]++;
    t += DT;
  }
  return { winner: g.winner, score: g.score, goldToward, goldEaten, sudden: wasSudden };
}
const N = Number(process.env.N ?? 1000);
const pct = (x: number) => (100 * x).toFixed(1) + '%';
console.log('== seat bias & skill (N=' + N + ') ==');
for (const lv of [['easy','easy'],['normal','normal'],['hard','hard'],['hard','normal'],['normal','easy'],['hard','easy']] as [BotLevel,BotLevel][]) {
  let w0 = 0, w1 = 0, d = 0, sud = 0, margin = 0;
  for (let i = 0; i < N; i++) { const r = play(lv, 1000 + i, 50000 + i); if (r.winner === 0) w0++; else if (r.winner === 1) w1++; else d++; if (r.sudden) sud++; margin += Math.abs(r.score[0]-r.score[1]); }
  console.log(`${lv[0]} (bottom) vs ${lv[1]} (top): bottom ${pct(w0/N)} top ${pct(w1/N)} draw ${pct(d/N)} sudden ${pct(sud/N)} avg margin ${(margin/N).toFixed(1)}`);
}
for (const lv of [['normal','hard'],['easy','normal']] as [BotLevel,BotLevel][]) {
  let w0 = 0; for (let i = 0; i < N; i++) if (play(lv, 1000+i, 50000+i).winner === 0) w0++;
  console.log(`${lv[0]} (bottom) vs ${lv[1]} (top): bottom ${pct(w0/N)}`);
}
// Luck: how much does the spawn sequence alone decide equal-skill matches?
for (const lv of ['normal', 'hard'] as BotLevel[]) {
  const S = Number(process.env.S ?? 200), K = Number(process.env.K ?? 20);
  let varSum = 0, mean = 0; const rates: number[] = [];
  let goldGap = 0, goldGapWin = 0, goldGapN = 0, scoreGapGold = 0;
  for (let s = 0; s < S; s++) {
    let w = 0, n = 0;
    for (let k = 0; k < K; k++) {
      const r = play([lv, lv], 7000 + s, 90000 + s * 100 + k);
      if (r.winner !== null) { n++; if (r.winner === 0) w++; }
      const gg = r.goldToward[0] - r.goldToward[1];
      goldGap += Math.abs(gg);
      if (gg !== 0 && r.winner !== null) { goldGapN++; if ((gg > 0) === (r.winner === 0)) goldGapWin++; }
      const ge = r.goldEaten[0]-r.goldEaten[1];
      if (r.winner !== null && ge !== 0) scoreGapGold += ((ge > 0) === (r.winner === 0)) ? 1 : 0;
    }
    rates.push(w / Math.max(1, n));
  }
  mean = rates.reduce((a, b) => a + b, 0) / S;
  varSum = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / S;
  const binom = (mean * (1 - mean)) / K;
  const extreme = rates.filter((r) => r >= 0.75 || r <= 0.25).length;
  console.log(`\n== ${lv} vs ${lv}: does the snack sequence pick the winner? (${S} sequences x ${K} replays) ==`);
  console.log(`bottom win mean ${pct(mean)}; spread across sequences sd ${(Math.sqrt(varSum)*100).toFixed(1)}pts vs ${(Math.sqrt(binom)*100).toFixed(1)}pts if sequence didn't matter`);
  console.log(`share of win-rate variance explained by the sequence: ${pct(Math.max(0, (varSum - binom) / varSum))}`);
  console.log(`sequences where one seat wins >=75%: ${extreme}/${S}`);
  console.log(`avg |gold sent to bottom - gold sent to top| per match: ${(goldGap/(S*K)).toFixed(2)}; side sent more golds wins ${pct(goldGapWin/goldGapN)}`);
}
