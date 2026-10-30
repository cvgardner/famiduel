// Penalty Shootout rules: players swap shooter / keeper every kick. Five kicks
// each, then sudden death. Pure and deterministic so tests can play whole
// shootouts.
import { Energy } from '../../core/energy';
import { lerpAssist } from '../../core/handicap';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';
import { clamp, H, W } from '../../engine/world';

export const RULES = {
  kicks: 5,
  /** Safety cap: after this many kicks each with no winner, it's a draw. */
  maxKicks: 20,
  /** Goal line y of the goal player p defends (p0 at the bottom, p1 at the top). */
  goalY: [H - 160, 160] as const,
  /** Distance from the penalty spot to the goal line. */
  spotDist: 240,
  goalW: 150,
  goalWMax: 172,
  ballR: 8,
  /** Shot speed (units/s) at power 0 and 1. */
  speedMin: 260,
  speedMax: 820,
  /** Power above this sails over the bar. */
  overAt: 0.93,
  /** Weakest power a swipe can give. */
  minPower: 0.08,
  /** Sideways aim: how far one unit of swipe slope moves the aim on the goal line, per unit of distance. */
  aimGain: 0.6,
  /** Ball bow (units at mid-flight) for a full-bend swipe, and Curve Shot's extra. */
  bow: 70,
  curveShotBow: 95,
  aimTime: 5,
  aimTimeMax: 8,
  readyTime: 0.9,
  resultTime: 1.7,
  keeperHalf: 20,
  keeperHalfMax: 27,
  /** Half-width covered at full stretch, diving to a side / jumping in the middle. */
  diveHalf: 30,
  diveHalfMax: 38,
  middleHalf: 34,
  middleHalfMax: 42,
  diveDist: 52,
  diveTime: 0.32,
  wideKeeper: 1.6,
  energyGoal: 0.3,
  energySave: 0.35,
  energyKick: 0.12,
};

export type Phase = 'ready' | 'aim' | 'flight' | 'result' | 'done';
export type KickResult = 'goal' | 'saved' | 'miss';
export type Dive = -1 | 0 | 1;

/** A kick: where it crosses the goal line, how hard, and how much it bows on the way. */
export type Shot = { aimX: number; power: number; bow: number };

export type Flight = Shot & {
  x0: number;
  y0: number;
  y1: number;
  /** Seconds from the spot to the goal line. */
  T: number;
  over: boolean;
};

export type Event =
  | { type: 'ready'; shooter: PlayerIndex }
  | { type: 'kick'; p: PlayerIndex; power: number; timeout: boolean }
  | { type: 'dive'; p: PlayerIndex; dir: Dive; early: boolean }
  | { type: 'result'; shooter: PlayerIndex; result: KickResult; why: 'goal' | 'saved' | 'wide' | 'over' | 'post'; x: number; y: number }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'win'; p: PlayerIndex | null };

export type Intent = { shot: Shot | null; dive: Dive | null; power: boolean };
export const IDLE: Intent = { shot: null, dive: null, power: false };

/** Which power ids belong to which role. */
const SHOOTER_POWERS = new Set(['curveshot', 'decoy']);

export class Penalty {
  score: [number, number] = [0, 0];
  taken: [number, number] = [0, 0];
  kicks: { shooter: PlayerIndex; result: KickResult }[] = [];
  energy: [Energy, Energy];
  readonly first: PlayerIndex;
  phase: Phase = 'ready';
  phaseT = 0;
  /** Powers fired and waiting for this kick. */
  armed: [boolean, boolean] = [false, false];
  flight: Flight | null = null;
  decoy: Flight | null = null;
  /** Seconds since the kick. */
  flightT = 0;
  dive: Dive | null = null;
  diveT = 0;
  divedEarly = false;
  /** Ball after the goal line, for the result animation. */
  ball = { x: W / 2, y: 0, vx: 0, vy: 0, z: 0 };
  lastResult: KickResult | null = null;
  winner: PlayerIndex | null = null;
  over = false;
  events: Event[] = [];
  t = 0;

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    readonly powersOn: boolean,
    private readonly rng: Rng,
  ) {
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    this.first = rng.chance(0.5) ? 0 : 1;
    this.placeBall();
  }

  /** Index of the kick being taken (stays put through its result animation). */
  current = 0;

  get shooter(): PlayerIndex {
    return this.current % 2 === 0 ? this.first : other(this.first);
  }

  get keeper(): PlayerIndex {
    return other(this.shooter);
  }

  /** Is this the sudden-death part of the shootout? */
  get suddenDeath(): boolean {
    return this.taken[0] >= RULES.kicks && this.taken[1] >= RULES.kicks;
  }

  goalW(shooter: PlayerIndex = this.shooter): number {
    return lerpAssist(this.players[shooter].assist, RULES.goalW, RULES.goalWMax);
  }

  aimTime(shooter: PlayerIndex = this.shooter): number {
    return lerpAssist(this.players[shooter].assist, RULES.aimTime, RULES.aimTimeMax);
  }

  goalLineY(): number {
    return RULES.goalY[this.keeper];
  }

  spotY(): number {
    const k = this.keeper;
    return RULES.goalY[k] + (k === 1 ? RULES.spotDist : -RULES.spotDist);
  }

  /** Keeper's centre and half-width right now (dive progress, handicap, Wide Keeper). */
  keeperBox(): { x: number; half: number } {
    const k = this.keeper;
    const a = this.players[k].assist;
    const wide = this.armed[k] && this.players[k].power?.id === 'widekeeper' ? RULES.wideKeeper : 1;
    const stand = lerpAssist(a, RULES.keeperHalf, RULES.keeperHalfMax);
    if (this.dive === null) return { x: W / 2, half: stand * wide };
    const e = clamp(this.diveT / RULES.diveTime, 0, 1);
    const reach = this.dive === 0 ? lerpAssist(a, RULES.middleHalf, RULES.middleHalfMax) : lerpAssist(a, RULES.diveHalf, RULES.diveHalfMax);
    return { x: W / 2 + this.dive * RULES.diveDist * e, half: (stand + (reach - stand) * e) * wide };
  }

  /** Where a flight is after t seconds: x, y and a pretend height for the shadow. */
  static at(f: Flight, t: number): { x: number; y: number; z: number; u: number } {
    const u = t / f.T;
    const x = f.x0 + (f.aimX - f.x0) * u + f.bow * 4 * u * (1 - u);
    const y = f.y0 + (f.y1 - f.y0) * u;
    const peak = f.over ? 70 : 6 + 22 * f.power * f.power;
    const z = f.over ? peak * u : peak * 4 * u * (1 - u) + 3;
    return { x, y, z, u };
  }

  private placeBall(): void {
    this.ball = { x: W / 2, y: this.spotY(), vx: 0, vy: 0, z: 0 };
  }

  step(dt: number, intents: [Intent, Intent]): void {
    this.events = [];
    if (this.over) return;
    this.t += dt;
    this.phaseT += dt;
    for (const p of [0, 1] as PlayerIndex[]) {
      this.energy[p].tick(dt);
      if (this.powersOn && intents[p].power) this.firePower(p);
    }
    const s = this.shooter;
    const k = this.keeper;
    if (this.dive !== null) this.diveT += dt;
    if (this.phase === 'ready') {
      if (this.phaseT >= RULES.readyTime) this.setPhase('aim');
    } else if (this.phase === 'aim') {
      this.keeperInput(intents[k].dive);
      const shot = intents[s].shot;
      if (shot) this.kick(shot, false);
      else if (this.phaseT >= this.aimTime()) {
        // Shot clock ran out: a soft tap down the middle.
        this.kick({ aimX: W / 2 + this.rng.range(-20, 20), power: 0.2, bow: 0 }, true);
      }
    } else if (this.phase === 'flight') {
      this.keeperInput(intents[k].dive);
      this.flightT += dt;
      const f = this.flight!;
      const pos = Penalty.at(f, Math.min(this.flightT, f.T));
      this.ball = { ...this.ball, x: pos.x, y: pos.y, z: pos.z };
      if (this.flightT >= f.T) this.resolve();
    } else if (this.phase === 'result') {
      const b = this.ball;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const k2 = Math.pow(0.05, dt);
      b.vx *= k2;
      b.vy *= k2;
      if (this.phaseT >= RULES.resultTime) this.nextKick();
    }
  }

  private setPhase(ph: Phase): void {
    this.phase = ph;
    this.phaseT = 0;
  }

  private keeperInput(dir: Dive | null): void {
    if (dir === null || this.dive !== null) return;
    this.dive = dir;
    this.diveT = 0;
    this.divedEarly = this.phase === 'aim';
    this.events.push({ type: 'dive', p: this.keeper, dir, early: this.divedEarly });
  }

  /** A power can be fired before the kick, by the role it is for. It then waits for this kick. */
  canFire(p: PlayerIndex): boolean {
    const id = this.players[p].power?.id;
    if (!this.powersOn || !id || this.armed[p] || !this.energy[p].ready) return false;
    if (this.phase !== 'ready' && this.phase !== 'aim') return false;
    return SHOOTER_POWERS.has(id) ? p === this.shooter : p === this.keeper;
  }

  private firePower(p: PlayerIndex): void {
    if (!this.canFire(p)) return;
    const power = this.players[p].power!;
    this.energy[p].spend(power.duration ?? 0);
    this.armed[p] = true;
    this.events.push({ type: 'power', p, id: power.id });
  }

  private kick(shot: Shot, timeout: boolean): void {
    const s = this.shooter;
    const id = this.players[s].power?.id;
    const y0 = this.spotY();
    const y1 = this.goalLineY();
    let bow = clamp(shot.bow, -RULES.bow, RULES.bow);
    const power = clamp(shot.power, RULES.minPower, 1);
    if (this.armed[s] && id === 'curveshot') {
      // Start toward the middle, then swing back out to the aim.
      const dir = Math.abs(bow) > 5 ? Math.sign(bow) : shot.aimX >= W / 2 ? -1 : 1;
      bow += dir * RULES.curveShotBow;
    }
    const T = Math.abs(y1 - y0) / (RULES.speedMin + (RULES.speedMax - RULES.speedMin) * power);
    this.flight = { aimX: shot.aimX, power, bow, x0: W / 2, y0, y1, T, over: power > RULES.overAt };
    this.decoy = null;
    if (this.armed[s] && id === 'decoy') {
      const off = shot.aimX - W / 2;
      const mirror = Math.abs(off) < 35 ? W / 2 + (off >= 0 ? -1 : 1) * 60 : W / 2 - off;
      this.decoy = { ...this.flight, aimX: mirror, bow: -bow, over: false };
    }
    this.flightT = 0;
    this.setPhase('flight');
    this.events.push({ type: 'kick', p: s, power, timeout });
  }

  /** Called when the ball reaches the goal line. */
  private resolve(): void {
    const f = this.flight!;
    const s = this.shooter;
    const k = this.keeper;
    const half = this.goalW() / 2;
    const off = Math.abs(f.aimX - W / 2);
    const box = this.keeperBox();
    let why: 'goal' | 'saved' | 'wide' | 'over' | 'post';
    if (f.over) why = 'over';
    else if (off > half + RULES.ballR * 0.3) why = 'wide';
    else if (off > half - RULES.ballR * 0.6) why = 'post';
    else if (Math.abs(f.aimX - box.x) <= box.half + RULES.ballR * 0.6) why = 'saved';
    else why = 'goal';
    const result: KickResult = why === 'goal' ? 'goal' : why === 'saved' ? 'saved' : 'miss';
    const toward = Math.sign(f.y1 - f.y0);
    const sp = Math.abs(f.y1 - f.y0) / f.T;
    const b = this.ball;
    if (why === 'goal') {
      b.vx = (f.aimX - f.x0) / f.T;
      b.vy = toward * sp * 0.6;
    } else if (why === 'saved') {
      b.vx = (f.aimX - box.x) * 6 + (f.aimX >= box.x ? 60 : -60);
      b.vy = -toward * sp * 0.45;
    } else if (why === 'post') {
      b.vx = Math.sign(f.aimX - W / 2) * 260;
      b.vy = -toward * sp * 0.3;
    } else {
      b.vx = (f.aimX - f.x0) / f.T;
      b.vy = toward * sp;
    }
    this.score[s] += result === 'goal' ? 1 : 0;
    this.taken[s]++;
    this.kicks.push({ shooter: s, result });
    this.lastResult = result;
    const trail = (p: PlayerIndex) => this.score[p] < this.score[other(p)];
    this.energy[s].charge(result === 'goal' ? RULES.energyGoal : RULES.energyKick, trail(s));
    this.energy[k].charge(result === 'saved' ? RULES.energySave : RULES.energyKick, trail(k));
    // Powers are spent on this kick whether or not they worked.
    if (this.players[s].power && SHOOTER_POWERS.has(this.players[s].power!.id)) this.armed[s] = false;
    if (this.players[k].power?.id === 'widekeeper') this.armed[k] = false;
    this.events.push({ type: 'result', shooter: s, result, why, x: f.aimX, y: f.y1 });
    this.setPhase('result');
    this.checkWinner();
  }

  /** Decided once one side can't catch up, or after a sudden-death pair. */
  private checkWinner(): void {
    const [a, b] = this.score;
    const [ta, tb] = this.taken;
    let w: PlayerIndex | null = null;
    let done = false;
    if (!this.suddenDeath) {
      const ra = Math.max(0, RULES.kicks - ta);
      const rb = Math.max(0, RULES.kicks - tb);
      if (a > b + rb) w = 0;
      else if (b > a + ra) w = 1;
      done = w !== null;
    } else if (ta === tb && a !== b) {
      w = a > b ? 0 : 1;
      done = true;
    } else if (ta === tb && ta >= RULES.maxKicks) done = true;
    if (done) {
      this.winner = w;
      this.pendingEnd = true;
    }
  }

  private pendingEnd = false;

  private nextKick(): void {
    if (this.pendingEnd) {
      this.over = true;
      this.phase = 'done';
      this.events.push({ type: 'win', p: this.winner });
      return;
    }
    this.current = this.kicks.length;
    this.flight = null;
    this.decoy = null;
    this.dive = null;
    this.diveT = 0;
    this.divedEarly = false;
    this.lastResult = null;
    this.placeBall();
    this.setPhase('ready');
    this.events.push({ type: 'ready', shooter: this.shooter });
  }

  /** Has the match been decided (the result plays out before `over`)? */
  get decided(): boolean {
    return this.pendingEnd;
  }
}

// ---------- Swipe → shot (shared by the view and tests) ----------
export type SwipePoint = { x: number; y: number; t: number };

/**
 * Turn a swipe into a shot. Direction of the swipe = aim, its speed = power,
 * and how far its middle bulges sideways from a straight line = bow.
 * `toward` is -1 when the goal is up the screen, +1 when down. Returns null
 * for a swipe that is too short or points away from the goal.
 */
export function shotFromSwipe(pts: SwipePoint[], toward: -1 | 1): Shot | null {
  if (pts.length < 2) return null;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fwd = dy * toward;
  const len = Math.hypot(dx, dy);
  if (fwd < 24 || len < 30) return null;
  const dur = Math.max(0.05, b.t - a.t);
  const speed = len / dur;
  const power = clamp((speed - 250) / 1500, RULES.minPower, 1);
  const aimX = W / 2 + (dx / fwd) * RULES.spotDist * RULES.aimGain;
  // Sideways bulge of the path, as a fraction of the forward length.
  let bulge = 0;
  for (const p of pts) {
    const along = (p.y - a.y) / dy;
    if (along <= 0.1 || along >= 0.9) continue;
    const lateral = p.x - (a.x + dx * along);
    if (Math.abs(lateral) > Math.abs(bulge)) bulge = lateral;
  }
  const ratio = bulge / fwd;
  const dead = 0.07;
  const bend = Math.abs(ratio) <= dead ? 0 : Math.sign(ratio) * clamp((Math.abs(ratio) - dead) / 0.18, 0, 1);
  return { aimX, power, bow: bend * RULES.bow };
}

// ---------- Honest bots ----------
// The shooter picks a spot with aim and power noise; it can see a keeper who
// dived early. The keeper reacts to the ball's flight after a reaction delay
// and never sees the shooter's target before the kick.
const BOT = {
  easy: { react: 0.36, keepNoise: 34, guess: 0.3, aimNoise: 30, power: 0.55, powerVar: 0.3, curve: 0 },
  normal: { react: 0.24, keepNoise: 20, guess: 0.12, aimNoise: 18, power: 0.72, powerVar: 0.2, curve: 0.15 },
  hard: { react: 0.15, keepNoise: 10, guess: 0, aimNoise: 10, power: 0.8, powerVar: 0.12, curve: 0.3 },
} satisfies Record<BotLevel, Record<string, number>>;

export class PenaltyBot {
  private kickNo = -1;
  private shootAt = 0;
  private guessAt = -1;
  private track: 'real' | 'decoy' = 'real';
  private seen: { t: number; x: number; y: number }[] = [];

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  think(game: Penalty, dt: number): Intent {
    const cfg = BOT[this.level];
    if (this.kickNo !== game.current) {
      this.kickNo = game.current;
      this.shootAt = this.rng.range(0.7, Math.min(1.8, game.aimTime() - 0.5));
      this.guessAt = this.rng.chance(cfg.guess) ? this.rng.range(0.3, 2.5) : -1;
      this.track = this.rng.chance(0.5) ? 'real' : 'decoy';
      this.seen = [];
    }
    const power = this.wantsPower(game);
    if (game.shooter === this.p) {
      if (game.phase !== 'aim' || game.phaseT < this.shootAt) return { shot: null, dive: null, power };
      return { shot: this.pickShot(game), dive: null, power };
    }
    return { shot: null, dive: this.keep(game, dt), power };
  }

  private wantsPower(game: Penalty): boolean {
    return game.canFire(this.p) && game.phase === 'aim';
  }

  private pickShot(game: Penalty): Shot {
    const cfg = BOT[this.level];
    const half = game.goalW() / 2;
    let side = this.rng.pick([-0.82, -0.6, -0.3, 0, 0.3, 0.6, 0.82]);
    // A keeper who already dived is in plain sight: go the other way.
    if (game.dive !== null) side = game.dive === 0 ? this.rng.pick([-0.75, 0.75]) : -game.dive * 0.75;
    const aimX = W / 2 + side * half + this.rng.range(-cfg.aimNoise, cfg.aimNoise);
    const power = clamp(cfg.power + this.rng.range(-cfg.powerVar, cfg.powerVar), 0.15, 1);
    let bow = 0;
    if (Math.abs(side) > 0.2 && this.rng.chance(cfg.curve)) bow = -Math.sign(side) * this.rng.range(30, RULES.bow);
    return { aimX, power, bow };
  }

  private keep(game: Penalty, dt: number): Dive | null {
    const cfg = BOT[this.level];
    if (game.dive !== null) return null;
    if (game.phase === 'aim' && this.guessAt >= 0 && game.phaseT >= this.guessAt) return this.rng.pick([-1, 0, 1] as const);
    if (game.phase !== 'flight') return null;
    const f = this.track === 'decoy' && game.decoy ? game.decoy : game.flight!;
    const pos = Penalty.at(f, game.flightT);
    this.seen.push({ t: game.flightT, x: pos.x, y: pos.y });
    // Reaction delay: only use what the ball did `react` seconds ago.
    const old = this.seen.filter((s) => s.t <= game.flightT - cfg.react);
    if (old.length < 3) return null;
    const a = old[old.length - 3];
    const b = old[old.length - 1];
    const vy = (b.y - a.y) / (b.t - a.t || dt);
    const vx = (b.x - a.x) / (b.t - a.t || dt);
    if (Math.abs(vy) < 1) return null;
    const tHit = (f.y1 - b.y) / vy;
    const x = b.x + vx * tHit + this.rng.range(-cfg.keepNoise, cfg.keepNoise);
    const band = 22;
    return x < W / 2 - band ? -1 : x > W / 2 + band ? 1 : 0;
  }
}
