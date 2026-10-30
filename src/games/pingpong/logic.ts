// Ping Pong rules: a table seen from above, one paddle at each end. Pure and
// deterministic so tests can play whole matches.
import { Energy } from '../../core/energy';
import { lerpAssist } from '../../core/handicap';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';
import { clamp, H, MID, W } from '../../engine/world';

export const RULES = {
  winScore: 7,
  winBy: 2,
  /** First to this many points wins outright, so deuce can't drag on. */
  hardCap: 10,
  /** Arena walls the ball bounces off (the table edge has a low rail). */
  wallX0: 10,
  wallX1: W - 10,
  tableY0: 96,
  tableY1: H - 96,
  /** Paddle centre y for player 0 (bottom) and player 1 (top). */
  paddleY: [H - 66, 66] as const,
  paddleW: 66,
  paddleWMax: 94,
  paddleH: 12,
  paddleSpeed: 720,
  ballR: 7,
  serveSpeed: 380,
  speedUp: 40,
  maxSpeed: 780,
  smashSpeed: 980,
  maxAngle: 0.85,
  /** Ball speed toward a player at assist 3 (fraction of normal). */
  assistSlow: 0.8,
  slowmo: 0.45,
  curveAccel: 170,
  serveDelay: 1.0,
  pointDelay: 0.9,
  /** Where along a flight the ball bounces on the table (0 = hitter, 1 = receiver). */
  bounceAt: 0.72,
  energyHit: 0.09,
  energyConcede: 0.22,
};

export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Lateral acceleration from Curve Ball (units/s²). */
  ax: number;
  smash: boolean;
  /** y the current flight started from, and the receiver's paddle y. */
  fromY: number;
  toY: number;
  bounced: boolean;
};

export type Paddle = { x: number; vx: number; w: number; smash: boolean; curve: boolean; slowmo: number };

export type Event =
  | { type: 'hit'; p: PlayerIndex; x: number; y: number; speed: number; smash: boolean; curve: boolean }
  | { type: 'wall'; x: number; y: number }
  | { type: 'table'; x: number; y: number }
  | { type: 'serve'; p: PlayerIndex }
  | { type: 'point'; scorer: PlayerIndex; x: number; y: number }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'win'; p: PlayerIndex };

/** Where the paddle should slide to (x only) and whether to fire the power. */
export type Intent = { tx: number; power: boolean };

export class PingPong {
  score: [number, number] = [0, 0];
  paddles: [Paddle, Paddle];
  energy: [Energy, Energy];
  ball: Ball;
  /** Who serves the current point. */
  server: PlayerIndex;
  readonly firstServer: PlayerIndex;
  /** Seconds until the serve leaves the paddle (ball rides the server's paddle meanwhile). */
  serveT = RULES.serveDelay;
  /** Pause after a point before the next serve is set up. */
  pointT = 0;
  rally = RULES.serveSpeed;
  hits = 0;
  winner: PlayerIndex | null = null;
  events: Event[] = [];
  t = 0;
  /** Speed multiplier for a ball travelling toward each player (handicap). */
  readonly towardFactor: [number, number];

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    readonly powersOn: boolean,
    private readonly rng: Rng,
  ) {
    const w = (p: PlayerIndex) => lerpAssist(players[p].assist, RULES.paddleW, RULES.paddleWMax);
    const mk = (p: PlayerIndex): Paddle => ({ x: W / 2, vx: 0, w: w(p), smash: false, curve: false, slowmo: 0 });
    this.paddles = [mk(0), mk(1)];
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    this.towardFactor = [lerpAssist(players[0].assist, 1, RULES.assistSlow), lerpAssist(players[1].assist, 1, RULES.assistSlow)];
    this.firstServer = rng.chance(0.5) ? 0 : 1;
    this.server = this.firstServer;
    this.ball = this.serveBall();
  }

  /** Player the ball is currently travelling toward. */
  get toward(): PlayerIndex {
    return this.ball.vy > 0 ? 0 : 1;
  }

  get serving(): boolean {
    return this.serveT > 0 && this.pointT <= 0;
  }

  /** Paddle face y (the side facing the net). */
  faceY(p: PlayerIndex): number {
    return p === 0 ? RULES.paddleY[0] - RULES.paddleH / 2 : RULES.paddleY[1] + RULES.paddleH / 2;
  }

  /** 0..1 along the current flight from hitter to receiver. */
  progress(): number {
    const b = this.ball;
    return clamp((b.y - b.fromY) / (b.toY - b.fromY || 1), 0, 1.2);
  }

  /** Pretend height of the ball above the table, for the shadow and the bounce hint. */
  height(): number {
    if (this.serving) return 10;
    const u = this.progress();
    const k = RULES.bounceAt;
    if (u < k) {
      const v = u / k;
      return 10 * (1 - v) + 34 * 4 * v * (1 - v) * (1 - v * 0.3);
    }
    const v = (u - k) / (1 - k);
    return 16 * v * (2 - v);
  }

  /** Current speed factor on the ball: handicap and Slow-mo toward the receiver. */
  speedFactor(): number {
    const p = this.toward;
    return this.towardFactor[p] * (this.paddles[p].slowmo > 0 ? RULES.slowmo : 1);
  }

  private serveBall(): Ball {
    const p = this.server;
    const y = this.faceY(p) + (p === 0 ? -RULES.ballR - 1 : RULES.ballR + 1);
    return { x: this.paddles[p].x, y, vx: 0, vy: 0, ax: 0, smash: false, fromY: y, toY: this.faceY(other(p)), bounced: false };
  }

  /** Who serves after `total` points: every 2 points, every point at deuce. */
  serverFor(total: number): PlayerIndex {
    const deuce = this.score[0] >= RULES.winScore - 1 && this.score[1] >= RULES.winScore - 1;
    const flips = deuce ? total : Math.floor(total / 2);
    return (flips % 2 === 0 ? this.firstServer : other(this.firstServer)) as PlayerIndex;
  }

  step(dt: number, intents: [Intent, Intent]): void {
    this.events = [];
    if (this.winner !== null) return;
    this.t += dt;
    for (const p of [0, 1] as PlayerIndex[]) {
      this.energy[p].tick(dt);
      const pd = this.paddles[p];
      pd.slowmo = Math.max(0, pd.slowmo - dt);
      if (this.powersOn && intents[p].power) this.firePower(p);
      const half = pd.w / 2;
      const tx = clamp(intents[p].tx, RULES.wallX0 + half, RULES.wallX1 - half);
      const d = clamp(tx - pd.x, -RULES.paddleSpeed * dt, RULES.paddleSpeed * dt);
      pd.x += d;
      pd.vx = d / dt;
    }
    if (this.pointT > 0) {
      this.pointT -= dt;
      if (this.pointT <= 0) {
        this.server = this.serverFor(this.score[0] + this.score[1]);
        this.serveT = RULES.serveDelay;
        this.ball = this.serveBall();
      }
      return;
    }
    if (this.serveT > 0) {
      this.ball.x = this.paddles[this.server].x;
      this.serveT -= dt;
      if (this.serveT <= 0) this.launchServe();
      return;
    }
    const sub = 4;
    const f = this.speedFactor();
    for (let i = 0; i < sub && this.pointT <= 0 && this.winner === null; i++) this.moveBall((dt / sub) * f);
  }

  private launchServe(): void {
    const p = this.server;
    const b = this.ball;
    const a = this.rng.range(-0.3, 0.3);
    this.rally = RULES.serveSpeed;
    this.hits = 0;
    b.vx = Math.sin(a) * this.rally;
    b.vy = (p === 0 ? -1 : 1) * Math.cos(a) * this.rally;
    b.fromY = b.y;
    b.toY = this.faceY(other(p));
    this.events.push({ type: 'serve', p });
  }

  private firePower(p: PlayerIndex): void {
    const power = this.players[p].power;
    if (!power || !this.energy[p].spend(power.duration ?? 0)) return;
    const pd = this.paddles[p];
    if (power.id === 'smash') pd.smash = true;
    else if (power.id === 'curve') pd.curve = true;
    else if (power.id === 'slowmo') pd.slowmo = power.duration ?? 3;
    this.events.push({ type: 'power', p, id: power.id });
  }

  private moveBall(h: number): void {
    const b = this.ball;
    const r = RULES.ballR;
    b.vx += b.ax * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.x < RULES.wallX0 + r) {
      b.x = RULES.wallX0 + r;
      b.vx = Math.abs(b.vx);
      b.ax = 0;
      this.events.push({ type: 'wall', x: b.x, y: b.y });
    } else if (b.x > RULES.wallX1 - r) {
      b.x = RULES.wallX1 - r;
      b.vx = -Math.abs(b.vx);
      b.ax = 0;
      this.events.push({ type: 'wall', x: b.x, y: b.y });
    }
    if (!b.bounced && this.progress() >= RULES.bounceAt) {
      b.bounced = true;
      this.events.push({ type: 'table', x: b.x, y: b.y });
    }
    const p = this.toward;
    const face = this.faceY(p);
    const pd = this.paddles[p];
    const front = p === 0 ? b.y + r >= face : b.y - r <= face;
    const back = p === 0 ? b.y - r <= RULES.paddleY[0] + RULES.paddleH / 2 : b.y + r >= RULES.paddleY[1] - RULES.paddleH / 2;
    if (front && back && Math.abs(b.x - pd.x) <= pd.w / 2 + r) {
      this.hit(p);
      return;
    }
    if (p === 0 ? b.y > H + r : b.y < -r) this.point(other(p));
  }

  private hit(p: PlayerIndex): void {
    const b = this.ball;
    const pd = this.paddles[p];
    const off = clamp((b.x - pd.x) / (pd.w / 2), -1, 1);
    const a = off * RULES.maxAngle;
    this.hits++;
    this.rally = Math.min(RULES.maxSpeed, this.rally + RULES.speedUp);
    const smash = pd.smash;
    const sp = smash ? RULES.smashSpeed : this.rally;
    pd.smash = false;
    b.vx = Math.sin(a) * sp;
    b.vy = (p === 0 ? -1 : 1) * Math.cos(a) * sp;
    b.y = this.faceY(p) + (p === 0 ? -RULES.ballR : RULES.ballR);
    b.smash = smash;
    b.ax = 0;
    const curve = pd.curve;
    if (curve) {
      pd.curve = false;
      // Bend away from the side the opponent is standing on.
      b.ax = (this.paddles[other(p)].x < W / 2 ? 1 : -1) * RULES.curveAccel;
    }
    b.fromY = b.y;
    b.toY = this.faceY(other(p));
    b.bounced = false;
    this.events.push({ type: 'hit', p, x: b.x, y: b.y, speed: sp, smash, curve });
    this.energy[p].charge(RULES.energyHit, this.score[p] < this.score[other(p)]);
  }

  private point(scorer: PlayerIndex): void {
    const b = this.ball;
    this.score[scorer]++;
    this.events.push({ type: 'point', scorer, x: clamp(b.x, 20, W - 20), y: clamp(b.y, 20, H - 20) });
    this.energy[other(scorer)].charge(RULES.energyConcede, true);
    for (const pd of this.paddles) pd.slowmo = 0;
    const [s, o] = [this.score[scorer], this.score[other(scorer)]];
    if ((s >= RULES.winScore && s - o >= RULES.winBy) || s >= RULES.hardCap) {
      this.winner = scorer;
      this.events.push({ type: 'win', p: scorer });
      return;
    }
    b.vx = b.vy = b.ax = 0;
    this.pointT = RULES.pointDelay;
  }
}

// ---------- Honest bot ----------
// Same paddle speed cap as a person. It predicts where the ball reaches its end
// from a delayed view of the ball (reaction time) and misjudges it by an
// amount that grows quickly with ball speed (fast balls are hard to read). Skill changes only delay, noise and how
// boldly it aims for the edges of its paddle.
const BOT = {
  easy: { react: 0.3, noise: 36, aim: 0.3 },
  normal: { react: 0.18, noise: 28, aim: 0.5 },
  hard: { react: 0.1, noise: 12, aim: 0.65 },
} satisfies Record<BotLevel, { react: number; noise: number; aim: number }>;

type Seen = { x: number; y: number; vx: number; vy: number; serving: boolean };

export class PingPongBot {
  private seen: Seen[] = [];
  private approachSign = 0;
  private err = 0;
  private aimOff = 0;

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  think(game: PingPong, dt: number): Intent {
    const cfg = BOT[this.level];
    const b = game.ball;
    this.seen.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, serving: game.serving || game.pointT > 0 });
    const lag = Math.round(cfg.react / dt);
    while (this.seen.length > lag + 1) this.seen.shift();
    const s = this.seen[0];
    const myY = game.faceY(this.p);
    const comingAtMe = !s.serving && (this.p === 0 ? s.vy > 0 : s.vy < 0);
    const sign = comingAtMe ? 1 : -1;
    if (sign !== this.approachSign) {
      this.approachSign = sign;
      // A fresh read of the incoming ball: new misjudgement and a new aim.
      const speed = Math.hypot(s.vx, s.vy);
      this.err = this.rng.range(-1, 1) * cfg.noise * (speed / 450) ** 2;
      const foe = game.paddles[other(this.p)];
      const away = foe.x < W / 2 ? 1 : -1;
      this.aimOff = away * cfg.aim * this.rng.range(0.5, 1.2);
    }
    let tx = W / 2;
    if (comingAtMe) {
      const pd = game.paddles[this.p];
      const x = predictX(s, myY) + this.err;
      tx = x - this.aimOff * (pd.w / 2);
    } else if (!s.serving) {
      tx = W / 2 + (s.x - W / 2) * 0.3;
    }
    return { tx, power: game.powersOn && game.energy[this.p].ready && this.wantsPower(game, comingAtMe) };
  }

  private wantsPower(game: PingPong, comingAtMe: boolean): boolean {
    const id = game.players[this.p].power?.id;
    if (!comingAtMe) return false;
    const myHalf = this.p === 0 ? game.ball.y > MID : game.ball.y < MID;
    if (id === 'slowmo') return Math.hypot(game.ball.vx, game.ball.vy) > 520 && !myHalf;
    return myHalf; // smash / curve arm for the return we are about to hit
  }
}

/** Straight-line guess of the ball's x when it reaches y, folding in side-wall bounces. */
export function predictX(s: { x: number; y: number; vx: number; vy: number }, y: number): number {
  if (Math.abs(s.vy) < 1) return s.x;
  const t = (y - s.y) / s.vy;
  if (t < 0) return s.x;
  const lo = RULES.wallX0 + RULES.ballR;
  const hi = RULES.wallX1 - RULES.ballR;
  const span = hi - lo;
  let x = s.x + s.vx * t - lo;
  x = ((x % (2 * span)) + 2 * span) % (2 * span);
  return lo + (x > span ? 2 * span - x : x);
}
