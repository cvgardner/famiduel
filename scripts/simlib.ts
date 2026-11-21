// Shared by `npm run sim` and `npm run sim:powers`: bot-vs-bot matches of the real-time action games.
import { makeRng, type Rng } from '../src/core/rng';
import { H, MID, W } from '../src/engine/world';
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
import { TugOfWar, TugOfWarBot } from '../src/games/tugofwar/logic';

export const DT = 1 / 60;
const MAX_T = 300;
/** A match longer than this (3 min) counts as long: an idle seat should never make one. */
export const LONG_T = 180;

type Game = { over?: boolean; done?: boolean; finished?: boolean; phase?: string; winner?: PlayerIndex | null; step(dt: number, intents: [never, never]): void };
type Bot = { think(game: never, dt: number): unknown };
export type Spec = {
  id: string;
  make(players: [PlayerInfo, PlayerInfo], powers: boolean, rng: Rng): Game;
  bot(p: PlayerIndex, level: BotLevel, rng: Rng): Bot;
  /** Games without an over/done/finished flag end when a winner is set. */
  endsOnWinner?: boolean;
  /** This game's intent from the masher kid's thumb (see Masher). */
  kid(m: Masher, p: PlayerIndex): unknown;
};

/**
 * A small kid who doesn't follow the game yet (the unit tests' sumo masher, for every
 * game): presses in bursts of 0.08-0.6 s with 0.05-0.5 s gaps, and drags a finger to a
 * random spot on their own half every 0.3-1 s. Never uses a power.
 */
export class Masher {
  press = false;
  side: -1 | 1 = 1;
  x = W / 2;
  y = 0;
  private left = 0;
  private moveIn = 0;

  constructor(readonly p: PlayerIndex, private readonly rng: Rng) {
    this.y = p === 0 ? H * 0.8 : H * 0.2;
  }

  tick(dt: number): void {
    this.left -= dt;
    if (this.left <= 0) {
      this.press = !this.press;
      this.left = this.press ? this.rng.range(0.08, 0.6) : this.rng.range(0.05, 0.5);
      if (this.press) this.side = this.rng.chance(0.5) ? -1 : 1;
    }
    this.moveIn -= dt;
    if (this.moveIn <= 0) {
      this.moveIn = this.rng.range(0.3, 1);
      this.x = this.rng.range(30, W - 30);
      this.y = this.p === 0 ? this.rng.range(MID + 30, H - 30) : this.rng.range(30, MID - 30);
    }
  }

  /** A tap: true only on the first frame of a press. */
  private was = false;
  tap(): boolean {
    const t = this.press && !this.was;
    this.was = this.press;
    return t;
  }
}

/**
 * A player who walked away (or never touches the screen): no taps, no presses, the finger
 * resting on their own half's centre (so a stick reads 0). Uses the kid's intent mapping.
 */
export class Idle extends Masher {
  constructor(p: PlayerIndex, rng: Rng) {
    super(p, rng);
    this.press = false;
    this.x = W / 2;
    this.y = p === 0 ? H * 0.75 : H * 0.25;
  }

  override tick(): void {}
}

/**
 * Seat levels the sims play: the three bot levels, a bot level with a head start
 * (`easy+2` = the easy bot with assist 2, for the --ladder table), the masher kid with no
 * head start / a full one, or an idle seat.
 */
export type SimLevel = BotLevel | `${BotLevel}+${1 | 2 | 3}` | 'kid' | 'kid+3' | 'idle';

/** A bot seat's level and head start: `easy+2` -> ['easy', 2]. */
export function botSeat(l: Exclude<SimLevel, 'kid' | 'kid+3' | 'idle'>): [BotLevel, number] {
  const [lvl, a] = l.split('+');
  return [lvl as BotLevel, a ? Number(a) : 0];
}

export const SPECS: Spec[] = [
  { id: 'airhockey', make: (pl, pw, r) => new AirHockey(pl, pw, r) as unknown as Game, bot: (p, l, r) => new AirHockeyBot(p, l, r) as unknown as Bot, endsOnWinner: true, kid: (m) => ({ tx: m.x, ty: m.y, power: false }) },
  { id: 'pingpong', make: (pl, pw, r) => new PingPong(pl, pw, r) as unknown as Game, bot: (p, l, r) => new PingPongBot(p, l, r) as unknown as Bot, endsOnWinner: true, kid: (m) => ({ tx: m.x, ty: m instanceof Idle ? undefined : m.y, power: false }) },
  { id: 'sumo', make: (pl, pw, r) => new Sumo(pl, pw, r) as unknown as Game, bot: (p, l, r) => new SumoBot(p, l, r) as unknown as Bot, kid: (m) => ({ hold: m.press, power: false }) },
  { id: 'snacksnatch', make: (pl, pw, r) => new SnackSnatch(pl, pw, r) as unknown as Game, bot: (p, l, r) => new SnackSnatchBot(p, l, r) as unknown as Bot, kid: (m) => { const t = m.tap(); return { snap: [t && m.side < 0, t && m.side > 0], power: false }; } },
  { id: 'snake', make: (pl, pw, r) => new SnakeDuel(pl, pw, r) as unknown as Game, bot: (p, l, r) => new SnakeBot(p, l, r) as unknown as Bot, kid: (m) => ({ turn: m.tap() ? m.side : 0, power: false }) },
  { id: 'quickdraw', make: (pl, pw, r) => new QuickDraw(pl, pw, r) as unknown as Game, bot: (p, l, r) => new QuickDrawBot(p, l, r) as unknown as Bot, kid: (m) => ({ tap: m.tap(), power: false }) },
  { id: 'tanks', make: (pl, pw, r) => new TankDuel(pl, pw, r) as unknown as Game, bot: (p, l, r) => new TankBot(p, l, r) as unknown as Bot, kid: (m, p) => ({ mx: (m.x - W / 2) / (W / 2), my: (m.y - (p === 0 ? H * 0.75 : H * 0.25)) / (H / 4), fire: m.tap(), power: false }) },
  { id: 'chopchop', make: (pl, pw, r) => new ChopChop(pl, pw, r) as unknown as Game, bot: (p, l, r) => new ChopBot(p, l, r) as unknown as Bot, kid: (m) => ({ chop: m.tap() ? m.side : 0, power: false }) },
  { id: 'tugofwar', make: (pl, pw, r) => new TugOfWar(pl, pw, r) as unknown as Game, bot: (p, l, r) => new TugOfWarBot(p, l, r) as unknown as Bot, kid: (m) => ({ tap: m.tap(), power: false }) },
];

const isKid = (l: SimLevel): l is 'kid' | 'kid+3' | 'idle' => l === 'kid' || l === 'kid+3' || l === 'idle';
const seat = (l: SimLevel, pw: PowerDef | null = null): PlayerInfo =>
  isKid(l) ? { name: l, color: '#3fa9ff', assist: l === 'kid+3' ? 3 : 0, power: pw, bot: null } : { name: l, color: '#3fa9ff', assist: botSeat(l)[1], power: pw, bot: botSeat(l)[0] };

/** A game's powers from content/powers.json. */
export function powersOf(game: string): PowerDef[] {
  return (powers.games as Record<string, PowerDef[]>)[game] ?? [];
}

export type Result = { winner: PlayerIndex | null; t: number; finished: boolean };

/** Called after every step with the game and that step's events (scripts/sim.ts --selfout). */
export type Observer = (g: never, events: readonly { type: string }[]) => void;

export function playMatch(spec: Spec, levels: [SimLevel, SimLevel], seed: number, powersOn = false, picks: [PowerDef | null, PowerDef | null] = [null, null], observe?: Observer): Result {
  const rng = makeRng(seed);
  const g = spec.make([seat(levels[0], picks[0]), seat(levels[1], picks[1])], powersOn, rng);
  const kidRng = makeRng(seed + 7919);
  const player = (p: PlayerIndex): Bot => {
    const l = levels[p];
    if (!isKid(l)) return spec.bot(p, botSeat(l)[0], rng);
    const m = l === 'idle' ? new Idle(p, kidRng) : new Masher(p, kidRng);
    return { think: (_g: never, dt: number) => (m.tick(dt), spec.kid(m, p)) };
  };
  const bots = [player(0), player(1)];
  const ended = () => g.over === true || g.done === true || g.finished === true || g.phase === 'done' || (!!spec.endsOnWinner && g.winner != null);
  let t = 0;
  for (; !ended() && t < MAX_T; t += DT) {
    const its = [bots[0].think(g as never, DT), bots[1].think(g as never, DT)];
    g.step(DT, its as [never, never]);
    if (observe) observe(g as never, (g as { events?: { type: string }[] }).events ?? []);
  }
  return { winner: g.winner ?? null, t, finished: ended() };
}

/** Win share of levels[0] over n matches, with the seats swapped every other match. */
export function pairing(spec: Spec, levels: [SimLevel, SimLevel], n: number, powersOn = false, picks: [PowerDef | null, PowerDef | null] = [null, null]) {
  let wins = 0, seat0Wins = 0, draws = 0, unfinished = 0, time = 0, long = 0, maxT = 0;
  for (let i = 0; i < n; i++) {
    // Each seed is played both ways round, so a seed that favours one seat (who starts, a
    // lucky spawn) favours each side once and cancels out. Swapping seats on alternate
    // seeds instead let seed parity decide (Quick Draw rows summed past 100%).
    const swap = i % 2 === 1;
    const r = playMatch(spec, swap ? [levels[1], levels[0]] : levels, 1000 + (i >> 1), powersOn, swap ? [picks[1], picks[0]] : picks);
    time += r.t;
    maxT = Math.max(maxT, r.t);
    if (r.t > LONG_T) long++;
    if (!r.finished) unfinished++;
    else if (r.winner === null) draws++;
    else {
      if (r.winner === 0) seat0Wins++;
      if (r.winner === (swap ? 1 : 0)) wins++;
    }
  }
  return { wins: wins / n, seat0: seat0Wins / n, draws: draws / n, unfinished: unfinished / n, avgT: time / n, long: long / n, maxT };
}

/**
 * F342: the head-start ladder. The easy bot with head start 0, 1, 2 and 3 against an
 * `against` bot with none: the share easy wins at each step (seats swapped, n matches a step).
 * A head start is for a parent and a young kid; each step should help a bit more.
 */
export function ladder(spec: Spec, against: BotLevel, n: number, powersOn = false): number[] {
  return ([0, 1, 2, 3] as const).map((a) => pairing(spec, [a ? (`easy+${a}` as SimLevel) : 'easy', against], n, powersOn).wins);
}

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
