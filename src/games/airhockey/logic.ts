// Air Hockey rules: pure and deterministic, so tests can run whole matches.
import { Energy } from '../../core/energy';
import { lerpAssist } from '../../core/handicap';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';
import { clamp, H, MID, W } from '../../engine/world';

export const RULES = {
  winScore: 5,
  puckR: 14,
  paddleR: 26,
  /** Paddle radius at assist 3. */
  paddleRMax: 34,
  goalW: 124,
  goalWMax: 170,
  wall: 14,
  maxPaddleSpeed: 1500,
  maxPuckSpeed: 1100,
  friction: 0.4, // fraction of speed lost per second
  serveDelay: 0.9,
  energyHit: 0.12,
  energyConcede: 0.25,
  giantScale: 1.6,
  /**
   * Stall rule (real tables give a player 7 s to shoot): a puck that stays in one
   * half this long gets a "Your shot!" nudge, and after `driftAfter` the table's
   * air blows it gently over the centre line, so a walked-away player or a puck
   * resting out of reach never stops the match.
   */
  nudgeAfter: 4,
  driftAfter: 7,
  /** After a drift, the puck gets this long to cross before the air blows again. */
  driftRetry: 2.5,
  /** Where a drift stops: this far past the centre line, mid-table. */
  driftPast: 90,
};

/** `held`: which half the puck is resting in and for how long (the stall rule). */
export type Puck = { x: number; y: number; vx: number; vy: number; alive: boolean; held?: { p: PlayerIndex; t: number; nudged: boolean } };
export type Paddle = { x: number; y: number; vx: number; vy: number; r: number; frozen: number; giant: number };

export type Event =
  | { type: 'hit'; x: number; y: number; p: PlayerIndex; speed: number }
  | { type: 'wall'; x: number; y: number }
  | { type: 'goal'; scorer: PlayerIndex; x: number }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'nudge'; p: PlayerIndex }
  | { type: 'drift'; p: PlayerIndex; x: number; y: number }
  | { type: 'win'; p: PlayerIndex };

/** What a player wants this step: where the paddle should go, and whether to fire the power. */
export type Intent = { tx: number; ty: number; power: boolean };

export class AirHockey {
  score: [number, number] = [0, 0];
  pucks: Puck[] = [];
  paddles: [Paddle, Paddle];
  energy: [Energy, Energy];
  /** Each player's target goal width (the goal at the far end, defended by the other). */
  goalW: [number, number];
  serve = RULES.serveDelay;
  winner: PlayerIndex | null = null;
  events: Event[] = [];
  t = 0;
  /** Whose half the puck is resting in, and for how long (the stall rule). */
  held: { p: PlayerIndex; t: number } | null = null;
  private lastHit: [number, number] = [-1, -1];

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    readonly powersOn: boolean,
    private readonly rng: Rng,
  ) {
    const r = (p: PlayerIndex) => lerpAssist(players[p].assist, RULES.paddleR, RULES.paddleRMax);
    this.paddles = [
      { x: W / 2, y: H - 80, vx: 0, vy: 0, r: r(0), frozen: 0, giant: 0 },
      { x: W / 2, y: 80, vx: 0, vy: 0, r: r(1), frozen: 0, giant: 0 },
    ];
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    this.goalW = [lerpAssist(players[0].assist, RULES.goalW, RULES.goalWMax), lerpAssist(players[1].assist, RULES.goalW, RULES.goalWMax)];
    this.resetPuck(this.rng.chance(0.5) ? 0 : 1);
  }

  /** Goal width at the top edge (player 0 shoots at it) or bottom edge (player 1 shoots at it). */
  goalAt(edge: 'top' | 'bottom'): number {
    return edge === 'top' ? this.goalW[0] : this.goalW[1];
  }

  paddleRadius(p: PlayerIndex): number {
    const pd = this.paddles[p];
    return pd.giant > 0 ? pd.r * RULES.giantScale : pd.r;
  }

  resetPuck(toward: PlayerIndex): void {
    this.pucks = [{ x: W / 2, y: toward === 0 ? MID + 70 : MID - 70, vx: 0, vy: 0, alive: true }];
    this.serve = RULES.serveDelay;
    this.held = null;
  }

  /** Whose half a point is in: player 0 owns the bottom. */
  static halfOf(y: number): PlayerIndex {
    return y > MID ? 0 : 1;
  }

  step(dt: number, intents: [Intent, Intent]): void {
    this.events = [];
    if (this.winner !== null) return;
    this.t += dt;
    for (const p of [0, 1] as PlayerIndex[]) {
      this.energy[p].tick(dt);
      const pd = this.paddles[p];
      pd.frozen = Math.max(0, pd.frozen - dt);
      pd.giant = Math.max(0, pd.giant - dt);
      if (this.powersOn && intents[p].power) this.firePower(p);
      this.movePaddle(p, intents[p], dt);
    }
    if (this.serve > 0) {
      this.serve -= dt;
      return;
    }
    for (const puck of this.pucks) this.movePuck(puck, dt);
    this.pucks = this.pucks.filter((pk) => pk.alive);
    this.stallRule(dt);
  }

  private stallRule(dt: number): void {
    // Every puck has its own clock (a split puck makes two). Before, the rule only
    // watched a single puck, so two pucks left with a walked-away player stalled the
    // match for good. `held` mirrors the first puck, for the view's nudge ring.
    this.pucks.forEach((pk, i) => {
      const p = AirHockey.halfOf(pk.y);
      if (!pk.held || pk.held.p !== p) pk.held = { p, t: 0, nudged: false };
      const h = pk.held;
      h.t += dt;
      if (!h.nudged && h.t >= RULES.nudgeAfter) {
        h.nudged = true;
        this.events.push({ type: 'nudge', p });
      }
      if (h.t >= RULES.driftAfter) {
        // Slide to a spot just past the centre line: friction stops it there.
        const tx = W / 2 + (this.pucks.length > 1 ? (i === 0 ? -50 : 50) : 0);
        const ty = p === 0 ? MID - RULES.driftPast : MID + RULES.driftPast;
        const dx = tx - pk.x;
        const dy = ty - pk.y;
        const d = Math.hypot(dx, dy) || 1;
        const v = d * -Math.log(1 - RULES.friction);
        pk.vx = (dx / d) * v;
        pk.vy = (dy / d) * v;
        h.t = RULES.driftAfter - RULES.driftRetry;
        this.events.push({ type: 'drift', p, x: pk.x, y: pk.y });
      }
    });
    const first = this.pucks[0]?.held;
    this.held = first ? { p: first.p, t: first.t } : null;
  }



  private firePower(p: PlayerIndex): void {
    const power = this.players[p].power;
    if (!power || !this.energy[p].spend(power.duration ?? 0)) return;
    const foe = this.paddles[other(p)];
    if (power.id === 'freeze') {
      foe.frozen = power.duration ?? 1.2;
      foe.vx = foe.vy = 0;
    } else if (power.id === 'giant') {
      this.paddles[p].giant = power.duration ?? 5;
    } else if (power.id === 'split' && this.pucks.length === 1) {
      const a = this.pucks[0];
      const sp = Math.max(300, Math.hypot(a.vx, a.vy));
      const ang = Math.atan2(a.vy, a.vx);
      a.vx = Math.cos(ang - 0.35) * sp;
      a.vy = Math.sin(ang - 0.35) * sp;
      this.pucks.push({ x: a.x, y: a.y, vx: Math.cos(ang + 0.35) * sp, vy: Math.sin(ang + 0.35) * sp, alive: true });
    }
    this.events.push({ type: 'power', p, id: power.id });
  }

  private movePaddle(p: PlayerIndex, intent: Intent, dt: number): void {
    const pd = this.paddles[p];
    const r = this.paddleRadius(p);
    if (pd.frozen > 0) return;
    const minY = p === 0 ? MID + r : RULES.wall + r;
    const maxY = p === 0 ? H - RULES.wall - r : MID - r;
    const tx = clamp(intent.tx, RULES.wall + r, W - RULES.wall - r);
    const ty = clamp(intent.ty, minY, maxY);
    let dx = tx - pd.x;
    let dy = ty - pd.y;
    const d = Math.hypot(dx, dy);
    const maxStep = RULES.maxPaddleSpeed * dt;
    if (d > maxStep) {
      dx = (dx / d) * maxStep;
      dy = (dy / d) * maxStep;
    }
    pd.x += dx;
    pd.y += dy;
    pd.vx = dx / dt;
    pd.vy = dy / dt;
  }

  private movePuck(pk: Puck, dt: number): void {
    // Sub-steps keep fast pucks from tunnelling through paddles.
    const sub = 4;
    const h = dt / sub;
    for (let i = 0; i < sub && pk.alive; i++) {
      pk.x += pk.vx * h;
      pk.y += pk.vy * h;
      this.walls(pk);
      for (const p of [0, 1] as PlayerIndex[]) this.collide(pk, p);
    }
    const k = Math.pow(1 - RULES.friction, dt);
    pk.vx *= k;
    pk.vy *= k;
  }

  private walls(pk: Puck): void {
    const r = RULES.puckR;
    const w = RULES.wall;
    if (pk.x < w + r) {
      pk.x = w + r;
      pk.vx = Math.abs(pk.vx);
      this.events.push({ type: 'wall', x: pk.x, y: pk.y });
    } else if (pk.x > W - w - r) {
      pk.x = W - w - r;
      pk.vx = -Math.abs(pk.vx);
      this.events.push({ type: 'wall', x: pk.x, y: pk.y });
    }
    for (const edge of ['top', 'bottom'] as const) {
      const atEdge = edge === 'top' ? pk.y < w + r : pk.y > H - w - r;
      if (!atEdge) continue;
      const half = this.goalAt(edge) / 2;
      const inMouth = Math.abs(pk.x - W / 2) < half - r * 0.3;
      if (inMouth) {
        const beyond = edge === 'top' ? pk.y < -r : pk.y > H + r;
        if (beyond) this.goal(pk, edge === 'top' ? 0 : 1);
      } else {
        pk.y = edge === 'top' ? w + r : H - w - r;
        pk.vy = edge === 'top' ? Math.abs(pk.vy) : -Math.abs(pk.vy);
        this.events.push({ type: 'wall', x: pk.x, y: pk.y });
      }
    }
  }

  private collide(pk: Puck, p: PlayerIndex): void {
    const pd = this.paddles[p];
    const R = this.paddleRadius(p) + RULES.puckR;
    const dx = pk.x - pd.x;
    const dy = pk.y - pd.y;
    const d = Math.hypot(dx, dy);
    if (d >= R || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    pk.x = pd.x + nx * R;
    pk.y = pd.y + ny * R;
    const rvx = pk.vx - pd.vx;
    const rvy = pk.vy - pd.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const e = 0.9;
      pk.vx -= (1 + e) * vn * nx;
      pk.vy -= (1 + e) * vn * ny;
    }
    const sp = Math.hypot(pk.vx, pk.vy);
    if (sp > RULES.maxPuckSpeed) {
      pk.vx *= RULES.maxPuckSpeed / sp;
      pk.vy *= RULES.maxPuckSpeed / sp;
    }
    if (vn < -40 && this.t - this.lastHit[p] > 0.15) {
      this.lastHit[p] = this.t;
      this.events.push({ type: 'hit', x: pk.x, y: pk.y, p, speed: Math.min(sp, RULES.maxPuckSpeed) });
      this.energy[p].charge(RULES.energyHit, this.score[p] < this.score[other(p)]);
    }
  }

  private goal(pk: Puck, scorer: PlayerIndex): void {
    pk.alive = false;
    this.score[scorer]++;
    this.events.push({ type: 'goal', scorer, x: pk.x });
    const loser = other(scorer);
    this.energy[loser].charge(RULES.energyConcede, true);
    if (this.score[scorer] >= RULES.winScore) {
      this.winner = scorer;
      this.pucks = [];
      this.events.push({ type: 'win', p: scorer });
      return;
    }
    // With a split puck, the round ends on the first goal.
    for (const o of this.pucks) o.alive = false;
    this.resetPuck(loser);
  }
}

// ---------- Honest bot ----------
// Same paddle speed cap as a person. Skill only changes how stale its view of
// the puck is (reaction time) and how much it misjudges where to hit.
const BOT = {
  easy: { react: 0.45, noise: 50, strikeSpeed: 180, windup: 6 },
  normal: { react: 0.22, noise: 16, strikeSpeed: 260, windup: 16 },
  hard: { react: 0.12, noise: 6, strikeSpeed: 320, windup: 24 },
} satisfies Record<BotLevel, { react: number; noise: number; strikeSpeed: number; windup: number }>;

/**
 * The bot's hand. A person's finger has mass: it speeds up and slows down, it can't
 * reverse ten times a second, and it doesn't snap to every new idea. The bot decides
 * where it wants the paddle, then this hand steers a virtual finger there (it slows
 * as it arrives, accelerates no harder than `accel`, never faster than a person's
 * paddle cap). The same for every level, so it doesn't change how good the bot is,
 * only how it looks. Checked by core/motion.ts in the tests.
 */
export const HAND = {
  /** Units/s² (a quick move of a finger). */
  accel: 12000,
  /** During a shot it may flick harder, like a person snapping their wrist. */
  shotAccel: 22000,
  /** How eagerly the hand closes the gap: desired speed = gap × gain. */
  gain: 15,
  /** A decision (strike / defend / step aside) is kept at least this long. */
  commit: 0.25,
  /** Seconds to ease toward a new spot: striking, and guarding the goal. */
  easeStrike: 0.08,
  easeDefend: 0.15,
};

export class AirHockeyBot {
  private seen: { x: number; y: number; vx: number; vy: number }[] = [];
  private jitter = { x: 0, y: 0 };
  private retarget = 0;
  private aim = W / 2;
  private backOff = 0;
  private mode = '';
  /** The virtual finger, and its velocity. */
  private hand: { x: number; y: number; vx: number; vy: number } | null = null;
  /** Strike or defend, held for `HAND.commit` once chosen. */
  private plan: { strike: boolean; t: number } = { strike: false, t: 0 };
  /** A shot in progress: its fixed direction, then a short recovery. */
  private shot: { phase: 'shoot' | 'recover'; t: number; ux: number; uy: number } | null = null;
  /** Which side of the puck it walks around, and which side it clears a back-wall puck from (0 = not chosen). */
  private aroundSide = 0;
  private wallSide = 0;
  /** The decided target, eased so a stale glimpse or new noise doesn't yank the hand. */
  private goal: { x: number; y: number } | null = null;
  private asideT = 0;
  private asideSide = 1;

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  think(game: AirHockey, dt: number): Intent {
    const want = this.decide(game, dt);
    const pd = game.paddles[this.p];
    if (!this.hand || pd.frozen > 0) this.hand = { x: pd.x, y: pd.y, vx: 0, vy: 0 };
    const h = this.hand;
    // Stay inside what the paddle can reach, so the finger never winds up off the table.
    const r = game.paddleRadius(this.p);
    // Ease the decided spot: quick when striking, lazier when guarding the goal.
    const tau = this.mode === 'defend' ? HAND.easeDefend : HAND.easeStrike;
    if (!this.goal) this.goal = { x: want.tx, y: want.ty };
    const k = 1 - Math.exp(-dt / tau);
    this.goal.x += (want.tx - this.goal.x) * k;
    this.goal.y += (want.ty - this.goal.y) * k;
    const tx = clamp(this.goal.x, RULES.wall + r, W - RULES.wall - r);
    const ty = this.p === 0 ? clamp(this.goal.y, MID + r, H - RULES.wall - r) : clamp(this.goal.y, RULES.wall + r, MID - r);
    // If the paddle was held back (a wall, the centre line), the finger is where the paddle is.
    if (Math.hypot(h.x - pd.x, h.y - pd.y) > 4) {
      h.x = pd.x;
      h.y = pd.y;
    }
    let dvx = (tx - h.x) * HAND.gain;
    let dvy = (ty - h.y) * HAND.gain;
    const dv = Math.hypot(dvx, dvy);
    if (dv > RULES.maxPaddleSpeed) {
      dvx *= RULES.maxPaddleSpeed / dv;
      dvy *= RULES.maxPaddleSpeed / dv;
    }
    let ax = (dvx - h.vx) / dt;
    let ay = (dvy - h.vy) / dt;
    const a = Math.hypot(ax, ay);
    const aMax = this.mode === 'push' ? HAND.shotAccel : HAND.accel;
    if (a > aMax) {
      ax *= aMax / a;
      ay *= aMax / a;
    }
    h.vx += ax * dt;
    h.vy += ay * dt;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    return { tx: h.x, ty: h.y, power: want.power };
  }

  /** Where the bot wants its paddle this step (the hand smooths the way there). */
  private decide(game: AirHockey, dt: number): Intent {
    const cfg = BOT[this.level];
    const pk = game.pucks[0];
    const pd = game.paddles[this.p];
    const home = { x: W / 2, y: this.p === 0 ? H - 70 : 70 };
    if (!pk) return { tx: home.x, ty: home.y, power: false };
    // Delay line: the bot reacts to where the puck was `react` seconds ago.
    this.seen.push({ x: pk.x, y: pk.y, vx: pk.vx, vy: pk.vy });
    const lag = Math.round(cfg.react / dt);
    while (this.seen.length > lag + 1) this.seen.shift();
    const s = this.seen[0];
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = 0.4;
      this.jitter = { x: this.rng.range(-cfg.noise, cfg.noise), y: this.rng.range(-cfg.noise, cfg.noise) };
      // Not while striking: a person keeps one aim for the whole approach and shot.
      if (!this.plan.strike) this.pickAim(game);
    }
    const myHalf = this.p === 0 ? s.y > MID : s.y < MID;
    const comingAtMe = this.p === 0 ? s.vy > 0 : s.vy < 0;
    let tx: number;
    let ty: number;
    const strikeNow = myHalf && (!comingAtMe || Math.hypot(s.vx, s.vy) < cfg.strikeSpeed);
    this.plan.t -= dt;
    // Keep the last decision a moment, unless the puck has left our half (then defend at once).
    if (strikeNow !== this.plan.strike && (this.plan.t <= 0 || !myHalf)) {
      this.plan = { strike: strikeNow, t: HAND.commit };
      this.shot = null;
      this.aroundSide = 0;
    }
    const r = game.paddleRadius(this.p);
    const hitIt = game.events.some((ev) => ev.type === 'hit' && ev.p === this.p);
    if (this.plan.strike && myHalf) {
      // Strike: get behind the puck on the line to the far goal, then push through it.
      // Like a person, it commits: one aim per approach, one shot once lined up, then
      // a short step back before the next try.
      const aimX = this.aim;
      const aimY = this.p === 0 ? 0 : H;
      const ax = aimX - s.x;
      const ay = aimY - s.y;
      const al = Math.hypot(ax, ay) || 1;
      // Wind up a little behind the puck, so the shot has a run-up like a person's
      // (a short one on easy: softer shots, for small kids).
      const back = r + RULES.puckR + cfg.windup;
      let behind = { x: s.x - (ax / al) * back, y: s.y - (ay / al) * back };
      const fitsBehind = (b: { x: number; y: number }) =>
        b.x > RULES.wall + r && b.x < W - RULES.wall - r && (this.p === 0 ? b.y < H - RULES.wall - r : b.y > RULES.wall + r);
      // No room for a run-up (near our back wall): tuck in close instead, as before.
      if (!fitsBehind(behind)) behind = { x: s.x - (ax / al) * 30, y: s.y - (ay / al) * 30 };
      const reachable =
        behind.x > RULES.wall + r && behind.x < W - RULES.wall - r && (this.p === 0 ? behind.y < H - RULES.wall - r : behind.y > RULES.wall + r);
      if (this.shot) {
        this.shot.t -= dt;
        if (hitIt && this.shot.phase === 'shoot') this.shot = { ...this.shot, phase: 'recover', t: 0.25 };
        else if (this.shot.t <= 0) {
          if (this.shot.phase === 'shoot') this.shot = { ...this.shot, phase: 'recover', t: 0.25 };
          else {
            this.shot = null;
            this.pickAim(game);
          }
        }
      }
      if (this.shot && this.shot.phase === 'recover') {
        this.mode = 'recover';
        // Ease back toward our own goal, a little, after a shot.
        tx = pd.x + (home.x - pd.x) * 0.3;
        ty = pd.y + (home.y - pd.y) * 0.5;
      } else if (this.shot) {
        this.mode = 'push';
        tx = s.x + this.shot.ux * 80;
        ty = s.y + this.shot.uy * 80;
      } else if (!reachable) {
        this.mode = 'jab';
        // Puck is in a corner or on our back wall: jab at it, then back off so it can bounce out.
        const cx = W / 2 - s.x;
        const cy = MID - s.y;
        const cl = Math.hypot(cx, cy) || 1;
        const close = Math.hypot(pd.x - s.x, pd.y - s.y) < r + RULES.puckR + 8;
        if (close && this.backOff <= 0) this.backOff = 0.35;
        if (this.backOff > 0) {
          this.backOff -= dt;
          tx = s.x + (cx / cl) * 90;
          ty = s.y + (cy / cl) * 90;
        } else {
          tx = s.x;
          ty = s.y;
          const backWall = this.p === 0 ? H - RULES.wall : RULES.wall;
          if (Math.abs(backWall - s.y) < r + RULES.puckR * 2) {
            // On our own back wall a jab from in front pushes it into our goal. Come
            // down beside it, then push it sideways along the wall instead.
            const clear = r + RULES.puckR + 6;
            if (this.wallSide === 0 || Math.abs(pd.x - s.x) > clear * 2) this.wallSide = pd.x < s.x ? -1 : 1;
            if (Math.abs(pd.y - s.y) > RULES.puckR) {
              tx = s.x + this.wallSide * clear * 1.1;
              ty = pd.y + (s.y - pd.y) * 0.8;
            } else {
              tx = s.x - this.wallSide * 40;
              ty = s.y;
            }
          }
        }
      } else {
        this.backOff = 0;
        this.wallSide = 0;
        this.mode = 'behind';
        tx = behind.x;
        ty = behind.y;
        const way = this.goAround(s, ax / al, ay / al, pd, r);
        if (way) {
          this.mode = 'around';
          tx = way.x;
          ty = way.y;
        } else {
          this.aroundSide = 0;
          if (Math.hypot(pd.x - behind.x, pd.y - behind.y) < 20) {
            // Lined up: fire. The direction is fixed now, the target follows the puck.
            this.shot = { phase: 'shoot', t: 0.4, ux: ax / al, uy: ay / al };
            this.mode = 'push';
            tx = s.x + (ax / al) * 80;
            ty = s.y + (ay / al) * 80;
          }
        }
      }
    } else {
      this.mode = 'defend';
      this.shot = null;
      // Defend: stay between the puck and our own goal. When the puck is coming,
      // move to where it will cross our line (bounces included), like a goalie;
      // when it's going away, drift back toward the middle.
      ty = home.y + (s.y - home.y) * 0.15;
      const lean = comingAtMe && Math.abs(s.vy) > 60 ? this.crossX(s, ty) : s.x;
      tx = W / 2 + (lean - W / 2) * (comingAtMe ? 0.8 : 0.35) + this.jitter.x;
    }
    if (this.mode !== 'jab') {
      // Never drive down onto a puck that is already between us and our own goal:
      // that pushes it in. Step aside and let it bounce off the back wall.
      const r = game.paddleRadius(this.p);
      const deeper = this.p === 0 ? s.y > pd.y : s.y < pd.y;
      const towardGoal = this.p === 0 ? ty > pd.y : ty < pd.y;
      const clear = r + RULES.puckR + 6;
      this.asideT -= dt;
      const inWay = Math.abs(s.x - pd.x) < clear && Math.abs(s.y - pd.y) < clear * 2;
      if (deeper && towardGoal && inWay) {
        if (this.asideT <= 0) this.asideSide = pd.x < s.x ? -1 : 1;
        this.asideT = HAND.commit;
      }
      if (deeper && this.asideT > 0) {
        const side = this.asideSide;
        const out = s.x + side * clear * 1.1;
        tx = out > RULES.wall + r && out < W - RULES.wall - r ? out : s.x - side * clear * 1.1;
        ty = pd.y;
        this.mode = 'aside';
      }
    }
    const e = game.energy[this.p];
    const power = game.powersOn && e.ready && this.wantsPower(game);
    return { tx, ty, power };
  }

  /**
   * When the paddle is on the far side of the puck (between it and the goal it is
   * shooting at), heading straight for the spot behind the puck would drag the puck
   * back into its own goal. A person walks around the puck instead: first sideways,
   * clear of it, then back past it. Returns the next waypoint, or null when the
   * paddle can go straight behind the puck.
   */
  private goAround(s: { x: number; y: number }, ux: number, uy: number, pd: { x: number; y: number }, r: number): { x: number; y: number } | null {
    const relx = pd.x - s.x;
    const rely = pd.y - s.y;
    const along = relx * ux + rely * uy; // > 0: the paddle is on the target side of the puck
    const px = -uy;
    const py = ux;
    const across = relx * px + rely * py;
    const clear = r + RULES.puckR + 10;
    if (along < -clear * (this.aroundSide ? 0.7 : 0.5)) return null;
    const lo = RULES.wall + r;
    const hi = W - RULES.wall - r;
    let side = this.aroundSide || (across >= 0 ? 1 : -1);
    const fits = (sd: number) => {
      const x = s.x + px * sd * clear;
      return x > lo && x < hi;
    };
    if (!fits(side) && fits(-side)) side = -side;
    // Once it has picked a side to walk round, it keeps it.
    this.aroundSide = side;
    if (along > -clear * 0.2 && Math.abs(across) < clear * 0.95) {
      // Ahead of the puck and in its way: step sideways first, keeping our distance along the line.
      const a = Math.max(along, clear * 0.3);
      return { x: s.x + px * side * clear * 1.1 + ux * a, y: s.y + py * side * clear * 1.1 + uy * a };
    }
    // Beside it: swing back past it on the same side.
    return { x: s.x + px * side * clear - ux * clear, y: s.y + py * side * clear - uy * clear };
  }

  /** Pick a spot to shoot at: either goal post side, a bank shot off a side wall, or the middle; misjudged by the level's noise. */
  private pickAim(game: AirHockey): void {
    const cfg = BOT[this.level];
    const half = game.goalAt(this.p === 0 ? 'top' : 'bottom') / 2 - 12;
    this.aim = this.rng.pick([W / 2 - half, W / 2 + half, -W * 0.35, W * 1.35, W / 2]) + this.rng.range(-cfg.noise, cfg.noise);
  }

  /** Where a puck seen at `s` will cross the line y = `y`, bouncing off the side walls. */
  private crossX(s: { x: number; y: number; vx: number; vy: number }, y: number): number {
    const t = (y - s.y) / s.vy;
    if (t <= 0) return s.x;
    const lo = RULES.wall + RULES.puckR;
    const span = W - RULES.wall - RULES.puckR - lo;
    // Unfold the bounces: a reflected path is a straight line on a mirrored table.
    let u = (s.x - lo + s.vx * Math.min(t, 1.5)) % (2 * span);
    if (u < 0) u += 2 * span;
    return lo + (u > span ? 2 * span - u : u);
  }

  private wantsPower(game: AirHockey): boolean {
    const id = game.players[this.p].power?.id;
    const pk = game.pucks[0];
    if (!pk) return false;
    const inMyHalf = this.p === 0 ? pk.y > MID : pk.y < MID;
    if (id === 'freeze') return inMyHalf; // freeze them right before we strike
    if (id === 'giant') return !inMyHalf;
    return inMyHalf && this.rng.next() < 0.02;
  }
}
