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
  /** Paddle home y (centre) for player 0 (bottom) and player 1 (top). */
  paddleY: [H - 66, 66] as const,
  /** How far toward the net a paddle can lunge from home. */
  reach: 96,
  paddleW: 66,
  paddleWMax: 94,
  paddleH: 12,
  /** Speed cap per axis, the same for people and bots. */
  paddleSpeed: 720,
  ballR: 7,
  serveSpeed: 380,
  speedUp: 34,
  maxSpeed: 760,
  smashSpeed: 980,
  maxAngle: 0.85,
  /** Extra ball speed per unit of forward paddle speed at contact (a drive). */
  driveK: 0.4,
  /** Forward swing speed at contact that turns a drive into a smash (a hard, deliberate flick). */
  smashFwd: 600,
  /** A smash must be a mostly straight flick: sideways swing must stay under this × the forward swing. */
  smashStraight: 0.95,
  smashBonus: 230,
  /** Pulling the paddle back at contact: a soft chop with backspin. */
  chopFwd: -150,
  chopSlow: 0.8,
  /** Sideways paddle speed at contact turns into curve (sidespin), above a dead zone. */
  spinDead: 80,
  spinK: 0.6,
  maxSpin: 300,
  /** Sidespin (units/s²) that counts as a curve shot: called out and drawn purple. */
  curveCall: 110,
  /**
   * The swing a shot reads is the paddle's speed at contact or, if it was moving faster a
   * moment ago, that speed fading over this many seconds. A swipe that ends or hits the
   * end of the lunge just before the ball arrives still counts.
   */
  swingFade: 0.09,
  /** On the table bounce: topspin kicks the ball on, backspin checks it, sidespin kicks it sideways. */
  topKick: 0.16,
  backKick: 0.2,
  sideKick: 0.14,
  /** Ball speed toward a player at assist 3 (fraction of normal). */
  assistSlow: 0.8,
  slowmo: 0.45,
  curveAccel: 190,
  serveDelay: 1.0,
  pointDelay: 0.9,
  /** Where along a flight the ball bounces on the table (0 = hitter, 1 = receiver). */
  bounceAt: 0.72,
  /** Rally milestones (hits in one point) that get called out. */
  rallyMarks: [5, 10, 15, 20],
  energyHit: 0.08,
  energyConcede: 0.22,
};

export type Shot = 'serve' | 'block' | 'drive' | 'smash' | 'chop';

export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Sideways acceleration from sidespin or Curve Ball (units/s²). */
  ax: number;
  /** Topspin (+) or backspin (-), -1..1. Acts on the table bounce. */
  top: number;
  shot: Shot;
  smash: boolean;
  /** y the current flight started from, and the receiver's home face y. */
  fromY: number;
  toY: number;
  bounced: boolean;
};

export type Paddle = {
  x: number;
  /** Centre y; home is RULES.paddleY[p], up to RULES.reach toward the net. */
  y: number;
  vx: number;
  vy: number;
  w: number;
  /** Recent swing speed per axis (see RULES.swingFade); this is what shots read. */
  swingX: number;
  swingY: number;
  smash: boolean;
  curve: boolean;
  slowmo: number;
};

export type Event =
  | { type: 'hit'; p: PlayerIndex; x: number; y: number; speed: number; smash: boolean; curve: boolean; shot: Shot; spin: number }
  | { type: 'wall'; x: number; y: number }
  | { type: 'table'; x: number; y: number; top: number }
  | { type: 'serve'; p: PlayerIndex }
  | { type: 'rally'; hits: number }
  | { type: 'point'; scorer: PlayerIndex; x: number; y: number; rally: number }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'win'; p: PlayerIndex };

/** Where the paddle should move to and whether to fire the power. ty is optional (home if left out). */
export type Intent = { tx: number; ty?: number; power: boolean };

/** +1 if "toward the net" is increasing y for this player, else -1. */
export const fwdSign = (p: PlayerIndex): number => (p === 0 ? -1 : 1);

/** Relative-drag gain: finger travel toward the net → paddle lunge. */
export const LUNGE_GAIN = 0.85;
/** How fast a held lunge drifts back home (units/s of anchor creep). */
export const ANCHOR_CREEP = 70;

/**
 * Turns one player's finger into a paddle target. The paddle follows the finger's x;
 * pushing the finger toward the net (from the rear-most point it has been) lunges the
 * paddle forward. Pure so tests can play swipes through it exactly as the view does.
 */
export class FingerPaddle {
  private steer: { id: number; anchor: number } | null = null;

  constructor(readonly p: PlayerIndex) {}

  /** Lunge distance (0..) for this frame's finger, or 0 with no finger down. */
  lunge(finger: { id: number; y: number } | null | undefined, dt: number): number {
    if (!finger) {
      this.steer = null;
      return 0;
    }
    const fs = fwdSign(this.p);
    let st = this.steer;
    if (!st || st.id !== finger.id) st = this.steer = { id: finger.id, anchor: finger.y };
    // Distance the finger is in front of its anchor; pulling back past it moves the anchor.
    let ahead = (finger.y - st.anchor) * fs;
    if (ahead < 0) {
      st.anchor = finger.y;
      ahead = 0;
    }
    // A held lunge drifts home slowly (too slowly to count as a chop).
    st.anchor += fs * Math.min(ahead, ANCHOR_CREEP * dt);
    return ahead * LUNGE_GAIN;
  }
}

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
  /** Longest rally of the match (hits in one point). */
  bestRally = 0;
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
    const mk = (p: PlayerIndex): Paddle => ({ x: W / 2, y: RULES.paddleY[p], vx: 0, vy: 0, swingX: 0, swingY: 0, w: w(p), smash: false, curve: false, slowmo: 0 });
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

  /** Paddle face y (the side facing the net) where the paddle is now. */
  faceY(p: PlayerIndex): number {
    return this.paddles[p].y + (fwdSign(p) * RULES.paddleH) / 2;
  }

  /** Face y with the paddle at home. */
  homeFaceY(p: PlayerIndex): number {
    return RULES.paddleY[p] + (fwdSign(p) * RULES.paddleH) / 2;
  }

  /** Allowed paddle centre y range for a player [min, max]. */
  zone(p: PlayerIndex): [number, number] {
    const home = RULES.paddleY[p];
    return p === 0 ? [home - RULES.reach, home] : [home, home + RULES.reach];
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
    const lift = this.ball.smash ? 0.6 : this.ball.shot === 'chop' ? 1.25 : 1;
    if (u < k) {
      const v = u / k;
      return (10 * (1 - v) + 34 * 4 * v * (1 - v) * (1 - v * 0.3)) * lift;
    }
    const v = (u - k) / (1 - k);
    return 16 * v * (2 - v) * (1 + 0.5 * Math.max(0, this.ball.top));
  }

  /** Current speed factor on the ball: handicap and Slow-mo toward the receiver. */
  speedFactor(): number {
    const p = this.toward;
    return this.towardFactor[p] * (this.paddles[p].slowmo > 0 ? RULES.slowmo : 1);
  }

  private serveBall(): Ball {
    const p = this.server;
    const y = this.faceY(p) + fwdSign(p) * (RULES.ballR + 1);
    return { x: this.paddles[p].x, y, vx: 0, vy: 0, ax: 0, top: 0, shot: 'serve', smash: false, fromY: y, toY: this.homeFaceY(other(p)), bounced: false };
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
    // Each paddle's move this frame, capped per axis. Applied in sub-steps with the ball
    // so a lunge meets the ball where it really is.
    const moves: [number, number][] = [];
    for (const p of [0, 1] as PlayerIndex[]) {
      this.energy[p].tick(dt);
      const pd = this.paddles[p];
      pd.slowmo = Math.max(0, pd.slowmo - dt);
      if (this.powersOn && intents[p].power) this.firePower(p);
      const half = pd.w / 2;
      const tx = clamp(intents[p].tx, RULES.wallX0 + half, RULES.wallX1 - half);
      const [y0, y1] = this.zone(p);
      const ty = clamp(intents[p].ty ?? RULES.paddleY[p], y0, y1);
      const cap = RULES.paddleSpeed * dt;
      const dx = clamp(tx - pd.x, -cap, cap);
      const dy = clamp(ty - pd.y, -cap, cap);
      pd.vx = dx / dt;
      pd.vy = dy / dt;
      pd.swingX = swing(pd.swingX, pd.vx, dt);
      pd.swingY = swing(pd.swingY, pd.vy, dt);
      moves.push([dx, dy]);
    }
    const sub = 4;
    const live = this.pointT <= 0 && this.serveT <= 0;
    const f = live ? this.speedFactor() : 0;
    for (let i = 0; i < sub; i++) {
      for (const p of [0, 1] as PlayerIndex[]) {
        this.paddles[p].x += moves[p][0] / sub;
        this.paddles[p].y += moves[p][1] / sub;
      }
      if (live && this.pointT <= 0 && this.winner === null) this.moveBall((dt / sub) * f);
    }
    if (this.pointT > 0 && !live) {
      this.pointT -= dt;
      if (this.pointT <= 0) {
        this.server = this.serverFor(this.score[0] + this.score[1]);
        this.serveT = RULES.serveDelay;
        this.ball = this.serveBall();
      }
      return;
    }
    if (this.serveT > 0 && this.pointT <= 0) {
      const p = this.server;
      this.ball.x = this.paddles[p].x;
      this.ball.y = this.faceY(p) + fwdSign(p) * (RULES.ballR + 1);
      this.serveT -= dt;
      if (this.serveT <= 0) this.launchServe();
    }
  }

  private launchServe(): void {
    const p = this.server;
    const b = this.ball;
    const a = this.rng.range(-0.3, 0.3);
    this.rally = RULES.serveSpeed;
    this.hits = 0;
    b.vx = Math.sin(a) * this.rally;
    b.vy = fwdSign(p) * Math.cos(a) * this.rally;
    b.fromY = b.y;
    b.toY = this.homeFaceY(other(p));
    b.shot = 'serve';
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
      bounceKick(b);
      this.events.push({ type: 'table', x: b.x, y: b.y, top: b.top });
    }
    const p = this.toward;
    const pd = this.paddles[p];
    const s = fwdSign(p);
    const face = pd.y + (s * RULES.paddleH) / 2;
    const backFace = pd.y - (s * RULES.paddleH) / 2;
    // Ball edge has reached the face, and isn't already past the back of the paddle.
    const front = s < 0 ? b.y + r >= face : b.y - r <= face;
    const back = s < 0 ? b.y - r <= backFace : b.y + r >= backFace;
    if (front && back && Math.abs(b.x - pd.x) <= pd.w / 2 + r) {
      this.hit(p);
      return;
    }
    if (s < 0 ? b.y > H + r : b.y < -r) this.point(other(p));
  }

  private hit(p: PlayerIndex): void {
    const b = this.ball;
    const pd = this.paddles[p];
    const s = fwdSign(p);
    const off = clamp((b.x - pd.x) / (pd.w / 2), -1, 1);
    const a = off * RULES.maxAngle;
    this.hits++;
    this.bestRally = Math.max(this.bestRally, this.hits);
    this.rally = Math.min(RULES.maxSpeed, this.rally + RULES.speedUp);
    // How the paddle was moving when it met the ball decides the shot.
    const fwd = pd.swingY * s;
    const sideSwing = pd.swingX;
    let shot: Shot = 'block';
    let sp = this.rally;
    let top = 0;
    if (fwd >= RULES.smashFwd && Math.abs(sideSwing) <= RULES.smashStraight * fwd) {
      shot = 'smash';
      sp = Math.min(RULES.smashSpeed, this.rally + RULES.smashBonus);
      top = 1;
    } else if (fwd > 60) {
      shot = 'drive';
      sp = this.rally + Math.min(fwd, RULES.smashFwd) * RULES.driveK;
      top = Math.min(1, fwd / RULES.smashFwd);
    } else if (fwd <= RULES.chopFwd) {
      shot = 'chop';
      sp = this.rally * RULES.chopSlow;
      top = -1;
    }
    const power = pd.smash;
    if (power) {
      shot = 'smash';
      sp = RULES.smashSpeed;
      top = 1;
    }
    pd.smash = false;
    b.vx = Math.sin(a) * sp;
    b.vy = s * Math.cos(a) * sp;
    b.y = this.faceY(p) + s * RULES.ballR;
    b.smash = shot === 'smash';
    b.shot = shot;
    b.top = top;
    // Brushing sideways through the ball puts curve on it, in the direction of the swipe.
    const side = Math.abs(sideSwing) > RULES.spinDead ? clamp((sideSwing - Math.sign(sideSwing) * RULES.spinDead) * RULES.spinK, -RULES.maxSpin, RULES.maxSpin) : 0;
    b.ax = side;
    const curve = pd.curve;
    if (curve) {
      pd.curve = false;
      // Bend away from the side the opponent is standing on.
      b.ax = (this.paddles[other(p)].x < W / 2 ? 1 : -1) * RULES.curveAccel;
    }
    b.fromY = b.y;
    b.toY = this.homeFaceY(other(p));
    b.bounced = false;
    this.events.push({ type: 'hit', p, x: b.x, y: b.y, speed: sp, smash: b.smash, curve, shot, spin: b.ax });
    if ((RULES.rallyMarks as number[]).includes(this.hits)) this.events.push({ type: 'rally', hits: this.hits });
    // Long rallies charge the meter faster.
    const rallyBoost = 1 + Math.min(this.hits, 12) / 12;
    this.energy[p].charge(RULES.energyHit * rallyBoost, this.score[p] < this.score[other(p)]);
  }

  private point(scorer: PlayerIndex): void {
    const b = this.ball;
    this.score[scorer]++;
    this.events.push({ type: 'point', scorer, x: clamp(b.x, 20, W - 20), y: clamp(b.y, 20, H - 20), rally: this.hits });
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

/** Swing memory for one axis: the current speed, or a faster recent one fading out. */
function swing(prev: number, v: number, dt: number): number {
  if (prev * v <= 0 && Math.abs(v) > 1) return v;
  if (Math.abs(v) >= Math.abs(prev)) return v;
  return v + (prev - v) * Math.exp(-dt / RULES.swingFade);
}

/** What the table bounce does to a spinning ball. Shared with the bot's forecast. */
export function bounceKick(b: { vx: number; vy: number; ax: number; top: number }): void {
  const k = b.top >= 0 ? 1 + RULES.topKick * b.top : 1 + RULES.backKick * b.top;
  b.vx = b.vx * k + b.ax * RULES.sideKick;
  b.vy *= k;
}

// ---------- Honest bot ----------
// Same paddle speed caps as a person. It forecasts where the ball reaches its end from
// a delayed view of the ball (reaction time), using only what a player can see (where
// the ball is, where it's going, how it's curving), and misjudges it by an amount that
// grows quickly with speed and curve. Skill changes only delay, noise, how boldly it aims
// for the edges of its paddle, and how often it tries drives, curves and smashes.
const BOT = {
  easy: { react: 0.3, noise: 36, aim: 0.3, drive: 0.15, curve: 0.05, smash: 0 },
  normal: { react: 0.18, noise: 28, aim: 0.5, drive: 0.4, curve: 0.2, smash: 0.25 },
  hard: { react: 0.1, noise: 12, aim: 0.65, drive: 0.6, curve: 0.3, smash: 0.6 },
} satisfies Record<BotLevel, { react: number; noise: number; aim: number; drive: number; curve: number; smash: number }>;

type Seen = Ball & { serving: boolean; factor: number };

/** The swing a bot plans for one incoming ball: paddle speed toward the net and sideways at contact. */
type Plan = { fwd: number; side: number };

export class PingPongBot {
  private seen: Seen[] = [];
  private approachSign = 0;
  private err = 0;
  private aimOff = 0;
  private plan: Plan = { fwd: 0, side: 0 };

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  think(game: PingPong, dt: number): Intent {
    const cfg = BOT[this.level];
    const b = game.ball;
    this.seen.push({ ...b, serving: game.serving || game.pointT > 0, factor: game.speedFactor() });
    const lag = Math.round(cfg.react / dt);
    while (this.seen.length > lag + 1) this.seen.shift();
    const s = this.seen[0];
    const p = this.p;
    const fs = fwdSign(p);
    const home = RULES.paddleY[p];
    const comingAtMe = !s.serving && (p === 0 ? s.vy > 0 : s.vy < 0);
    const sign = comingAtMe ? 1 : -1;
    if (sign !== this.approachSign) {
      this.approachSign = sign;
      // A fresh read of the incoming ball: new misjudgement, aim and swing.
      const speed = Math.hypot(s.vx, s.vy);
      this.err = this.rng.range(-1, 1) * cfg.noise * (speed / 450) ** 2 * (1 + Math.abs(s.ax) / 300);
      const foe = game.paddles[other(p)];
      const away = foe.x < W / 2 ? 1 : -1;
      this.aimOff = away * cfg.aim * this.rng.range(0.5, 1.2);
      const r = this.rng.next();
      const slow = speed < 560;
      if (slow && r < cfg.smash * 0.5) this.plan = { fwd: RULES.smashFwd + 60, side: 0 };
      else if (r < cfg.drive) this.plan = { fwd: this.rng.range(150, 380), side: 0 };
      else this.plan = { fwd: 0, side: 0 };
      if (this.rng.chance(cfg.curve)) this.plan.side = away * this.rng.range(300, 520);
    }
    let tx = W / 2;
    let ty: number = home;
    if (comingAtMe) {
      const pd = game.paddles[p];
      const plan = this.plan;
      // Meet the ball a little in front of home when swinging forward, so the swing has room.
      const lunge = plan.fwd > 0 ? Math.min(RULES.reach * 0.6, (plan.fwd * 0.12)) : 0;
      const contactY = home + fs * lunge;
      const faceY = contactY + (fs * RULES.paddleH) / 2;
      const fc = forecast(s, faceY);
      const tLeft = Math.max(0, fc.t / Math.max(0.2, s.factor) - lag * dt);
      const x = fc.x + this.err;
      const cx = x - this.aimOff * (pd.w / 2);
      // Run through the contact point at the planned speeds: be behind it now by speed × time left.
      tx = cx - plan.side * tLeft;
      ty = contactY - fs * plan.fwd * tLeft;
    } else if (!s.serving) {
      tx = W / 2 + (s.x - W / 2) * 0.3;
    }
    return { tx, ty, power: game.powersOn && game.energy[p].ready && this.wantsPower(game, comingAtMe) };
  }

  private wantsPower(game: PingPong, comingAtMe: boolean): boolean {
    const id = game.players[this.p].power?.id;
    if (!comingAtMe) return false;
    const myHalf = this.p === 0 ? game.ball.y > MID : game.ball.y < MID;
    if (id === 'slowmo') return Math.hypot(game.ball.vx, game.ball.vy) > 520 && !myHalf;
    return myHalf; // smash / curve arm for the return we are about to hit
  }
}

/**
 * Where (x) and in how many seconds of ball time (t) the ball reaches `y`, following the
 * same rules as the game: curve, wall bounces that kill the curve, and the table-bounce kick.
 */
export function forecast(b: Ball, y: number): { x: number; t: number } {
  if (Math.abs(b.vy) < 1) return { x: b.x, t: 0 };
  const c = { ...b };
  const h = 1 / 120;
  const lo = RULES.wallX0 + RULES.ballR;
  const hi = RULES.wallX1 - RULES.ballR;
  let t = 0;
  const reached = () => (c.vy > 0 ? c.y >= y : c.y <= y);
  for (let i = 0; i < 480 && !reached(); i++) {
    c.vx += c.ax * h;
    c.x += c.vx * h;
    c.y += c.vy * h;
    t += h;
    if (c.x < lo) {
      c.x = lo;
      c.vx = Math.abs(c.vx);
      c.ax = 0;
    } else if (c.x > hi) {
      c.x = hi;
      c.vx = -Math.abs(c.vx);
      c.ax = 0;
    }
    if (!c.bounced && clamp((c.y - c.fromY) / (c.toY - c.fromY || 1), 0, 1.2) >= RULES.bounceAt) {
      c.bounced = true;
      bounceKick(c);
    }
  }
  return { x: c.x, t };
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
