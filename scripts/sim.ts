// Bot pace table (`npm run sim`): every real-time action game's bots played against
// each other at every level pairing, seats swapped half the time, powers off so the
// numbers are about the bots. Prints win rates (for the first-named level), draws,
// unfinished matches and the average match length, so difficulty tuning across games
// starts from numbers. Options: `npm run sim -- --n 40 --game sumo --powers`.
import { makeRng, type Rng } from '../src/core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../src/core/types';
import { AirHockey, AirHockeyBot } from '../src/games/airhockey/logic';
import { ChopBot, ChopChop } from '../src/games/chopchop/logic';
import { PingPong, PingPongBot } from '../src/games/pingpong/logic';
import { QuickDraw, QuickDrawBot } from '../src/games/quickdraw/logic';
import { SnackSnatch, SnackSnatchBot } from '../src/games/snacksnatch/logic';
import { SnakeBot, SnakeDuel } from '../src/games/snake/logic';
import { Sumo, SumoBot } from '../src/games/sumo/logic';
import { TankBot, TankDuel } from '../src/games/tanks/logic';

const DT = 1 / 60;
const MAX_T = 300;

type Game = { over?: boolean; done?: boolean; finished?: boolean; phase?: string; winner?: PlayerIndex | null; step(dt: number, intents: [never, never]): void };
type Bot = { think(game: never, dt: number): unknown };
type Spec = {
  id: string;
  make(players: [PlayerInfo, PlayerInfo], powers: boolean, rng: Rng): Game;
  bot(p: PlayerIndex, level: BotLevel, rng: Rng): Bot;
  /** Games without an over/done/finished flag end when a winner is set. */
  endsOnWinner?: boolean;
};

export const SPECS: Spec[] = [
  { id: 'airhockey', make: (pl, pw, r) => new AirHockey(pl, pw, r) as unknown as Game, bot: (p, l, r) => new AirHockeyBot(p, l, r) as unknown as Bot, endsOnWinner: true },
  { id: 'pingpong', make: (pl, pw, r) => new PingPong(pl, pw, r) as unknown as Game, bot: (p, l, r) => new PingPongBot(p, l, r) as unknown as Bot, endsOnWinner: true },
  { id: 'sumo', make: (pl, pw, r) => new Sumo(pl, pw, r) as unknown as Game, bot: (p, l, r) => new SumoBot(p, l, r) as unknown as Bot },
  { id: 'snacksnatch', make: (pl, pw, r) => new SnackSnatch(pl, pw, r) as unknown as Game, bot: (p, l, r) => new SnackSnatchBot(p, l, r) as unknown as Bot },
  { id: 'snake', make: (pl, pw, r) => new SnakeDuel(pl, pw, r) as unknown as Game, bot: (p, l, r) => new SnakeBot(p, l, r) as unknown as Bot },
  { id: 'quickdraw', make: (pl, pw, r) => new QuickDraw(pl, pw, r) as unknown as Game, bot: (p, l, r) => new QuickDrawBot(p, l, r) as unknown as Bot },
  { id: 'tanks', make: (pl, pw, r) => new TankDuel(pl, pw, r) as unknown as Game, bot: (p, l, r) => new TankBot(p, l, r) as unknown as Bot },
  { id: 'chopchop', make: (pl, pw, r) => new ChopChop(pl, pw, r) as unknown as Game, bot: (p, l, r) => new ChopBot(p, l, r) as unknown as Bot },
];

const PAIRS: [BotLevel, BotLevel][] = [
  ['easy', 'easy'],
  ['normal', 'normal'],
  ['hard', 'hard'],
  ['normal', 'easy'],
  ['hard', 'normal'],
  ['hard', 'easy'],
];

const seat = (bot: BotLevel): PlayerInfo => ({ name: bot, color: '#3fa9ff', assist: 0, power: null, bot });

export type Result = { winner: PlayerIndex | null; t: number; finished: boolean };

export function playMatch(spec: Spec, levels: [BotLevel, BotLevel], seed: number, powers = false): Result {
  const rng = makeRng(seed);
  const g = spec.make([seat(levels[0]), seat(levels[1])], powers, rng);
  const bots = [spec.bot(0, levels[0], rng), spec.bot(1, levels[1], rng)];
  const ended = () => g.over === true || g.done === true || g.finished === true || g.phase === 'done' || (!!spec.endsOnWinner && g.winner != null);
  let t = 0;
  for (; !ended() && t < MAX_T; t += DT) {
    const its = [bots[0].think(g as never, DT), bots[1].think(g as never, DT)];
    g.step(DT, its as [never, never]);
  }
  return { winner: g.winner ?? null, t, finished: ended() };
}

/** Win share of levels[0] over n matches, with the seats swapped every other match. */
export function pairing(spec: Spec, levels: [BotLevel, BotLevel], n: number, powers = false) {
  let wins = 0, seat0Wins = 0, draws = 0, unfinished = 0, time = 0;
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1;
    const r = playMatch(spec, swap ? [levels[1], levels[0]] : levels, 1000 + i, powers);
    time += r.t;
    if (!r.finished) unfinished++;
    else if (r.winner === null) draws++;
    else {
      if (r.winner === 0) seat0Wins++;
      if (r.winner === (swap ? 1 : 0)) wins++;
    }
  }
  return { wins: wins / n, seat0: seat0Wins / n, draws: draws / n, unfinished: unfinished / n, avgT: time / n };
}

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
