// Mini Pool rules: pure and deterministic, so tests can run whole matches.
// A quick 1v1 eight-ball: each player owns three balls in their colour. Sink yours, then
// the black 8 to win the rack. Sinking one of yours shoots again; sinking the cue ball
// (a scratch) hands the turn over. The 8 down early, or with the cue ball, loses the rack.
// One rack decides it (RULES.racksToWin can make it a longer match); the break takes turns.
import { Energy } from '../../core/energy';
import { lerpAssist } from '../../core/handicap';
import { HUMAN } from '../../core/human';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';
import { MID, W } from '../../engine/world';
import {
  ghostBall, moving, PHYS, POCKETS, simulateShot, stepTable, strike, TABLE,
  type Ball, type Kind, type PhysEvent, type ShotMods,
} from './physics';

export const RULES = {
  racksToWin: 1,
  ballsEach: 3,
  introTime: 1.5,
  settleTime: 0.45,
  rackEndTime: 2.6,
  /** Softest shot allowed (fraction of full power). */
  minPower: 0.06,
  /** Aim guide length at assist 0 and 3 (and with Long Aim). */
  guideMin: 90,
  guideMax: 230,
  guideLong: 900,
  /** Extra pocket capture radius on your own shots, per head-start star. Three stars jump to 8
   *  (was 5, a straight line) with five forgiven misses, so easy+3 catches the hard bot
   *  (F436, `npm run pool`, n=80: easy+3 v hard 28% -> ~50%, v normal 53% -> ~65%). */
  pocketAssist: [0, 5 / 3, 10 / 3, 8],
  /** Extra pocket capture radius from Big Pockets. */
  bigPocket: 11,
  /** A rack with this many shots ends: fewer balls left wins it (so a rack can't go on for
   *  ever). At 40, two easy players ended 30% of racks here, mostly both left on the 8, so the
   *  rack went to "fewer balls left" (or, level, to the one who didn't break) instead of the 8;
   *  at 80 it's 3% for ~13 s more a match (F357, `npm run pool`). */
  rackShotCap: 80,
  /** Head start: plain misses a rack forgiven (the helped player shoots again), per star. */
  assistRetries: [0, 1, 2, 5],
  /** Where the cue ball starts (and comes back after a scratch): this far into the shooter's half. */
  spotDy: 115,
  energyShot: 0.14,
  energyPot: 0.3,
  energyConcede: 0.18,
};

export type Phase = 'intro' | 'aim' | 'roll' | 'settle' | 'rackEnd' | 'over';

export type Shot = { angle: number; power: number };
/** What a player wants this step: a released shot (counts only on their turn) and/or firing their power. */
export type Intent = { shot: Shot | null; power: boolean };
export const NO_INTENT: Intent = { shot: null, power: false };

export type RackEnd = 'eight' | 'early8' | 'scratch8' | 'cap';

export type Event =
  | { type: 'rack'; rack: number; breaker: PlayerIndex }
  | { type: 'turn'; p: PlayerIndex; again: boolean }
  | { type: 'shot'; p: PlayerIndex; x: number; y: number; power: number }
  | PhysEvent
  | { type: 'scratch'; p: PlayerIndex }
  | { type: 'retry'; p: PlayerIndex; left: number }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'frozen'; p: PlayerIndex; id: number }
  | { type: 'plugged'; p: PlayerIndex; pocket: number }
  | { type: 'rackWon'; p: PlayerIndex; how: RackEnd }
  | { type: 'win'; p: PlayerIndex };

/** Extra pocket capture radius for a head start of `assist` stars (between stars, in step). */
export function pocketAssistFor(assist: number): number {
  const a = Math.max(0, Math.min(3, assist));
  const i = Math.min(2, Math.floor(a));
  const t = RULES.pocketAssist;
  return t[i] + (t[i + 1] - t[i]) * (a - i);
}

/** Forgiven misses a rack for a head start of `assist` stars. */
export function retriesFor(assist: number): number {
  return RULES.assistRetries[Math.max(0, Math.min(3, Math.round(assist)))];
}

export class MiniPool {
  balls: Ball[] = [];
  phase: Phase = 'intro';
  timer = RULES.introTime;
  rack = 0;
  breaker: PlayerIndex;
  readonly firstBreaker: PlayerIndex;
  shooter: PlayerIndex;
  /** Increments each time a turn starts (bots use it to know a new turn began). */
  turnId = 0;
  shotsThisRack = 0;
  /** Head-start misses still forgiven this rack ("Another go!"). */
  retries: [number, number] = [0, 0];
  /** Racks won. */
  score: [number, number] = [0, 0];
  energy: [Energy, Energy];
  /** Long Aim / Big Pockets armed for this player's next shot. */
  longAim: [boolean, boolean] = [false, false];
  bigPocket: [boolean, boolean] = [false, false];
  /** Freeze Ball armed against this player's next shot (by the other player). */
  freezeOn: [boolean, boolean] = [false, false];
  /** The ball frozen for the current shooter's shot, once picked (shown while they aim). */
  frozenId: number | null = null;
  /** Stop Shot armed for this player's next shot. */
  stopOn: [boolean, boolean] = [false, false];
  /** Plug a Pocket armed against this player's next shot (by the other player). */
  plugOn: [boolean, boolean] = [false, false];
  /** The pocket plugged for the current shooter's shot, once picked (shown while they aim). */
  plugged: number | null = null;
  /** Mods of the shot rolling now. */
  shotMods: ShotMods = { pocketBonus: 0, frozenId: null };
  /** Balls that went down on the shot rolling now. */
  potted: Ball[] = [];
  lastRack: { p: PlayerIndex; how: RackEnd } | null = null;
  aimT = 0;
  winner: PlayerIndex | null = null;
  finished = false;
  events: Event[] = [];
  t = 0;
  private phys: PhysEvent[] = [];

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    readonly powersOn: boolean,
    private readonly rng: Rng,
    /** Who breaks the first rack; undefined = coin toss. */
    starter?: PlayerIndex,
  ) {
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    const coin: PlayerIndex = rng.chance(0.5) ? 0 : 1;
    this.breaker = starter ?? coin;
    this.firstBreaker = this.breaker;
    this.shooter = this.breaker;
    this.setRack();
  }

  get cue(): Ball {
    return this.balls[0];
  }

  /** This player's balls still on the table. */
  left(p: PlayerIndex): number {
    return this.balls.filter((b) => b.on && b.kind === p).length;
  }

  /** The balls this player should sink now: theirs, or the 8 once theirs are all down. */
  targets(p: PlayerIndex): Ball[] {
    const mine = this.balls.filter((b) => b.on && b.kind === p);
    return mine.length ? mine : this.balls.filter((b) => b.on && b.kind === 'eight');
  }

  /** Aim guide length (units) this player sees on their shot. */
  guideLen(p: PlayerIndex): number {
    return this.longAim[p] ? RULES.guideLong : lerpAssist(this.players[p].assist, RULES.guideMin, RULES.guideMax);
  }

  /** The physics mods that apply to this player's shot (what the bot and the guide see too). */
  modsFor(p: PlayerIndex): ShotMods {
    const bonus = pocketAssistFor(this.players[p].assist) + (this.bigPocket[p] ? RULES.bigPocket : 0);
    return { pocketBonus: bonus, frozenId: this.shooter === p ? this.frozenId : null, closed: this.shooter === p ? this.plugged : null, stop: this.stopOn[p] };
  }

  /** Where the cue ball sits for this player (break, and after a scratch). */
  static spot(p: PlayerIndex): { x: number; y: number } {
    return { x: W / 2, y: p === 0 ? MID + RULES.spotDy : MID - RULES.spotDy };
  }

  canFire(p: PlayerIndex): boolean {
    const pw = this.players[p].power;
    if (!this.powersOn || !pw || this.phase === 'over' || !this.energy[p].ready) return false;
    if (pw.id === 'longaim') return !this.longAim[p];
    if (pw.id === 'bigpocket') return !this.bigPocket[p];
    if (pw.id === 'freeze') {
      const q = other(p);
      return !this.freezeOn[q] && this.targets(q).length > 0;
    }
    if (pw.id === 'stop') return !this.stopOn[p];
    if (pw.id === 'plug') {
      const q = other(p);
      return !this.plugOn[q] && this.targets(q).length > 0;
    }
    return false;
  }

  step(dt: number, intents: [Intent, Intent]): void {
    this.events = [];
    if (this.finished) return;
    this.t += dt;
    for (const p of [0, 1] as PlayerIndex[]) {
      this.energy[p].tick(dt);
      if (intents[p].power) this.firePower(p);
    }
    switch (this.phase) {
      case 'intro':
        this.timer -= dt;
        if (this.timer <= 0) this.beginTurn(this.breaker, false);
        break;
      case 'aim': {
        this.aimT += dt;
        const shot = intents[this.shooter].shot;
        if (shot) this.shoot(shot);
        break;
      }
      case 'roll':
        this.rollStep(dt);
        break;
      case 'settle':
        this.timer -= dt;
        if (this.timer <= 0) this.resolve();
        break;
      case 'rackEnd':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.rack++;
          this.breaker = other(this.breaker);
          this.setRack();
        }
        break;
      case 'over':
        break;
    }
  }

  /** Racks the balls: the 8 in the middle of the table, the point toward the breaker. */
  private setRack(): void {
    this.retries = [retriesFor(this.players[0].assist), retriesFor(this.players[1].assist)];
    const r = PHYS.r;
    const s = this.breaker === 0 ? 1 : -1;
    const dx = r * 2 + 0.6;
    const dy = (r * 2 + 0.6) * 0.866;
    const owners: PlayerIndex[] = [];
    for (let i = 0; i < RULES.ballsEach; i++) owners.push(0, 1);
    for (let i = owners.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [owners[i], owners[j]] = [owners[j], owners[i]];
    }
    // Rows from the point: 1, 2, 3 (the 8 in the middle), then 1 behind.
    const spots: { x: number; y: number }[] = [];
    const rows = [1, 2, 3, 1];
    rows.forEach((n, k) => {
      for (let j = 0; j < n; j++) spots.push({ x: W / 2 + (j - (n - 1) / 2) * dx, y: MID + s * (2 - k) * dy });
    });
    const cue = MiniPool.spot(this.breaker);
    this.balls = [{ id: 0, kind: 'cue', x: cue.x, y: cue.y, vx: 0, vy: 0, on: true }];
    let o = 0;
    spots.forEach((sp, i) => {
      const kind: Kind = i === 4 ? 'eight' : owners[o++];
      this.balls.push({ id: i + 1, kind, x: sp.x, y: sp.y, vx: 0, vy: 0, on: true });
    });
    this.shotsThisRack = 0;
    this.longAim = [false, false];
    this.bigPocket = [false, false];
    this.freezeOn = [false, false];
    this.frozenId = null;
    this.stopOn = [false, false];
    this.plugOn = [false, false];
    this.plugged = null;
    this.phase = 'intro';
    this.timer = RULES.introTime;
    this.events.push({ type: 'rack', rack: this.rack, breaker: this.breaker });
  }

  private beginTurn(p: PlayerIndex, again: boolean): void {
    this.shooter = p;
    this.phase = 'aim';
    this.aimT = 0;
    this.turnId++;
    if (this.freezeOn[p] && this.frozenId === null) this.pickFrozen(p);
    if (this.plugOn[p] && this.plugged === null) this.pickPlug(p);
    this.events.push({ type: 'turn', p, again });
  }

  /** Freeze Ball picks the ball this player most wants: of their targets, the one nearest a pocket. */
  private pickFrozen(p: PlayerIndex): void {
    let best: Ball | null = null;
    let bd = Infinity;
    for (const b of this.targets(p)) {
      const d = Math.min(...POCKETS.map((pk) => Math.hypot(b.x - pk.x, b.y - pk.y)));
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (!best) {
      this.freezeOn[p] = false;
      return;
    }
    this.frozenId = best.id;
    this.events.push({ type: 'frozen', p, id: best.id });
  }

  /** Plug a Pocket closes the pocket this player's best ball sits nearest (of their targets). */
  private pickPlug(p: PlayerIndex): void {
    let best = -1;
    let bd = Infinity;
    for (const b of this.targets(p)) {
      POCKETS.forEach((pk, i) => {
        const d = Math.hypot(b.x - pk.x, b.y - pk.y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
    }
    if (best < 0) {
      this.plugOn[p] = false;
      return;
    }
    this.plugged = best;
    this.events.push({ type: 'plugged', p, pocket: best });
  }

  private firePower(p: PlayerIndex): void {
    if (!this.canFire(p)) return;
    const pw = this.players[p].power!;
    this.energy[p].spend(0);
    if (pw.id === 'longaim') this.longAim[p] = true;
    else if (pw.id === 'bigpocket') this.bigPocket[p] = true;
    else if (pw.id === 'freeze') {
      const q = other(p);
      this.freezeOn[q] = true;
      // If they are lining up right now, the ball freezes (and shows) at once.
      if (this.shooter === q && this.phase === 'aim') this.pickFrozen(q);
    } else if (pw.id === 'stop') this.stopOn[p] = true;
    else if (pw.id === 'plug') {
      const q = other(p);
      this.plugOn[q] = true;
      if (this.shooter === q && this.phase === 'aim') this.pickPlug(q);
    }
    this.events.push({ type: 'power', p, id: pw.id });
  }

  private shoot(shot: Shot): void {
    const p = this.shooter;
    const power = Math.max(RULES.minPower, Math.min(1, shot.power));
    this.shotMods = this.modsFor(p);
    this.longAim[p] = false;
    this.bigPocket[p] = false;
    this.stopOn[p] = false;
    this.potted = [];
    this.shotsThisRack++;
    this.energy[p].charge(RULES.energyShot, this.trailing(p));
    strike(this.balls, shot.angle, power);
    this.phase = 'roll';
    this.events.push({ type: 'shot', p, x: this.cue.x, y: this.cue.y, power });
  }

  /** Behind on racks, or with more balls left in this rack. */
  trailing(p: PlayerIndex): boolean {
    const q = other(p);
    return this.score[p] < this.score[q] || (this.score[p] === this.score[q] && this.left(p) > this.left(q));
  }

  private rollStep(dt: number): void {
    this.phys.length = 0;
    stepTable(this.balls, dt, this.shotMods, this.phys);
    for (const e of this.phys) {
      this.events.push(e);
      if (e.type === 'pocket') this.potted.push(this.balls[e.id]);
    }
    if (!moving(this.balls)) {
      this.phase = 'settle';
      this.timer = RULES.settleTime;
    }
  }

  /** Who shoots next after the shot that just stopped, or who took the rack. */
  private resolve(): void {
    const p = this.shooter;
    const q = other(p);
    const scratch = this.potted.some((b) => b.kind === 'cue');
    const eight = this.potted.some((b) => b.kind === 'eight');
    const mine = this.potted.filter((b) => b.kind === p).length;
    const theirs = this.potted.filter((b) => b.kind === q).length;
    if (this.freezeOn[p]) {
      this.freezeOn[p] = false;
      this.frozenId = null;
    }
    if (this.plugOn[p]) {
      this.plugOn[p] = false;
      this.plugged = null;
    }
    for (let i = 0; i < mine; i++) {
      this.energy[p].charge(RULES.energyPot, this.trailing(p));
      this.energy[q].charge(RULES.energyConcede, this.trailing(q));
    }
    for (let i = 0; i < theirs; i++) this.energy[p].charge(RULES.energyConcede, this.trailing(p));
    if (eight) {
      if (scratch) return this.endRack(q, 'scratch8');
      return this.left(p) === 0 ? this.endRack(p, 'eight') : this.endRack(q, 'early8');
    }
    if (this.shotsThisRack >= RULES.rackShotCap) {
      const a = this.left(0);
      const b = this.left(1);
      return this.endRack(a < b ? 0 : b < a ? 1 : other(this.breaker), 'cap');
    }
    if (scratch) {
      this.events.push({ type: 'scratch', p });
      this.respotCue(q);
      return this.beginTurn(q, false);
    }
    if (mine > 0) return this.beginTurn(p, true);
    if (this.retries[p] > 0 && this.shotsThisRack > 1) {
      this.retries[p]--;
      this.events.push({ type: 'retry', p, left: this.retries[p] });
      return this.beginTurn(p, true);
    }
    this.beginTurn(q, false);
  }

  /** The cue ball back on the player's spot, or the nearest free place beside it. */
  private respotCue(p: PlayerIndex): void {
    const s = MiniPool.spot(p);
    const free = (x: number, y: number) => this.balls.every((b) => !b.on || b.kind === 'cue' || Math.hypot(b.x - x, b.y - y) > PHYS.r * 2 + 1);
    const out = p === 0 ? 1 : -1;
    let at = s;
    search: for (let d = 0; d < 200; d += 6) {
      for (const dx of d === 0 ? [0] : [d, -d]) {
        for (const dy of [0, out * d]) {
          const x = s.x + dx;
          const y = s.y + dy;
          if (x < TABLE.left + PHYS.r + 2 || x > TABLE.right - PHYS.r - 2) continue;
          if (y < TABLE.top + PHYS.r + 2 || y > TABLE.bottom - PHYS.r - 2) continue;
          if (free(x, y)) {
            at = { x, y };
            break search;
          }
        }
      }
    }
    Object.assign(this.cue, { x: at.x, y: at.y, vx: 0, vy: 0, on: true });
  }

  private endRack(w: PlayerIndex, how: RackEnd): void {
    this.score[w]++;
    this.lastRack = { p: w, how };
    this.events.push({ type: 'rackWon', p: w, how });
    if (this.score[w] >= RULES.racksToWin) {
      this.phase = 'over';
      this.finished = true;
      this.winner = w;
      this.events.push({ type: 'win', p: w });
      return;
    }
    this.phase = 'rackEnd';
    this.timer = RULES.rackEndTime;
  }
}

// ---------- Honest bot ----------
// It lines up like a careful player: for each of its balls and each pocket it works out the
// "ghost ball" line, tries a few strengths (plus a ring of safety shots) with the same
// deterministic physics a person estimates by eye, scores where everything ends up, picks
// one of its best lines, then strikes it with hand-shake noise. Skill changes the noise,
// how many shots it considers, how often it settles for a lesser line and how long it
// takes, never the physics or the rules. It sees only what a person sees (a frozen ball is
// shown on the table).
const BOT = {
  easy: { aim: 0.055, pow: 0.22, ring: 8, powers: [0.45, 0.8], pick: 4, delay: 1.7, careful: 0 },
  normal: { aim: 0.022, pow: 0.1, ring: 16, powers: [0.35, 0.55, 0.85], pick: 2, delay: 1.3, careful: 0 },
  hard: { aim: 0.007, pow: 0.04, ring: 24, powers: [0.3, 0.45, 0.65, 0.9], pick: 1, delay: 1.05, careful: 5 },
} satisfies Record<BotLevel, { aim: number; pow: number; ring: number; powers: number[]; pick: number; delay: number; careful: number }>;

/**
 * F435: a strong player looks at what a slightly-off hit would do to the 8. `careful` lines
 * (hard only) are tried again on a 4 x 4 grid across the bot's own hand-shake (aim and power
 * at -0.9, -0.3, 0.3, 0.9 of it); each of these near misses that sinks the 8 for a loss costs the line a share of
 * a lost rack. Before this, hard v hard lost 10% of racks to an early 8, all of them a safe
 * plan that the shake turned into a loss (`npm run pool`).
 */
const SHAKES: readonly [number, number][] = [-0.9, -0.3, 0.3, 0.9].flatMap((a) => [-0.9, -0.3, 0.3, 0.9].map((p): [number, number] => [a, p]));

/** What a bot on the 8 marks down a shot that misses the 8 entirely (F439). */
const NO_TOUCH = 60;

/** Shots tried per frame while lining up, so a turn never hitches. */
const SIMS_PER_FRAME = 6;

export class MiniPoolBot {
  private turn = -1;
  private queue: Shot[] = [];
  private tried: { shot: Shot; score: number; shaken?: number }[] = [];
  /** Careful lines still to shake-test this turn (F435). */
  private checks = 0;
  private releaseT = 0;
  private powerAt = Infinity;
  /** The other player's Freeze or Plug that the lined-up shots were judged with. */
  private planKey = '';

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  think(game: MiniPool, dt: number): Intent {
    const me = this.p;
    const id = game.players[me].power?.id;
    // Freeze: once the other player starts lining up (after a person's reaction time).
    if ((id === 'freeze' || id === 'plug') && game.phase === 'aim' && game.shooter !== me && game.aimT >= HUMAN.reaction + 0.2 && game.canFire(me)) {
      return { shot: null, power: true };
    }
    if (game.phase !== 'aim' || game.shooter !== me) return NO_INTENT;
    const key = (m: ShotMods) => `${m.frozenId}|${m.closed ?? null}`;
    // A freeze or plug landing mid-aim changes the table: line up again (from a fresh look).
    if (this.turn !== game.turnId || key(game.modsFor(me)) !== this.planKey) this.plan(game, dt);
    if ((id === 'bigpocket' || id === 'longaim' || id === 'stop') && game.canFire(me) && game.t >= this.powerAt) {
      // Fired before lining up, so the bigger pockets count in its sums. Start over.
      this.turn = -1;
      return { shot: null, power: true };
    }
    const mods = game.modsFor(me);
    let budget = SIMS_PER_FRAME;
    while (budget > 0 && this.queue.length) {
      budget--;
      const s = this.queue.pop()!;
      this.tried.push({ shot: s, score: this.judge(game, s, mods, dt) });
    }
    const cfg = BOT[this.level];
    // Shake-test the best lines, a few sims a frame, until the best one is clean (F435).
    while (!this.queue.length && this.checks > 0 && budget > 0) {
      this.tried.sort((a, b) => b.score - a.score);
      const top = this.tried[0];
      if (top.shaken === SHAKES.length) {
        this.checks = 0;
        break;
      }
      top.shaken ??= 0;
      while (budget > 0 && top.shaken < SHAKES.length) {
        budget--;
        const [da, dp] = SHAKES[top.shaken++];
        const s = { angle: top.shot.angle + da * cfg.aim, power: clamp(top.shot.power * (1 + dp * cfg.pow)) };
        if (this.judge(game, s, mods, dt) <= -2000) top.score -= 2000 / SHAKES.length;
      }
      if (top.shaken === SHAKES.length) this.checks--;
    }
    if (this.queue.length || this.checks > 0 || game.t + dt < this.releaseT) return NO_INTENT;
    this.tried.sort((a, b) => b.score - a.score);
    // Never settle for a lesser line when the best one wins the rack.
    const pool = this.tried[0].score >= 1000 ? 1 : Math.min(cfg.pick, this.tried.length);
    const pick = this.tried[Math.floor(this.rng.next() * pool)].shot;
    const tri = () => this.rng.next() + this.rng.next() - 1;
    return { shot: { angle: pick.angle + tri() * cfg.aim, power: clamp(pick.power * (1 + tri() * cfg.pow)) }, power: false };
  }

  private plan(game: MiniPool, dt: number): void {
    const cfg = BOT[this.level];
    this.turn = game.turnId;
    this.planKey = `${game.modsFor(this.p).frozenId}|${game.modsFor(this.p).closed ?? null}`;
    this.tried = [];
    this.queue = [];
    this.checks = cfg.careful;
    this.releaseT = game.t + Math.round(cfg.delay / dt) * dt;
    this.powerAt = game.t + HUMAN.reaction + 0.15;
    const cue = game.cue;
    // The break: smash the point of the rack.
    if (game.shotsThisRack === 0) {
      const apex = game.balls.reduce((a, b) => (b.kind !== 'cue' && Math.abs(b.y - cue.y) < Math.abs(a.y - cue.y) ? b : a), game.balls[1]);
      const a = Math.atan2(apex.y - cue.y, apex.x - cue.x);
      for (const d of [-0.03, 0, 0.03]) this.queue.push({ angle: a + d, power: 1 });
      return;
    }
    let lines = 0;
    for (const t of game.targets(this.p)) {
      for (const pk of POCKETS) {
        const gb = ghostBall(t, pk);
        const a = Math.atan2(gb.y - cue.y, gb.x - cue.x);
        // Skip cuts too thin to make (the cue would have to come from behind).
        const cut = Math.cos(a - Math.atan2(gb.uy, gb.ux));
        if (cut < 0.15) continue;
        lines++;
        for (const pw of cfg.powers) this.queue.push({ angle: a, power: pw });
      }
    }
    const aim0 = game.targets(this.p)[0];
    const base = aim0 ? Math.atan2(aim0.y - cue.y, aim0.x - cue.x) : 0;
    // F439: on the 8 with no line to sink it, hit it thick and thin both sides instead, so the
    // bot still has shots that move it (the ring alone can miss it).
    if (aim0 && !lines && game.left(this.p) === 0) {
      const edge = Math.asin(Math.min(1, (PHYS.r * 2) / Math.max(PHYS.r * 2, Math.hypot(aim0.x - cue.x, aim0.y - cue.y))));
      for (const f of [-0.5, -0.25, 0, 0.25, 0.5]) for (const pw of cfg.powers) this.queue.push({ angle: base + f * edge, power: pw });
    }
    for (let i = 0; i < cfg.ring; i++) this.queue.push({ angle: base + (i * Math.PI * 2) / cfg.ring, power: 0.5 });
  }

  /** How good a shot looks once everything stops (higher is better). */
  private judge(game: MiniPool, s: Shot, mods: ShotMods, dt: number): number {
    const me = this.p;
    const them = other(me);
    const res = simulateShot(game.balls, s.angle, s.power, mods, dt);
    const scratch = res.potted.some((b) => b.kind === 'cue');
    const eight = res.potted.some((b) => b.kind === 'eight');
    const mine = res.potted.filter((b) => b.kind === me).length;
    const theirs = res.potted.filter((b) => b.kind === them).length;
    const leftAfter = res.balls.filter((b) => b.on && b.kind === me).length;
    if (eight) return !scratch && leftAfter === 0 ? 2000 : -2000;
    let score = mine * 120 - theirs * 50 - (scratch ? 160 : 0);
    // F439: on the 8 with no line to sink it, still play the 8 (as a pool player must). A
    // shot that never touches it was as good as any miss, so two hard bots with the 8 on a
    // cushion both rolled the cue around it for 70 shots and the rack hit the shot cap.
    if (game.left(me) === 0 && res.firstHit !== game.balls.find((b) => b.kind === 'eight')?.id) score -= NO_TOUCH;
    // Leave: my balls near pockets, theirs far, and (if I shoot again) the cue near one of mine.
    const near = (b: Ball) => Math.min(...POCKETS.map((pk) => Math.hypot(b.x - pk.x, b.y - pk.y)));
    for (const b of res.balls) {
      if (!b.on) continue;
      if (b.kind === me) score -= near(b) * 0.06;
      else if (b.kind === them) score += near(b) * 0.03;
    }
    if (mine > 0 && !scratch) {
      const cue = res.balls[0];
      const next = res.balls.filter((b) => b.on && (leftAfter ? b.kind === me : b.kind === 'eight'));
      if (next.length) score -= Math.min(...next.map((b) => Math.hypot(b.x - cue.x, b.y - cue.y))) * 0.04;
    }
    return score;
  }
}

function clamp(p: number): number {
  return Math.max(RULES.minPower, Math.min(1, p));
}
