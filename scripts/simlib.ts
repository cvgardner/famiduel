// Shared by `npm run sim` and `npm run sim:powers`: bot-vs-bot matches of the real-time action games.
import { makeRng, type Rng } from '../src/core/rng';
import powers from '../content/powers.json';
import type { BotLevel, PlayerIndex, PlayerInfo, PowerDef } from '../src/core/types';
import { AirHockey, AirHockeyBot } from '../src/games/airhockey/logic';
import { ChopBot, ChopChop } from '../src/games/chopchop/logic';
import { PingPong, PingPongBot } from '../src/games/pingpong/logic';
import { QuickDraw, QuickDrawBot } from '../src/games/quickdraw/logic';
import { SnackSnatch, SnackSnatchBot } from '../src/games/snacksnatch/logic';
import { SnakeBot, SnakeDuel } from '../src/games/snake/logic';
import { Sumo, SumoBot } from '../src/games/sumo/logic';
import { TankBot, TankDuel } from '../src/games/tanks/logic';

export const DT = 1 / 60;
const MAX_T = 300;

type Game = { over?: boolean; done?: boolean; finished?: boolean; phase?: string; winner?: PlayerIndex | null; step(dt: number, intents: [never, never]): void };
type Bot = { think(game: never, dt: number): unknown };
export type Spec = {
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

const seat = (bot: BotLevel, pw: PowerDef | null = null): PlayerInfo => ({ name: bot, color: '#3fa9ff', assist: 0, power: pw, bot });

/** A game's powers from content/powers.json. */
export function powersOf(game: string): PowerDef[] {
  return (powers.games as Record<string, PowerDef[]>)[game] ?? [];
}

export type Result = { winner: PlayerIndex | null; t: number; finished: boolean };

export function playMatch(spec: Spec, levels: [BotLevel, BotLevel], seed: number, powersOn = false, picks: [PowerDef | null, PowerDef | null] = [null, null]): Result {
  const rng = makeRng(seed);
  const g = spec.make([seat(levels[0], picks[0]), seat(levels[1], picks[1])], powersOn, rng);
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
export function pairing(spec: Spec, levels: [BotLevel, BotLevel], n: number, powersOn = false, picks: [PowerDef | null, PowerDef | null] = [null, null]) {
  let wins = 0, seat0Wins = 0, draws = 0, unfinished = 0, time = 0;
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1;
    const r = playMatch(spec, swap ? [levels[1], levels[0]] : levels, 1000 + i, powersOn, swap ? [picks[1], picks[0]] : picks);
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

