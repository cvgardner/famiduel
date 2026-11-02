// Honest bots: every bot presses the same buttons a person does, through the same
// intents, so it must stay inside a person's limits too. This plays each
// button-pressing action game bot-vs-bot at every level and checks the presses.
// (Movement and cooldowns are capped by each game's rules for both seats.)
import { describe, expect, it } from 'vitest';
import { HUMAN } from '../src/core/human';
import { makeRng, type Rng } from '../src/core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../src/core/types';
import { ChopBot, ChopChop } from '../src/games/chopchop/logic';
import { MIN_REACTION as QD_MIN, QuickDraw, QuickDrawBot } from '../src/games/quickdraw/logic';
import { SnackSnatch, SnackSnatchBot } from '../src/games/snacksnatch/logic';
import { SnakeBot, SnakeDuel } from '../src/games/snake/logic';
import { Sumo, SumoBot } from '../src/games/sumo/logic';
import { BOT as TANK_BOT, RULES as TANK, TankBot, TankDuel, type Intent as TankIntent } from '../src/games/tanks/logic';
import { DT, player, power } from './helpers';

const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];
const SEEDS = [1, 2, 3, 4];
const MAX_T = 120;
/** Whole bot-vs-bot matches at every level: slow on a shared CI runner. */
const SLOW = 60_000;

type Game = { over?: boolean; done?: boolean; step(dt: number, intents: [never, never]): void };
type Bot = { think(game: never, dt: number): unknown };
type Spec = {
  id: string;
  make(players: [PlayerInfo, PlayerInfo], rng: Rng): Game;
  bot(p: PlayerIndex, level: BotLevel, rng: Rng): Bot;
  /** The separate buttons a person would press, read off one intent. */
  buttons(it: never): Record<string, boolean>;
  powers: [string, string];
};

const SPECS: Spec[] = [
  {
    id: 'tanks',
    make: (pl, rng) => new TankDuel(pl, true, rng) as unknown as Game,
    bot: (p, l, rng) => new TankBot(p, l, rng) as unknown as Bot,
    buttons: (it: TankIntent) => ({ fire: it.fire, power: it.power }),
    powers: ['bouncy', 'mine'],
  },
  {
    id: 'snake',
    make: (pl, rng) => new SnakeDuel(pl, true, rng) as unknown as Game,
    bot: (p, l, rng) => new SnakeBot(p, l, rng) as unknown as Bot,
    buttons: (it: { turn: number; power: boolean }) => ({ left: it.turn === -1, right: it.turn === 1, power: it.power }),
    powers: ['boost', 'phase'],
  },
  {
    id: 'chopchop',
    make: (pl, rng) => new ChopChop(pl, true, rng) as unknown as Game,
    bot: (p, l, rng) => new ChopBot(p, l, rng) as unknown as Bot,
    buttons: (it: { chop: number; power: boolean }) => ({ left: it.chop === -1, right: it.chop === 1, power: it.power }),
    powers: ['freeze', 'double'],
  },
  {
    id: 'snacksnatch',
    make: (pl, rng) => new SnackSnatch(pl, true, rng) as unknown as Game,
    bot: (p, l, rng) => new SnackSnatchBot(p, l, rng) as unknown as Bot,
    buttons: (it: { snap: [boolean, boolean]; power: boolean }) => ({ a: it.snap[0], b: it.snap[1], power: it.power }),
    powers: ['magnet', 'sticky'],
  },
  {
    id: 'quickdraw',
    make: (pl, rng) => new QuickDraw(pl, true, rng) as unknown as Game,
    bot: (p, l, rng) => new QuickDrawBot(p, l, rng) as unknown as Bot,
    buttons: (it: { tap: boolean; power: boolean }) => ({ tap: it.tap, power: it.power }),
    powers: ['fakeout', 'slowtime'],
  },
  {
    id: 'sumo',
    make: (pl, rng) => new Sumo(pl, true, rng) as unknown as Game,
    bot: (p, l, rng) => new SumoBot(p, l, rng) as unknown as Bot,
    buttons: (it: { hold: boolean; power: boolean }) => ({ hold: it.hold, power: it.power }),
    powers: ['pound', 'slip'],
  },
];

/** Plays one bot-vs-bot match and returns the press times (rising edges) per seat and button. */
function presses(spec: Spec, level: BotLevel, seed: number, onStep?: (g: Game, its: unknown[], t: number) => void) {
  const rng = makeRng(seed);
  const pl: [PlayerInfo, PlayerInfo] = [
    player({ bot: level, power: power(spec.id, spec.powers[0]) }),
    player({ bot: level, power: power(spec.id, spec.powers[1]) }),
  ];
  const g = spec.make(pl, rng);
  const bots = [spec.bot(0, level, rng), spec.bot(1, level, rng)];
  const held: Record<string, boolean>[] = [{}, {}];
  const out: Record<string, number[]>[] = [{}, {}];
  let t = 0;
  for (; !(g.over || g.done) && t < MAX_T; t += DT) {
    const its = bots.map((b) => b.think(g as never, DT));
    for (const p of [0, 1] as const) {
      for (const [k, down] of Object.entries(spec.buttons(its[p] as never))) {
        if (down && !held[p][k]) (out[p][k] ??= []).push(t);
        held[p][k] = down;
      }
    }
    onStep?.(g, its, t);
    g.step(DT, its as [never, never]);
  }
  return out;
}

const minGap = (ts: number[]) => ts.slice(1).reduce((m, x, i) => Math.min(m, x - ts[i]), Infinity);

describe('honest bots respect a person\'s limits', () => {
  for (const spec of SPECS) {
    it(`${spec.id}: no bot taps a button faster than a person can (HUMAN.tapGap)`, () => {
      let total = 0;
      for (const level of LEVELS) {
        for (const seed of SEEDS) {
          const seats = presses(spec, level, seed);
          for (const seat of seats) {
            for (const [button, ts] of Object.entries(seat)) {
              total += ts.length;
              const gap = minGap(ts);
              if (gap < HUMAN.tapGap - 1e-9) throw new Error(`${spec.id} ${level} seed ${seed}: "${button}" pressed twice ${gap.toFixed(3)}s apart`);
            }
          }
        }
      }
      expect(total).toBeGreaterThan(0);
    }, SLOW);
  }

  it('the Quick Draw bot never draws faster than a quick person on a phone, at any level', () => {
    expect(QD_MIN).toBeGreaterThanOrEqual(HUMAN.reaction + HUMAN.touchLag);
    const mean: Record<string, number> = {};
    for (const level of LEVELS) {
      const times: number[] = [];
      for (let seed = 1; seed <= 12; seed++) {
        const rng = makeRng(seed);
        // Powers off: Slow Time's pulse is a fair head start for anyone who has it.
        const g = new QuickDraw([player({ bot: level }), player({ bot: level })], false, rng);
        const bots = [new QuickDrawBot(0, level, rng), new QuickDrawBot(1, level, rng)];
        let drawAt = -1;
        for (let t = 0; !g.done && t < MAX_T; t += DT) {
          if (g.phase === 'draw' && drawAt < 0) drawAt = t;
          if (g.phase !== 'draw') drawAt = -1;
          const its = [bots[0].think(g, DT), bots[1].think(g, DT)];
          for (const it of its) if (it.tap && drawAt >= 0) times.push(t - drawAt);
          g.step(DT, its as [never, never]);
        }
      }
      expect(times.length).toBeGreaterThan(20);
      expect(Math.min(...times)).toBeGreaterThanOrEqual(HUMAN.reaction + HUMAN.touchLag - 1e-6);
      mean[level] = times.reduce((a, x) => a + x, 0) / times.length;
    }
    // Hard is a quick adult, not a machine: about 0.3 s on the round timer.
    expect(mean.hard).toBeGreaterThanOrEqual(0.26);
    expect(mean.normal).toBeGreaterThan(mean.hard);
    expect(mean.easy).toBeGreaterThan(mean.normal);
  }, SLOW);

  it('the Tank Duel bot never fires the instant its gun is ready: its thumb follows the reload ring like a person', () => {
    for (const level of LEVELS) {
      let shots = 0;
      let fastest = Infinity;
      for (const seed of SEEDS) {
        const readyAt: [number, number] = [-1, -1];
        presses(SPECS[0], level, seed, (g, its, t) => {
          const game = g as unknown as TankDuel;
          for (const p of [0, 1] as const) {
            const it = its[p] as TankIntent;
            const ready = game.phase === 'play' && game.canFire(p);
            if (!ready) readyAt[p] = -1;
            else if (readyAt[p] < 0) readyAt[p] = t;
            if (it.fire && ready) {
              shots++;
              fastest = Math.min(fastest, t - readyAt[p]);
            }
            expect(game.shellsOf(p)).toBeLessThanOrEqual(TANK.maxShells);
            expect(Math.hypot(it.mx, it.my)).toBeLessThanOrEqual(1 + 1e-9);
          }
        });
      }
      expect(shots).toBeGreaterThan(10);
      expect(fastest).toBeGreaterThanOrEqual(Math.max(HUMAN.reaction, TANK_BOT[level].trigger) - DT - 1e-6);
    }
  }, SLOW);
});
