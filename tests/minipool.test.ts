import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { MID } from '../src/engine/world';
import { MiniPool, MiniPoolBot, NO_INTENT, retriesFor, RULES, type Intent } from '../src/games/minipool/logic';
import { castAim, ghostBall, NO_MODS, PHYS, POCKETS, simulateShot, stepTable, strike, TABLE, type Ball, type PhysEvent } from '../src/games/minipool/physics';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { DT, player, power } from './helpers';

function bots(a: BotLevel, b: BotLevel, assist: [number, number] = [0, 0], pw: [string | null, string | null] = [null, null]): [PlayerInfo, PlayerInfo] {
  return [
    player({ bot: a, assist: assist[0], power: pw[0] ? power('minipool', pw[0]) : null }),
    player({ bot: b, assist: assist[1], power: pw[1] ? power('minipool', pw[1]) : null }),
  ];
}

function playMatch(players: [PlayerInfo, PlayerInfo], seed: number, powersOn = false) {
  const rng = makeRng(seed);
  const g = new MiniPool(players, powersOn, rng);
  const b = [new MiniPoolBot(0, players[0].bot!, rng), new MiniPoolBot(1, players[1].bot!, rng)];
  const events: string[] = [];
  while (!g.finished && g.t < 600) {
    g.step(DT, [b[0].think(g, DT), b[1].think(g, DT)]);
    for (const e of g.events) if (e.type !== 'hit' && e.type !== 'cushion') events.push(e.type === 'power' ? `power:${e.p}:${e.id}` : e.type);
  }
  return { g, events };
}

/** A table with just these balls (id 0 the cue), for the physics and rule tests. */
function table(...balls: [Ball['kind'], number, number][]): Ball[] {
  return balls.map(([kind, x, y], id) => ({ id, kind, x, y, vx: 0, vy: 0, on: true }));
}

/** A game with two people, its balls swapped for these, at the shooter's aim. */
function setUp(shooter: PlayerIndex, balls: Ball[], players?: [PlayerInfo, PlayerInfo], powersOn = false): MiniPool {
  const g = new MiniPool(players ?? [player({ bot: null }), player({ bot: null })], powersOn, makeRng(1), shooter);
  while (g.phase !== 'aim') g.step(DT, [NO_INTENT, NO_INTENT]);
  g.balls = balls;
  g.shotsThisRack = 1;
  return g;
}

/** Shoots for the shooter and runs until the next turn (or the end). */
function shootAndWait(g: MiniPool, angle: number, powerAmt: number): void {
  const turn = g.turnId;
  const shot: Intent = { shot: { angle, power: powerAmt }, power: false };
  g.step(DT, g.shooter === 0 ? [shot, NO_INTENT] : [NO_INTENT, shot]);
  while (g.turnId === turn && !g.finished && g.phase !== 'rackEnd') g.step(DT, [NO_INTENT, NO_INTENT]);
}

const at = (from: { x: number; y: number }, to: { x: number; y: number }) => Math.atan2(to.y - from.y, to.x - from.x);

describe('Mini Pool physics', () => {
  it('a straight hit passes the speed on (equal balls) and the cue nearly stops', () => {
    const balls = table(['cue', 180, 400], [0, 180, 300]);
    const res = simulateShot(balls, -Math.PI / 2, 0.4, NO_MODS, DT);
    expect(res.firstHit).toBe(1);
    expect(res.balls[1].y).toBeLessThan(250);
    expect(Math.abs(res.balls[0].y - 300)).toBeLessThan(PHYS.r * 4);
  });

  it('a ball rolled at a pocket drops in; everything stops in time', () => {
    const balls = table(['cue', 200, 400], [0, 100, 160]);
    const gb = ghostBall(balls[1], POCKETS[0]);
    const res = simulateShot(balls, at(balls[0], gb), 0.6, NO_MODS, DT);
    expect(res.potted.map((b) => b.id)).toContain(1);
    expect(res.time).toBeLessThan(PHYS.maxRoll);
  });

  it('balls stay on the cloth and never overlap after a hard break', () => {
    const g = new MiniPool(bots('normal', 'normal'), false, makeRng(3), 0);
    while (g.phase !== 'aim') g.step(DT, [NO_INTENT, NO_INTENT]);
    g.step(DT, [{ shot: { angle: -Math.PI / 2, power: 1 }, power: false }, NO_INTENT]);
    let frames = 0;
    while ((g.phase as string) === 'roll') {
      g.step(DT, [NO_INTENT, NO_INTENT]);
      frames++;
      for (const b of g.balls.filter((b) => b.on)) {
        expect(b.x).toBeGreaterThanOrEqual(TABLE.left + PHYS.r - 0.01);
        expect(b.x).toBeLessThanOrEqual(TABLE.right - PHYS.r + 0.01);
        expect(b.y).toBeGreaterThanOrEqual(TABLE.top + PHYS.r - 0.01);
        expect(b.y).toBeLessThanOrEqual(TABLE.bottom - PHYS.r + 0.01);
      }
    }
    const on = g.balls.filter((b) => b.on);
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) expect(Math.hypot(on[i].x - on[j].x, on[i].y - on[j].y)).toBeGreaterThan(PHYS.r * 2 - 0.5);
    expect(frames / 60).toBeLessThan(PHYS.maxRoll);
  });

  it('the same shot rolls the same way twice', () => {
    const a = simulateShot(new MiniPool(bots('easy', 'easy'), false, makeRng(9), 0).balls, -1.5, 1, NO_MODS, DT);
    const b = simulateShot(new MiniPool(bots('easy', 'easy'), false, makeRng(9), 0).balls, -1.5, 1, NO_MODS, DT);
    expect(a.balls).toEqual(b.balls);
  });

  it('the aim guide finds the ghost ball where the cue first touches', () => {
    const balls = table(['cue', 180, 400], [0, 180, 300]);
    const hit = castAim(balls, -Math.PI / 2, 500);
    expect(hit.hit?.id).toBe(1);
    expect(hit.y).toBeCloseTo(300 + PHYS.r * 2, 3);
    const wall = castAim(balls, Math.PI / 2, 500);
    expect(wall.cushion).toBe(true);
    expect(wall.y).toBeCloseTo(TABLE.bottom - PHYS.r, 3);
  });
});

describe('Mini Pool rules', () => {
  it('racks 3 balls each and the 8, the 8 in the middle, the cue on the breaker’s spot', () => {
    for (const s of [0, 1] as PlayerIndex[]) {
      const g = new MiniPool(bots('easy', 'easy'), false, makeRng(5), s);
      expect(g.left(0)).toBe(RULES.ballsEach);
      expect(g.left(1)).toBe(RULES.ballsEach);
      const eight = g.balls.find((b) => b.kind === 'eight')!;
      expect(eight.y).toBe(MID);
      expect(g.cue.y).toBe(MiniPool.spot(s).y);
      expect(g.breaker).toBe(s);
      expect(g.firstBreaker).toBe(s);
    }
  });

  it('sinking one of yours shoots again; missing passes the turn', () => {
    const g = setUp(0, table(['cue', 180, 420], [0, 180, 300], [1, 300, 200], ['eight', 80, 300]));
    // Straight up the middle: the ball runs to the far cushion, no pocket there.
    shootAndWait(g, -Math.PI / 2, 0.3);
    expect(g.shooter).toBe(1);
    const g2 = setUp(0, table(['cue', 100, 300], [0, 60, 200], [1, 300, 200], ['eight', 200, 420]));
    shootAndWait(g2, at(g2.cue, ghostBall(g2.balls[1], POCKETS[0])), 0.5);
    expect(g2.left(0)).toBe(0);
    expect(g2.shooter).toBe(0);
  });

  it('a scratch hands the turn over and puts the cue ball back on the next player’s spot', () => {
    const g = setUp(0, table(['cue', 70, 160], [0, 200, 300], [1, 300, 400], ['eight', 180, 450]));
    shootAndWait(g, at(g.cue, POCKETS[0]), 0.4);
    expect(g.shooter).toBe(1);
    expect(g.cue.on).toBe(true);
    expect(g.cue.x).toBeCloseTo(MiniPool.spot(1).x, 0);
    expect(g.cue.y).toBeCloseTo(MiniPool.spot(1).y, 0);
  });

  it('the 8 wins once yours are all down, and loses if it drops early or with the cue', () => {
    const pot8 = (mine: boolean) => {
      const balls = table(['cue', 100, 300], ['eight', 60, 200], [1, 300, 400]);
      if (mine) balls.push({ id: 3, kind: 0, x: 280, y: 450, vx: 0, vy: 0, on: true });
      const g = setUp(0, balls);
      shootAndWait(g, at(g.cue, ghostBall(g.balls[1], POCKETS[0])), 0.5);
      return g;
    };
    const win = pot8(false);
    expect(win.finished).toBe(true);
    expect(win.winner).toBe(0);
    expect(win.lastRack?.how).toBe('eight');
    const early = pot8(true);
    expect(early.winner).toBe(1);
    expect(early.lastRack?.how).toBe('early8');
  });

  it('a scratch on the 8 loses the rack, even with yours all down', () => {
    const r = PHYS.r;
    // The 8 teetering on the lip of the top corner (it drops as the shot starts) while the
    // cue ball is rolled straight into the bottom corner.
    const g = setUp(0, table(['cue', TABLE.left + r, TABLE.bottom - r - 40], ['eight', TABLE.left + r, TABLE.top + r + 2], [1, 300, 400]));
    shootAndWait(g, Math.PI / 2, 0.3);
    expect(g.balls[1].on).toBe(false);
    expect(g.finished).toBe(true);
    expect(g.lastRack?.how).toBe('scratch8');
    expect(g.winner).toBe(1);
  });

  it('who breaks: the coin unless the app passes a starter', () => {
    const coins = new Set(Array.from({ length: 20 }, (_, s) => new MiniPool(bots('easy', 'easy'), false, makeRng(s)).firstBreaker));
    expect(coins.size).toBe(2);
    expect(new MiniPool(bots('easy', 'easy'), false, makeRng(3), 1).firstBreaker).toBe(1);
  });
});

describe('Mini Pool bots', () => {
  it('bot vs bot (normal) always finishes with a winner in a sane time', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { g } = playMatch(bots('normal', 'normal'), seed);
      expect(g.finished, `seed ${seed}`).toBe(true);
      expect(g.winner).not.toBeNull();
      expect(g.t).toBeLessThan(240);
    }
  }, 60_000);

  it('same seed, same match', () => {
    const a = playMatch(bots('normal', 'normal'), 11);
    const b = playMatch(bots('normal', 'normal'), 11);
    expect(a.g.winner).toBe(b.g.winner);
    expect(a.g.t).toBe(b.g.t);
    expect(a.events).toEqual(b.events);
  }, 60_000);

  it('hard beats easy most of the time, from either seat', () => {
    let hard = 0;
    for (let seed = 1; seed <= 8; seed++) {
      if (playMatch(bots('hard', 'easy'), seed).g.winner === 0) hard++;
      if (playMatch(bots('easy', 'hard'), seed + 100).g.winner === 1) hard++;
    }
    expect(hard).toBeGreaterThanOrEqual(12);
  }, 60_000);

  it('a bot never shoots before a person could have looked at the table', () => {
    for (const lvl of ['easy', 'normal', 'hard'] as BotLevel[]) {
      const rng = makeRng(4);
      const g = new MiniPool(bots(lvl, lvl), false, rng, 0);
      const b = [new MiniPoolBot(0, lvl, rng), new MiniPoolBot(1, lvl, rng)];
      let turnAt = 0;
      while (!g.finished && g.t < 120) {
        const i: [Intent, Intent] = [b[0].think(g, DT), b[1].think(g, DT)];
        if (g.phase === 'aim' && i[g.shooter].shot) expect(g.t - turnAt).toBeGreaterThan(0.9);
        g.step(DT, i);
        if (g.events.some((e) => e.type === 'turn')) turnAt = g.t;
      }
    }
  }, 60_000);
});

describe('Mini Pool handicap', () => {
  it('assist lengthens the aim guide and widens the pockets on your own shots only', () => {
    const g = new MiniPool([player({ bot: null, assist: 3 }), player({ bot: null, assist: 0 })], false, makeRng(1), 0);
    expect(g.guideLen(0)).toBe(RULES.guideMax);
    expect(g.guideLen(1)).toBe(RULES.guideMin);
    expect(g.modsFor(0).pocketBonus).toBe(RULES.pocketAssist);
    expect(g.modsFor(1).pocketBonus).toBe(0);
  });

  it('a near-miss at the corner drops in with the full help', () => {
    // A ball rolled along the top cushion, 8 units off it, into the corner.
    const drops = (bonus: number) => {
      const b = table(['cue', 300, 400], [0, 200, TABLE.top + PHYS.r + 8]);
      b[1].vx = -400;
      const ev: PhysEvent[] = [];
      for (let i = 0; i < 240; i++) stepTable(b, DT, { pocketBonus: bonus, frozenId: null }, ev);
      return ev.some((e) => e.type === 'pocket');
    };
    expect(drops(0)).toBe(false);
    expect(drops(RULES.pocketAssist)).toBe(true);
  });
  it('head start: plain misses a rack are forgiven, one per star (F358)', () => {
    expect([0, 1, 2, 3].map((a) => retriesFor(a))).toEqual([0, 1, 2, 3]);
    const helped: [PlayerInfo, PlayerInfo] = [player({ bot: null, assist: 3 }), player({ bot: null, assist: 0 })];
    const g = setUp(0, table(['cue', 180, 420], [0, 60, 300], [1, 300, 300], ['eight', 180, 200]), helped);
    expect(g.retries).toEqual([3, 0]);
    for (const left of [2, 1, 0]) {
      shootAndWait(g, 0, 0.1); // a soft roll at nothing: a plain miss
      expect(g.shooter, `forgiven, ${left} left`).toBe(0);
      expect(g.retries[0]).toBe(left);
    }
    shootAndWait(g, 0, 0.1);
    expect(g.shooter, 'none left: the turn passes').toBe(1);
    shootAndWait(g, Math.PI, 0.1);
    expect(g.shooter, 'no head start: a miss passes').toBe(0);
  });

  it('head start: the break and a scratch are never forgiven', () => {
    const helped: [PlayerInfo, PlayerInfo] = [player({ bot: null, assist: 3 }), player({ bot: null, assist: 0 })];
    const g = new MiniPool(helped, false, makeRng(1), 0);
    while (g.phase !== 'aim') g.step(DT, [NO_INTENT, NO_INTENT]);
    shootAndWait(g, -Math.PI / 2, 0.06); // a soft break that pots nothing
    expect(g.shooter).toBe(1);
    expect(g.retries[0]).toBe(3);
    const s = setUp(0, table(['cue', 300, 400], [0, 60, 300], [1, 300, 200], ['eight', 180, 200]), helped);
    shootAndWait(s, at(s.cue, POCKETS[3]), 0.5);
    expect(s.shooter, 'a scratch passes the turn').toBe(1);
    expect(s.retries[0]).toBe(3);
  });
});

describe('Mini Pool powers', () => {
  const people = (pw: [string, string]): [PlayerInfo, PlayerInfo] => [
    player({ bot: null, power: power('minipool', pw[0]) }),
    player({ bot: null, power: power('minipool', pw[1]) }),
  ];

  it('Long Aim: the next shot’s guide reaches the whole table, then it is used up', () => {
    const g = setUp(0, table(['cue', 180, 420], [0, 180, 300], [1, 300, 200], ['eight', 80, 300]), people(['longaim', 'longaim']), true);
    g.energy[0].value = 1;
    g.step(DT, [{ shot: null, power: true }, NO_INTENT]);
    expect(g.longAim[0]).toBe(true);
    expect(g.guideLen(0)).toBe(RULES.guideLong);
    shootAndWait(g, 0.3, 0.2);
    expect(g.longAim[0]).toBe(false);
    expect(g.guideLen(0)).toBe(RULES.guideMin);
  });

  it('Big Pockets: the next shot’s pockets are much bigger', () => {
    const g = setUp(0, table(['cue', 180, 420], [0, 180, 300], [1, 300, 200], ['eight', 80, 300]), people(['bigpocket', 'bigpocket']), true);
    expect(g.modsFor(0).pocketBonus).toBe(0);
    g.energy[0].value = 1;
    g.step(DT, [{ shot: null, power: true }, NO_INTENT]);
    expect(g.modsFor(0).pocketBonus).toBe(RULES.bigPocket);
    g.step(DT, [{ shot: { angle: -Math.PI / 2, power: 0.2 }, power: false }, NO_INTENT]);
    expect(g.shotMods.pocketBonus).toBe(RULES.bigPocket);
    expect(g.bigPocket[0]).toBe(false);
  });

  it('Freeze Ball: their ball nearest a pocket is frozen still on their next shot only', () => {
    // Seat 1's ball by the corner pocket, and another far from every pocket.
    const g = setUp(0, table(['cue', 180, 480], [1, 70, 140], [1, 180, 250], [0, 250, 450], ['eight', 120, 400]), people(['freeze', 'freeze']), true);
    g.energy[0].value = 1;
    g.step(DT, [{ shot: null, power: true }, NO_INTENT]);
    expect(g.freezeOn[1]).toBe(true);
    expect(g.frozenId).toBeNull(); // picked when their turn starts, so they see it
    shootAndWait(g, 0, 0.15); // seat 0 dribbles sideways: a miss, seat 1 is up
    expect(g.shooter).toBe(1);
    expect(g.frozenId).toBe(1);
    // Seat 1 smashes their own frozen ball toward the pocket: it doesn't budge.
    const before = { x: g.balls[1].x, y: g.balls[1].y };
    shootAndWait(g, at(g.cue, g.balls[1]), 0.9);
    expect(g.balls[1].on).toBe(true);
    expect(g.balls[1].x).toBeCloseTo(before.x, 6);
    expect(g.balls[1].y).toBeCloseTo(before.y, 6);
    expect(g.frozenId).toBeNull();
    expect(g.freezeOn[1]).toBe(false);
  });

  it('Stop Shot: the cue ball stops dead where it hits a ball, on the next shot only', () => {
    const g = setUp(0, table(['cue', 180, 480], [0, 180, 300], [1, 300, 200], ['eight', 80, 300]), people(['stop', 'stop']), true);
    g.energy[0].value = 1;
    g.step(DT, [{ shot: null, power: true }, NO_INTENT]);
    expect(g.stopOn[0]).toBe(true);
    expect(g.modsFor(0).stop).toBe(true);
    expect(g.canFire(0)).toBe(false);
    // A thin cut up into seat 0's ball: the cue stays where it touched instead of glancing off.
    shootAndWait(g, -Math.PI / 2 + 0.04, 0.5);
    expect(g.stopOn[0]).toBe(false);
    expect(g.cue.x).toBeLessThan(190);
    // The same shot without it: the cue glances away to the side.
    const h = setUp(0, table(['cue', 180, 480], [0, 180, 300], [1, 300, 200], ['eight', 80, 300]), people(['stop', 'stop']), true);
    shootAndWait(h, -Math.PI / 2 + 0.04, 0.5);
    expect(h.cue.x).toBeGreaterThan(200);
  });

  it('Plug a Pocket: the pocket by their best ball is plugged on their next shot only', () => {
    // Seat 1's ball sits right by the top-left corner (pocket 0).
    const g = setUp(0, table(['cue', 180, 480], [1, 70, 140], [1, 180, 250], [0, 250, 450], ['eight', 120, 400]), people(['plug', 'plug']), true);
    g.shotsThisRack = 3;
    g.energy[0].value = 1;
    g.step(DT, [{ shot: null, power: true }, NO_INTENT]);
    expect(g.plugOn[1]).toBe(true);
    expect(g.plugged).toBeNull(); // picked when their turn starts, so they see it
    shootAndWait(g, 0, 0.15); // seat 0 misses: seat 1 is up
    expect(g.shooter).toBe(1);
    expect(g.plugged).toBe(0);
    expect(g.modsFor(1).closed).toBe(0);
    // A ball rolled straight into the plugged pocket stays on the table; the same roll drops otherwise.
    const roll = (closed: number | null) => {
      const b: Ball[] = [{ id: 0, kind: 'cue', x: 120, y: 190, vx: 0, vy: 0, on: true }];
      const ev: PhysEvent[] = [];
      strike(b, Math.atan2(TABLE.top - 190, TABLE.left - 120), 0.5);
      for (let i = 0; i < 240; i++) stepTable(b, DT, { pocketBonus: 0, frozenId: null, closed }, ev);
      return b[0].on;
    };
    expect(roll(null)).toBe(false);
    expect(roll(0)).toBe(true);
    // Their shot ends: the plug comes off.
    shootAndWait(g, Math.PI, 0.1);
    expect(g.plugged).toBeNull();
    expect(g.plugOn[1]).toBe(false);
    expect(g.modsFor(0).closed ?? null).toBeNull();
  });

  it('powers can’t be fired in classic mode or without a full bar', () => {
    const g = setUp(0, table(['cue', 180, 420], [0, 180, 300], [1, 300, 200], ['eight', 80, 300]), people(['bigpocket', 'bigpocket']), false);
    g.energy[0].value = 1;
    expect(g.canFire(0)).toBe(false);
    const h = setUp(0, table(['cue', 180, 420], [0, 180, 300], [1, 300, 200], ['eight', 80, 300]), people(['bigpocket', 'bigpocket']), true);
    h.energy[0].value = 0.5;
    expect(h.canFire(0)).toBe(false);
  });

  it('bots with powers use them and the match still ends', () => {
    for (const pw of ['longaim', 'bigpocket', 'freeze', 'stop', 'plug']) {
      const { g, events } = playMatch(bots('normal', 'normal', [0, 0], [pw, pw]), 21, true);
      expect(g.finished, pw).toBe(true);
      expect(events.some((e) => e.startsWith(`power:`)), pw).toBe(true);
    }
  }, 60_000);
});

describe('Mini Pool view', () => {
  const sfx = { play() {} } as unknown as Sfx;

  it('a person pulls back in their own half and lets go: the cue ball goes the other way', () => {
    let ended = false;
    const view = GAMES.minipool.create({ seed: 2, rng: makeRng(2), players: [player({ bot: null }), player({ bot: null })], powersOn: false, sfx, fx: new Fx(), starter: 0, end() { ended = true; } }) as unknown as {
      game: MiniPool;
      update(dt: number, i: Input): void;
    };
    const input = new Input();
    const g = view.game;
    while (g.phase !== 'aim') (view.update(DT, input), input.endFrame());
    expect(g.shooter).toBe(0);
    // Seat 1 touching their half does nothing on seat 0's shot.
    input.down(9, 180, 120);
    view.update(DT, input);
    input.endFrame();
    input.move(9, 180, 40);
    view.update(DT, input);
    input.endFrame();
    input.up(9);
    view.update(DT, input);
    input.endFrame();
    expect(g.phase).toBe('aim');
    // Seat 0 pulls straight down toward themselves: the shot goes up the table, at the rack.
    input.down(1, 180, 560);
    view.update(DT, input);
    input.endFrame();
    input.move(1, 180, 640);
    view.update(DT, input);
    input.endFrame();
    input.up(1);
    view.update(DT, input);
    input.endFrame();
    expect(g.phase).toBe('roll');
    expect(g.cue.vy).toBeLessThan(0);
    expect(Math.abs(g.cue.vx)).toBeLessThan(1);
    expect(ended).toBe(false);
  });

  it('a whole match against the bot renders and reports a result once', () => {
    const results: unknown[] = [];
    const { g: g2d, words } = recorder();
    const view = GAMES.minipool.create({
      seed: 4, rng: makeRng(4), players: [player({ bot: 'normal', power: power('minipool', 'freeze') }), player({ bot: 'hard', power: power('minipool', 'longaim') })], powersOn: true, sfx, fx: new Fx(),
      end(r) { results.push(r); },
    });
    const input = new Input();
    for (let i = 0; i < 60 * 300 && !results.length; i++) {
      view.update(DT, input);
      if (i % 30 === 0) view.render(g2d);
    }
    expect(results.length).toBe(1);
    const r = results[0] as { winner: number; score: [number, number]; summary: string };
    expect([0, 1]).toContain(r.winner);
    expect(r.summary.length).toBeGreaterThan(0);
    expect(words.some((w) => /shot|Lining up|thinking/.test(w.str))).toBe(true);
  }, 60_000);
});
