// Honest bots: every bot presses the same buttons a person does, through the same
// intents, so it must stay inside a person's limits too. This plays each
// button-pressing action game bot-vs-bot at every level and checks the presses.
// (Movement and cooldowns are capped by each game's rules for both seats.)
import { describe, expect, it } from 'vitest';
import { HUMAN } from '../src/core/human';
import { makeRng, type Rng } from '../src/core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../src/core/types';
import { AIRHOCKEY_REACT, AirHockey, AirHockeyBot, type Intent as AirIntent } from '../src/games/airhockey/logic';
import { ChopBot, ChopChop, type Intent as ChopIntent } from '../src/games/chopchop/logic';
import { IDLE as PEN_IDLE, Penalty, PenaltyBot, type Intent as PenIntent } from '../src/games/penalty/logic';
import { PINGPONG_REACT, PingPong, PingPongBot, type Intent as PongIntent } from '../src/games/pingpong/logic';
import { MIN_REACTION as QD_MIN, QuickDraw, QuickDrawBot } from '../src/games/quickdraw/logic';
import { SNACK_REACT, SnackSnatch, SnackSnatchBot } from '../src/games/snacksnatch/logic';
import { SnakeBot, SnakeDuel } from '../src/games/snake/logic';
import { RULES as SUMO, SUMO_REACT, Sumo, SumoBot, type Intent as SumoIntent } from '../src/games/sumo/logic';
import { TUG_REACT, TugOfWar, TugOfWarBot, type Intent as TugIntent } from '../src/games/tugofwar/logic';
import { BOT as TANK_BOT, RULES as TANK, SHELL_SEEN, TankBot, TankDuel, type Intent as TankIntent } from '../src/games/tanks/logic';
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
  {
    id: 'tugofwar',
    make: (pl, rng) => new TugOfWar(pl, true, rng) as unknown as Game,
    bot: (p, l, rng) => new TugOfWarBot(p, l, rng) as unknown as Bot,
    buttons: (it: { tap: boolean; power: boolean }) => ({ tap: it.tap, power: it.power }),
    powers: ['heave', 'yank'],
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

  it('the Air Hockey bot sees the puck no sooner than a person would, at any level', () => {
    // F417: a person's eyes and thumb lag the puck by their reaction time. Two identical
    // tables; on one the puck is knocked onto another line mid-rally. Until that much time
    // has passed the bots must move exactly the same on both (no peeking at the live puck),
    // and soon after it they must react.
    for (const level of LEVELS) {
      expect(AIRHOCKEY_REACT[level]).toBeGreaterThanOrEqual(HUMAN.reaction);
      let checked = 0;
      let reacted = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const world = () => {
          const g = new AirHockey([player({ bot: level }), player({ bot: level })], false, makeRng(seed));
          const brng = makeRng(seed + 99);
          return { g, bots: [new AirHockeyBot(0, level, brng), new AirHockeyBot(1, level, brng)] };
        };
        const a = world();
        const b = world();
        const think = (w: ReturnType<typeof world>) => [w.bots[0].think(w.g, DT), w.bots[1].think(w.g, DT)] as [AirIntent, AirIntent];
        for (let t = 0; t < 2 + seed * 0.37; t += DT) {
          a.g.step(DT, think(a));
          b.g.step(DT, think(b));
        }
        const pk = b.g.pucks[0];
        pk.vx = -pk.vx + 150;
        pk.vy = -pk.vy;
        const lagFrames = Math.floor(HUMAN.reaction / DT) - 1;
        let differed = -1;
        for (let f = 0; f < 120 && differed < 0; f++) {
          const ia = think(a);
          const ib = think(b);
          const same = JSON.stringify(ia) === JSON.stringify(ib);
          if (f < lagFrames) {
            expect(same, `${level} seed ${seed}: moved on the new line ${(f * DT).toFixed(2)} s after it`).toBe(true);
            checked++;
          } else if (!same) differed = f;
          a.g.step(DT, ia);
          b.g.step(DT, ib);
          // A paddle touching the puck is felt, not seen: stop comparing there.
          if ([...a.g.events, ...b.g.events].some((e) => e.type === 'hit' || e.type === 'goal')) break;
        }
        if (differed >= 0) reacted++;
      }
      expect(checked).toBeGreaterThan(60);
      expect(reacted, `${level}: never reacted to the new line`).toBeGreaterThan(3);
    }
  }, SLOW);

  it('the Ping Pong bot sees the ball no sooner than a person would, at any level', () => {
    // F418a: same check as Air Hockey's. Two identical tables; on one the ball is knocked
    // onto another line mid-rally. Until a reaction time has passed both bots move (and
    // press their power) exactly the same, and soon after they answer the new line.
    for (const level of LEVELS) {
      expect(PINGPONG_REACT[level]).toBeGreaterThanOrEqual(HUMAN.reaction);
      let checked = 0;
      let reacted = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const world = () => {
          const g = new PingPong([player({ bot: level, power: power('pingpong', 'wide') }), player({ bot: level, power: power('pingpong', 'slowmo') })], true, makeRng(seed));
          const brng = makeRng(seed + 99);
          return { g, bots: [new PingPongBot(0, level, brng), new PingPongBot(1, level, brng)] };
        };
        const a = world();
        const b = world();
        const think = (w: ReturnType<typeof world>) => [w.bots[0].think(w.g, DT), w.bots[1].think(w.g, DT)] as [PongIntent, PongIntent];
        for (let t = 0; t < 2 + seed * 0.29 || a.g.serving || a.g.pointT > 0; t += DT) {
          a.g.step(DT, think(a));
          b.g.step(DT, think(b));
          if (t > 60) break;
        }
        if (a.g.winner !== null || a.g.serving) continue;
        const ball = b.g.ball;
        ball.vx = -ball.vx + (ball.x < 180 ? 160 : -160);
        const lagFrames = Math.floor(HUMAN.reaction / DT) - 1;
        let differed = -1;
        for (let f = 0; f < 90 && differed < 0; f++) {
          const ia = think(a);
          const ib = think(b);
          const same = JSON.stringify(ia) === JSON.stringify(ib);
          if (f < lagFrames) {
            expect(same, `${level} seed ${seed}: moved on the new line ${(f * DT).toFixed(2)} s after it`).toBe(true);
            checked++;
          } else if (!same) differed = f;
          a.g.step(DT, ia);
          b.g.step(DT, ib);
          // A paddle touching the ball is felt, not seen: stop comparing there.
          if ([...a.g.events, ...b.g.events].some((e) => e.type === 'hit' || e.type === 'point')) break;
        }
        if (differed >= 0) reacted++;
      }
      expect(checked).toBeGreaterThan(60);
      expect(reacted, `${level}: never reacted to the new line`).toBeGreaterThan(3);
    }
  }, SLOW);

  it('the Sumo bot sees the other wrestler no sooner than a person would, at any level', () => {
    // F418: same check as Air Hockey's. Two identical rings; on one the top wrestler is moved
    // into the bottom bot's line mid-round. Until a reaction time has passed the bottom bot presses exactly the
    // same on both (its dash button and its power), and soon after it answers the new spot.
    for (const level of LEVELS) {
      expect(SUMO_REACT[level]).toBeGreaterThanOrEqual(HUMAN.reaction);
      let checked = 0;
      let reacted = 0;
      for (let trial = 0; trial < 80; trial++) {
        const seed = 1 + (trial % 20);
        const id = (['pound', 'grow', 'slip', 'iron', 'dash'] as const)[trial % 5];
        const world = () => {
          const g = new Sumo([player({ bot: level, power: power('sumo', id) }), player({ bot: level, power: power('sumo', 'grow') })], true, makeRng(seed));
          const brng = makeRng(seed + 99);
          return { g, bots: [new SumoBot(0, level, brng), new SumoBot(1, level, brng)] };
        };
        const a = world();
        const b = world();
        const think = (w: ReturnType<typeof world>) => [w.bots[0].think(w.g, DT), w.bots[1].think(w.g, DT)] as [SumoIntent, SumoIntent];
        for (let t = 0; t < 2 + trial * 0.11 || a.g.phase !== 'fight'; t += DT) {
          a.g.step(DT, think(a));
          b.g.step(DT, think(b));
          if (t > 60) break;
        }
        if (a.g.phase !== 'fight') continue;
        // Move the top wrestler (same distance away) to just ahead of the bottom one's sweeping
        // arrow, where a bot that reads the live ring dashes at once.
        const me = b.g.wrestlers[0];
        const w1 = b.g.wrestlers[1];
        const gap = Math.hypot(w1.x - me.x, w1.y - me.y);
        const ang = me.angle + me.spin * SUMO.turnSpeed * 0.3;
        w1.x = me.x + Math.cos(ang) * gap;
        w1.y = me.y + Math.sin(ang) * gap;
        const lagFrames = Math.floor(HUMAN.reaction / DT) - 1;
        let differed = -1;
        for (let f = 0; f < 240 && differed < 0; f++) {
          const ia = think(a);
          const ib = think(b);
          const same = JSON.stringify(ia[0]) === JSON.stringify(ib[0]);
          if (f < lagFrames) {
            expect(same, `${level} seed ${seed} trial ${trial}: pressed on the new spot ${(f * DT).toFixed(2)} s after it`).toBe(true);
            checked++;
          } else if (!same) differed = f;
          a.g.step(DT, ia);
          b.g.step(DT, ib);
          // A bump is felt, not seen, and a new round starts over: stop comparing there.
          if ([...a.g.events, ...b.g.events].some((e) => e.type === 'bump' || e.type === 'round' || e.type === 'out')) break;
        }
        if (differed >= 0) reacted++;
      }
      expect(checked).toBeGreaterThan(60);
      expect(reacted, `${level}: never reacted to the new spot`).toBeGreaterThan(3);
    }
  }, SLOW);

  it('the Snack Snatch bot sees the snacks no sooner than a person would, at any level', () => {
    // F419: same check as Air Hockey's. Two identical picnics; on one every snack is knocked
    // onto another line. Until a reaction time has passed both bots tap exactly the same
    // (snaps and the power button), and soon after they answer the new lines.
    for (const level of LEVELS) {
      expect(SNACK_REACT[level]).toBeGreaterThanOrEqual(HUMAN.reaction);
      let checked = 0;
      let reacted = 0;
      for (let seed = 1; seed <= 16; seed++) {
        const world = () => {
          const g = new SnackSnatch([player({ bot: level, power: power('snacksnatch', 'magnet') }), player({ bot: level, power: power('snacksnatch', 'sticky') })], true, makeRng(seed));
          const brng = makeRng(seed + 99);
          return { g, bots: [new SnackSnatchBot(0, level, brng), new SnackSnatchBot(1, level, brng)] };
        };
        const a = world();
        const b = world();
        const think = (w: ReturnType<typeof world>) => [w.bots[0].think(w.g, DT), w.bots[1].think(w.g, DT)] as const;
        for (let t = 0; t < 3 + seed * 0.61; t += DT) {
          a.g.step(DT, think(a) as never);
          b.g.step(DT, think(b) as never);
        }
        for (const sn of b.g.snacks) {
          sn.vx = -sn.vx + 40;
          sn.vy = -sn.vy;
        }
        const lagFrames = Math.floor(HUMAN.reaction / DT) - 1;
        let differed = -1;
        for (let f = 0; f < 120 && differed < 0; f++) {
          const ia = think(a);
          const ib = think(b);
          const same = JSON.stringify(ia) === JSON.stringify(ib);
          if (f < lagFrames) {
            expect(same, `${level} seed ${seed}: tapped on the new lines ${(f * DT).toFixed(2)} s after them`).toBe(true);
            checked++;
          } else if (!same) differed = f;
          a.g.step(DT, ia as never);
          b.g.step(DT, ib as never);
          // A snap that gulps on one picnic and misses on the other is felt, not seen: stop
          // comparing there (after the reaction time any difference shows the bot still looks).
          if (f < lagFrames && JSON.stringify(a.g.events) !== JSON.stringify(b.g.events)) break;
        }
        if (differed >= 0) reacted++;
      }
      expect(checked).toBeGreaterThan(60);
      expect(reacted, `${level}: never reacted to the new lines`).toBeGreaterThan(1);
    }
  }, SLOW);

  it('the Tank Duel bot sees a new shell no sooner than a person would, at any level', () => {
    // F421: same check as Air Hockey's. Two identical arenas; on one the other tank's shell
    // appears flying at this bot. Until a reaction time has passed both bots drive exactly
    // the same (no dodge, no Shield tap), and soon after it they dodge.
    expect(SHELL_SEEN).toBeGreaterThanOrEqual(HUMAN.reaction);
    const D = 150;
    for (const level of LEVELS) {
      let checked = 0;
      let reacted = 0;
      for (let seed = 1; seed <= 24; seed++) {
        const world = () => {
          const g = new TankDuel([player({ bot: level, power: power('tanks', 'shield') }), player({ bot: level })], true, makeRng(seed));
          // One dice each: tank 1's bot knows its shell at once, and a shared roll would
          // carry that into tank 0's aim.
          return { g, bots: [new TankBot(0, level, makeRng(seed + 99)), new TankBot(1, level, makeRng(seed + 199))] };
        };
        const a = world();
        const b = world();
        const think = (w: ReturnType<typeof world>) => [w.bots[0].think(w.g, DT), w.bots[1].think(w.g, DT)] as [TankIntent, TankIntent];
        for (let t = 0; t < 3 + seed * 0.53; t += DT) {
          a.g.step(DT, think(a));
          b.g.step(DT, think(b));
        }
        if (a.g.phase !== 'play') continue;
        // A shell D units out on a clear line, flying straight at tank 0.
        const me = b.g.tanks[0];
        let at: { x: number; y: number; a: number } | null = null;
        for (let k = 0; k < 32 && !at; k++) {
          const ang = (k / 32) * Math.PI * 2 + seed;
          let clear = true;
          for (let d = 16; d <= D && clear; d += 6) clear = !b.g.arena.solidAt(me.x + Math.cos(ang) * d, me.y + Math.sin(ang) * d);
          if (clear) at = { x: me.x + Math.cos(ang) * D, y: me.y + Math.sin(ang) * D, a: ang + Math.PI };
        }
        if (!at) continue;
        b.g.shells.push({
          id: 9999,
          owner: 1,
          x: at.x,
          y: at.y,
          vx: Math.cos(at.a) * TANK.shellSpeed,
          vy: Math.sin(at.a) * TANK.shellSpeed,
          bounces: 0,
          maxBounces: TANK.bounces,
          age: 0,
          bouncy: false,
          alive: true,
          extra: true, // not counted against tank 1's own shells
        });
        const lagFrames = Math.floor(HUMAN.reaction / DT) - 1;
        let differed = -1;
        for (let f = 0; f < 90 && differed < 0; f++) {
          const ia = think(a);
          // Tank 1 "fired" the shell, so its bot knows about it at once: drive it as on
          // the other arena and judge tank 0's bot alone.
          const ib: [TankIntent, TankIntent] = [think(b)[0], ia[1]];
          const same = JSON.stringify(ia[0]) === JSON.stringify(ib[0]);
          if (f < lagFrames) {
            expect(same, `${level} seed ${seed}: answered the new shell ${(f * DT).toFixed(2)} s after it`).toBe(true);
            checked++;
          } else if (!same) differed = f;
          a.g.step(DT, ia);
          b.g.step(DT, ib);
          // A hit is felt, not seen, and the new shell knocking out one of tank 0's own
          // (which that bot does see) is a fair difference: stop comparing there.
          const others = (w: ReturnType<typeof world>) => JSON.stringify(w.g.shells.filter((s) => s.alive && s.id !== 9999));
          if (!b.g.shells.some((s) => s.id === 9999 && s.alive) || others(a) !== others(b)) break;
        }
        if (differed >= 0) reacted++;
      }
      expect(checked).toBeGreaterThan(60);
      expect(reacted, `${level}: never dodged the new shell`).toBeGreaterThan(3);
    }
  }, SLOW);

  it('the Penalty shooter bot sees the keeper dive no sooner than a person would, at any level', () => {
    // F422: two identical kicks; on one a person in goal dives early during the aim. Until a
    // reaction time has passed the shooting bot does exactly the same on both (no instant
    // re-pick, no instant "go the other way"), and soon after it answers the dive.
    for (const level of LEVELS) {
      let checked = 0;
      let reacted = 0;
      for (let trial = 0; trial < 40; trial++) {
        const world = () => {
          const g = new Penalty([player({ bot: level }), player({})], false, makeRng(700 + trial), 0);
          return { g, bot: new PenaltyBot(0, level, makeRng(900 + trial)) };
        };
        const a = world();
        const b = world();
        const diveT = 0.4 + (trial % 10) * 0.2;
        while (a.g.phase !== 'aim' || a.g.phaseT < diveT) {
          a.g.step(DT, [a.bot.think(a.g, DT), { ...PEN_IDLE }]);
          b.g.step(DT, [b.bot.think(b.g, DT), { ...PEN_IDLE }]);
        }
        if (a.g.shooter !== 0 || a.g.kickIn() < 0.5) continue;
        const dive = ([-1, 0, 1] as const)[trial % 3];
        const lagFrames = Math.floor(HUMAN.reaction / DT) - 1;
        let differed = -1;
        for (let f = 0; a.g.phase === 'aim' && differed < 0; f++) {
          const ia: PenIntent = a.bot.think(a.g, DT);
          const ib: PenIntent = b.bot.think(b.g, DT);
          const same = JSON.stringify(ia) === JSON.stringify(ib);
          if (f < lagFrames) {
            expect(same, `${level} trial ${trial}: answered the dive ${(f * DT).toFixed(2)} s after it`).toBe(true);
            checked++;
          } else if (!same) differed = f;
          a.g.step(DT, [ia, { ...PEN_IDLE }]);
          b.g.step(DT, [ib, { ...PEN_IDLE, dive: f === 0 ? dive : null }]);
        }
        if (differed >= 0) reacted++;
      }
      expect(checked).toBeGreaterThan(100);
      expect(reacted, `${level}: never answered the dive`).toBeGreaterThan(5);
    }
  });

  it('the Chop Chop bot answers a Freeze no sooner than a person would, at any level', () => {
    // F422: two identical trees; on one the other side's Freeze lands mid-round. Until a
    // reaction time has passed (or its first tap lands on the ice, which it feels), the bot
    // chops exactly the same on both.
    for (const level of LEVELS) {
      let checked = 0;
      for (let trial = 0; trial < 30; trial++) {
        const world = () => {
          const g = new ChopChop([player({ bot: level }), player({ bot: level })], false, makeRng(300 + trial));
          const brng = makeRng(500 + trial);
          return { g, bots: [new ChopBot(0, level, brng), new ChopBot(1, level, brng)] };
        };
        const a = world();
        const b = world();
        const think = (w: ReturnType<typeof world>) => [w.bots[0].think(w.g, DT), w.bots[1].think(w.g, DT)] as [ChopIntent, ChopIntent];
        for (let t = 0; t < 1.5 + (trial % 10) * 0.13 || a.g.phase !== 'play'; t += DT) {
          a.g.step(DT, think(a));
          b.g.step(DT, think(b));
          if (t > 30) break;
        }
        if (a.g.phase !== 'play' || a.g.choppers[0].out) continue;
        b.g.choppers[0].frozen = 3;
        const lagFrames = Math.floor(HUMAN.reaction / DT) - 1;
        for (let f = 0; f < lagFrames; f++) {
          const ia = think(a);
          const ib = think(b);
          expect(JSON.stringify(ia[0]), `${level} trial ${trial}: chopped differently ${(f * DT).toFixed(2)} s after the Freeze`).toBe(JSON.stringify(ib[0]));
          checked++;
          if (ib[0].chop !== 0) break;
          a.g.step(DT, ia);
          b.g.step(DT, ib);
        }
      }
      expect(checked).toBeGreaterThan(30);
    }
  });

  it('the Tug of War bot sees the ribbon no sooner than a person would, at any level', () => {
    // F422: two identical ropes; on one the ribbon is jerked toward the bot's losing line and
    // set sliding that way. Until a reaction time has passed the bot taps (and ties off with
    // Anchor) exactly the same on both, and soon after it answers the slide.
    expect(TUG_REACT).toBeGreaterThanOrEqual(HUMAN.reaction);
    for (const level of LEVELS) {
      let checked = 0;
      let reacted = 0;
      for (let trial = 0; trial < 30; trial++) {
        const world = () => {
          const g = new TugOfWar([player({ bot: level, power: power('tugofwar', 'anchor') }), player({ bot: level, power: power('tugofwar', 'heave') })], true, makeRng(40 + trial));
          const brng = makeRng(60 + trial);
          return { g, bots: [new TugOfWarBot(0, level, brng), new TugOfWarBot(1, level, brng)] };
        };
        const a = world();
        const b = world();
        const think = (w: ReturnType<typeof world>) => [w.bots[0].think(w.g, DT), w.bots[1].think(w.g, DT)] as [TugIntent, TugIntent];
        for (let t = 0; t < 1.6 + (trial % 10) * 0.2 || a.g.phase !== 'pull' || a.g.phaseT < 1.2; t += DT) {
          a.g.step(DT, think(a));
          b.g.step(DT, think(b));
          if (t > 40) break;
        }
        if (a.g.phase !== 'pull') continue;
        for (const w of [a, b]) w.g.energy[0].charge(10);
        // The top seat (1) pulls toward -1 for seat 0: on b the ribbon is near seat 0's losing line, sliding there.
        b.g.pos = -0.65 * b.g.lineNow(0);
        b.g.vel = -Math.abs(b.g.vel) - 0.5;
        a.g.vel = Math.abs(a.g.vel) + 0.5;
        const lagFrames = Math.floor(TUG_REACT / DT) - 1;
        let differed = -1;
        for (let f = 0; f < 240 && differed < 0; f++) {
          const ia = think(a);
          const ib = think(b);
          const same = JSON.stringify(ia[0]) === JSON.stringify(ib[0]);
          if (f < lagFrames) {
            expect(same, `${level} trial ${trial}: answered the slide ${(f * DT).toFixed(2)} s after it`).toBe(true);
            checked++;
          } else if (!same) differed = f;
          a.g.step(DT, ia);
          b.g.step(DT, ib);
          if ([...a.g.events, ...b.g.events].some((e) => e.type === 'round' || e.type === 'win')) break;
        }
        if (differed >= 0) reacted++;
      }
      expect(checked).toBeGreaterThan(60);
      expect(reacted, `${level}: never answered the slide`).toBeGreaterThan(5);
    }
  });

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
