// Minigolf rules: pure and deterministic, so tests can run whole matches.
// Players alternate shots on the same hole; fewest total strokes over 3 holes wins.
import holesData from '../../../content/minigolf-holes.json';
import { Energy } from '../../core/energy';
import { lerpAssist } from '../../core/handicap';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';
import {
  compileCourse, pathDist, rollFrame, simulate, startRoll,
  type Course, type HoleDef, type Mods, type Pt, type Roll, type RollEvent,
} from './physics';

export const HOLES = (holesData as unknown as { holes: HoleDef[] }).holes;

export const RULES = {
  holesPerMatch: 3,
  strokeCap: 6,
  introTime: 1.9,
  turnTime: 0.75,
  settleTime: 0.7,
  cardTime: 4.2,
  /** Softest shot allowed (fraction of full power). */
  minPower: 0.05,
  /** Aim guide length (course units of predicted path) at assist 0 and 3. */
  guideMin: 70,
  guideMax: 300,
  /** From this assist on, one stroke comes off each hole. */
  bonusAssist: 2,
  energyShot: 0.16,
  energyPar: 0.2,
  energyAce: 0.45,
  energyWater: 0.1,
  windAccel: 55,
};

export type Phase = 'intro' | 'turn' | 'aim' | 'roll' | 'settle' | 'card' | 'over';

export type Ball = { x: number; y: number; lastX: number; lastY: number; strokes: number; done: boolean; sunk: boolean };

export type HoleScore = { hole: HoleDef; strokes: [number, number]; bonus: [number, number]; net: [number, number] };

export type Shot = { angle: number; power: number };
/** What a player wants this step: a released shot (only counts on their turn) and/or firing their power. */
export type Intent = { shot: Shot | null; power: boolean };
export const NO_INTENT: Intent = { shot: null, power: false };

export type Event =
  | { type: 'holeStart'; hole: number }
  | { type: 'turn'; p: PlayerIndex }
  | { type: 'shot'; p: PlayerIndex; x: number; y: number; power: number }
  | { type: 'wall'; x: number; y: number; speed: number; mover: boolean }
  | { type: 'sand'; x: number; y: number }
  | { type: 'ghost'; x: number; y: number }
  | { type: 'lip'; x: number; y: number }
  | { type: 'water'; p: PlayerIndex; x: number; y: number; out: boolean }
  | { type: 'sunk'; p: PlayerIndex; strokes: number; par: number }
  | { type: 'pickup'; p: PlayerIndex }
  | { type: 'stop'; p: PlayerIndex; x: number; y: number }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'holeEnd'; hole: number }
  | { type: 'win'; p: PlayerIndex | null };

/** Wind armed against a player's next shot. dir is fixed once their ball is still. */
export type Wind = { dir: Pt | null; by: PlayerIndex };

export class Minigolf {
  readonly holes: HoleDef[];
  readonly courses: Course[];
  holeIdx = 0;
  phase: Phase = 'intro';
  timer = RULES.introTime;
  shooter: PlayerIndex = 0;
  /** Increments every time a turn starts (bots use it to know a new turn began). */
  turnId = 0;
  balls: [Ball, Ball];
  card: HoleScore[] = [];
  energy: [Energy, Energy];
  wind: [Wind | null, Wind | null] = [null, null];
  magnet: [boolean, boolean] = [false, false];
  ghost: [boolean, boolean] = [false, false];
  roll: Roll | null = null;
  rollMods: Mods = { wind: null, magnet: false, ghost: false };
  /** Time spent aiming this turn. */
  aimT = 0;
  winner: PlayerIndex | null = null;
  finished = false;
  score: [number, number] = [0, 0];
  events: Event[] = [];
  t = 0;
  /** Who tees off on the current (or next) hole. */
  leadOff: PlayerIndex;
  private rollEvents: RollEvent[] = [];

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    readonly powersOn: boolean,
    private readonly rng: Rng,
    /** Optional fixed hole list (tests); otherwise 3 picked with the seeded rng. */
    holeIds?: string[],
  ) {
    let picked: number[];
    if (holeIds) picked = holeIds.map((id) => HOLES.findIndex((h) => h.id === id));
    else {
      const pool = HOLES.map((_, i) => i);
      picked = [];
      for (let i = 0; i < RULES.holesPerMatch; i++) picked.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
      picked.sort((a, b) => a - b); // easier holes first
    }
    this.holes = picked.map((i) => HOLES[i]);
    this.courses = this.holes.map(compileCourse);
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    this.leadOff = rng.chance(0.5) ? 0 : 1;
    this.balls = [this.newBall(), this.newBall()];
    this.startHole(0);
  }

  get hole(): HoleDef {
    return this.holes[this.holeIdx];
  }

  get course(): Course {
    return this.courses[this.holeIdx];
  }

  /** How many units of predicted path the aim guide shows this player. */
  guideLen(p: PlayerIndex): number {
    return lerpAssist(this.players[p].assist, RULES.guideMin, RULES.guideMax);
  }

  /** Strokes taken off each hole for this player (handicap). */
  bonus(p: PlayerIndex): number {
    return this.players[p].assist >= RULES.bonusAssist ? 1 : 0;
  }

  /** Net strokes so far, counting the hole in play. */
  total(p: PlayerIndex): number {
    let s = this.card.reduce((a, h) => a + h.net[p], 0);
    if (this.card.length === this.holeIdx && this.phase !== 'over') s += this.balls[p].strokes;
    return s;
  }

  /** The effects that apply to this player's next shot. */
  modsFor(p: PlayerIndex): Mods {
    return { wind: this.wind[p]?.dir ?? null, magnet: this.magnet[p], ghost: this.ghost[p] };
  }

  /** True when this player could fire their power right now. */
  canFire(p: PlayerIndex): boolean {
    const pw = this.players[p].power;
    if (!this.powersOn || !pw || this.phase === 'over' || !this.energy[p].ready) return false;
    if (pw.id === 'wind') return !this.wind[other(p)];
    if (pw.id === 'magnet') return !this.magnet[p];
    if (pw.id === 'ghost') return !this.ghost[p];
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
        if (this.timer <= 0) this.beginTurn(this.leadOff);
        break;
      case 'turn':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = 'aim';
          this.aimT = 0;
        }
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
        if (this.timer <= 0) this.nextTurn();
        break;
      case 'card':
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.holeIdx + 1 < this.holes.length) this.startHole(this.holeIdx + 1);
          else this.finish();
        }
        break;
      case 'over':
        break;
    }
  }

  private newBall(): Ball {
    return { x: 0, y: 0, lastX: 0, lastY: 0, strokes: 0, done: false, sunk: false };
  }

  private startHole(i: number): void {
    this.holeIdx = i;
    const [tx, ty] = this.hole.tee;
    for (const b of this.balls) Object.assign(b, { x: tx, y: ty, lastX: tx, lastY: ty, strokes: 0, done: false, sunk: false });
    this.phase = 'intro';
    this.timer = RULES.introTime;
    this.roll = null;
    this.events.push({ type: 'holeStart', hole: i });
  }

  private beginTurn(p: PlayerIndex): void {
    this.shooter = p;
    this.phase = 'turn';
    this.timer = RULES.turnTime;
    this.turnId++;
    const w = this.wind[p];
    if (w && !w.dir) w.dir = this.windDir(p);
    this.events.push({ type: 'turn', p });
  }

  /** Wind blows across the line from the ball to the cup, to a seeded side. */
  private windDir(p: PlayerIndex): Pt {
    const b = this.balls[p];
    const [cx, cy] = this.hole.cup;
    const a = Math.atan2(cy - b.y, cx - b.x) + (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    return [Math.cos(a) * RULES.windAccel, Math.sin(a) * RULES.windAccel];
  }

  private firePower(p: PlayerIndex): void {
    if (!this.canFire(p)) return;
    const pw = this.players[p].power!;
    this.energy[p].spend(0);
    if (pw.id === 'wind') {
      const q = other(p);
      // If they are lining up right now, the wind is fixed (and shown) at once.
      const now = this.shooter === q && (this.phase === 'turn' || this.phase === 'aim');
      this.wind[q] = { dir: now ? this.windDir(q) : null, by: p };
    } else if (pw.id === 'magnet') this.magnet[p] = true;
    else if (pw.id === 'ghost') this.ghost[p] = true;
    this.events.push({ type: 'power', p, id: pw.id });
  }

  private shoot(shot: Shot): void {
    const p = this.shooter;
    const b = this.balls[p];
    const power = Math.max(RULES.minPower, Math.min(1, shot.power));
    this.energy[p].charge(RULES.energyShot, this.trailing(p));
    b.strokes++;
    b.lastX = b.x;
    b.lastY = b.y;
    this.rollMods = this.modsFor(p);
    this.wind[p] = null;
    this.magnet[p] = false;
    this.ghost[p] = false;
    this.roll = startRoll(b.x, b.y, shot.angle, power, this.t, this.rollMods);
    this.phase = 'roll';
    this.events.push({ type: 'shot', p, x: b.x, y: b.y, power });
  }

  private trailing(p: PlayerIndex): boolean {
    return this.total(p) > this.total(other(p));
  }

  private rollStep(dt: number): void {
    const r = this.roll!;
    const p = this.shooter;
    const b = this.balls[p];
    this.rollEvents.length = 0;
    rollFrame(this.course, r, dt, this.rollMods, this.rollEvents);
    for (const e of this.rollEvents) this.events.push(e);
    b.x = r.x;
    b.y = r.y;
    if (r.status === 'roll') return;
    if (r.status === 'sunk') {
      b.done = true;
      b.sunk = true;
      const par = this.hole.par;
      if (b.strokes === 1) this.energy[p].charge(RULES.energyAce, this.trailing(p));
      else if (b.strokes <= par) this.energy[p].charge(RULES.energyPar, this.trailing(p));
      this.events.push({ type: 'sunk', p, strokes: b.strokes, par });
    } else if (r.status === 'water' || r.status === 'out') {
      this.events.push({ type: 'water', p, x: b.x, y: b.y, out: r.status === 'out' });
      b.strokes++; // penalty stroke, back to where the shot was played from
      b.x = b.lastX;
      b.y = b.lastY;
      this.energy[p].charge(RULES.energyWater, true);
    } else {
      this.events.push({ type: 'stop', p, x: b.x, y: b.y });
    }
    if (!b.done && b.strokes >= RULES.strokeCap) {
      b.strokes = RULES.strokeCap;
      b.done = true;
      this.events.push({ type: 'pickup', p });
    }
    this.roll = null;
    this.phase = 'settle';
    this.timer = RULES.settleTime;
  }

  private nextTurn(): void {
    const q = other(this.shooter);
    if (!this.balls[q].done) this.beginTurn(q);
    else if (!this.balls[this.shooter].done) this.beginTurn(this.shooter);
    else this.endHole();
  }

  private endHole(): void {
    const strokes: [number, number] = [this.balls[0].strokes, this.balls[1].strokes];
    const bonus: [number, number] = [this.bonus(0), this.bonus(1)];
    const net: [number, number] = [Math.max(1, strokes[0] - bonus[0]), Math.max(1, strokes[1] - bonus[1])];
    this.card.push({ hole: this.hole, strokes, bonus, net });
    this.score = [this.total(0), this.total(1)];
    // Honour: the better score on this hole tees off first next; a tie swaps.
    this.leadOff = net[0] < net[1] ? 0 : net[1] < net[0] ? 1 : other(this.leadOff);
    this.phase = 'card';
    this.timer = RULES.cardTime;
    this.events.push({ type: 'holeEnd', hole: this.holeIdx });
  }

  private finish(): void {
    this.score = [this.total(0), this.total(1)];
    this.phase = 'over';
    this.finished = true;
    this.winner = this.score[0] < this.score[1] ? 0 : this.score[1] < this.score[0] ? 1 : null;
    this.events.push({ type: 'win', p: this.winner });
  }
}

// ---------- Honest bot ----------
// It lines up like a careful person: tries candidate shots with the same
// deterministic physics (what a human estimates by eye), picks the best, then
// strikes it with hand-shake noise. Skill changes the noise, how many shots it
// considers and how long it takes, never the physics.
const BOT = {
  easy: { aim: 0.2, pow: 0.3, angles: 18, powers: 4, refine: 0, delay: 1.6 },
  normal: { aim: 0.085, pow: 0.13, angles: 32, powers: 5, refine: 8, delay: 1.25 },
  hard: { aim: 0.035, pow: 0.055, angles: 48, powers: 6, refine: 16, delay: 1.0 },
} satisfies Record<BotLevel, { aim: number; pow: number; angles: number; powers: number; refine: number; delay: number }>;

/** Shots tried per frame while lining up, so a turn never hitches. */
const SIMS_PER_FRAME = 24;

export class MinigolfBot {
  private turn = -1;
  private queue: Shot[] = [];
  private best: { shot: Shot; cost: number }[] = [];
  private refined = false;
  private releaseT = 0;

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  think(game: Minigolf, dt: number): Intent {
    const me = this.p;
    // Wind: blow it at the opponent as they start lining up.
    if (game.players[me].power?.id === 'wind' && game.canFire(me) && game.phase === 'turn' && game.shooter !== me) {
      return { shot: null, power: true };
    }
    if (game.phase !== 'aim' || game.shooter !== me) return NO_INTENT;
    if (this.turn !== game.turnId) {
      const id = game.players[me].power?.id;
      if ((id === 'magnet' || id === 'ghost') && game.canFire(me)) return { shot: null, power: true };
      this.plan(game, dt);
    }
    const mods = game.modsFor(me);
    const ball = game.balls[me];
    const c = game.course;
    let budget = SIMS_PER_FRAME;
    while (budget-- > 0 && this.queue.length) {
      const s = this.queue.pop()!;
      this.best.push({ shot: s, cost: this.judge(c, ball.x, ball.y, s, mods, dt) });
    }
    if (!this.queue.length && !this.refined) {
      this.refined = true;
      this.best.sort((a, b) => a.cost - b.cost);
      const n = BOT[this.level].refine;
      for (const b of this.best.slice(0, Math.ceil(n / 4))) {
        for (let k = 0; k < 4; k++) {
          const da = (k % 2 ? 1 : -1) * 0.02 * (1 + (k >> 1));
          const dp = (k < 2 ? 1 : -1) * 0.04;
          this.queue.push({ angle: b.shot.angle + da, power: clampPower(b.shot.power + dp) });
        }
      }
    }
    if (this.queue.length || game.t + dt < this.releaseT) return NO_INTENT;
    this.best.sort((a, b) => a.cost - b.cost);
    const pick = this.best[0].shot;
    const cfg = BOT[this.level];
    const tri = () => this.rng.next() + this.rng.next() - 1;
    // Short putts are steadier than long drives, like for people.
    const steady = Math.min(1, 0.4 + pick.power);
    return { shot: { angle: pick.angle + tri() * cfg.aim * steady, power: clampPower(pick.power * (1 + tri() * cfg.pow)) }, power: false };
  }

  private plan(game: Minigolf, dt: number): void {
    const cfg = BOT[this.level];
    this.turn = game.turnId;
    this.best = [];
    this.refined = false;
    this.queue = [];
    this.releaseT = game.t + Math.round(cfg.delay / dt) * dt;
    const b = game.balls[this.p];
    const [cx, cy] = game.hole.cup;
    const direct = Math.atan2(cy - b.y, cx - b.x);
    const dist = Math.hypot(cx - b.x, cy - b.y);
    for (let i = 0; i < cfg.angles; i++) {
      const a = direct + (i * Math.PI * 2) / cfg.angles;
      for (let k = 0; k < cfg.powers; k++) this.queue.push({ angle: a, power: 0.25 + (0.75 * k) / Math.max(1, cfg.powers - 1) });
    }
    // Putts straight at the cup, finely graded by distance.
    for (let k = 0; k < 8; k++) {
      const base = Math.min(1, 0.06 + Math.sqrt(dist) / 32);
      this.queue.push({ angle: direct, power: clampPower(base * (0.7 + k * 0.1)) });
    }
  }

  private judge(c: Course, x: number, y: number, s: Shot, mods: Mods, dt: number): number {
    const r = simulate(c, x, y, s.angle, s.power, this.releaseT, mods, dt).roll;
    if (r.status === 'sunk') return -1000;
    if (r.status === 'water' || r.status === 'out') return pathDist(c, x, y) + 260;
    return pathDist(c, r.x, r.y);
  }
}

function clampPower(p: number): number {
  return Math.max(RULES.minPower, Math.min(1, p));
}
