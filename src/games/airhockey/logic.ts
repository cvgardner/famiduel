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
};

export type Puck = { x: number; y: number; vx: number; vy: number; alive: boolean };
export type Paddle = { x: number; y: number; vx: number; vy: number; r: number; frozen: number; giant: number };

export type Event =
  | { type: 'hit'; x: number; y: number; p: PlayerIndex; speed: number }
  | { type: 'wall'; x: number; y: number }
  | { type: 'goal'; scorer: PlayerIndex; x: number }
  | { type: 'power'; p: PlayerIndex; id: string }
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
  easy: { react: 0.45, noise: 50, strikeSpeed: 180 },
  normal: { react: 0.22, noise: 16, strikeSpeed: 260 },
  hard: { react: 0.12, noise: 6, strikeSpeed: 320 },
} satisfies Record<BotLevel, { react: number; noise: number; strikeSpeed: number }>;

export class AirHockeyBot {
  private seen: { x: number; y: number; vx: number; vy: number }[] = [];
  private jitter = { x: 0, y: 0 };
  private retarget = 0;
  private aim = W / 2;
  private backOff = 0;

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  think(game: AirHockey, dt: number): Intent {
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
      // Pick a spot to shoot at: either goal post side, or a bank shot off a side wall.
      const half = game.goalAt(this.p === 0 ? 'top' : 'bottom') / 2 - 12;
      this.aim = this.rng.pick([W / 2 - half, W / 2 + half, -W * 0.35, W * 1.35, W / 2]);
    }
    const myHalf = this.p === 0 ? s.y > MID : s.y < MID;
    const comingAtMe = this.p === 0 ? s.vy > 0 : s.vy < 0;
    let tx: number;
    let ty: number;
    if (myHalf && (!comingAtMe || Math.hypot(s.vx, s.vy) < cfg.strikeSpeed)) {
      // Strike: get behind the puck on the line to the far goal, then push through it.
      const aimX = this.aim + this.jitter.x;
      const aimY = this.p === 0 ? 0 : H;
      const ax = aimX - s.x;
      const ay = aimY - s.y;
      const al = Math.hypot(ax, ay) || 1;
      const behind = { x: s.x - (ax / al) * 30, y: s.y - (ay / al) * 30 };
      const r = game.paddleRadius(this.p);
      const reachable =
        behind.x > RULES.wall + r && behind.x < W - RULES.wall - r && (this.p === 0 ? behind.y < H - RULES.wall - r : behind.y > RULES.wall + r);
      const lined = Math.hypot(pd.x - behind.x, pd.y - behind.y) < 22;
      if (!reachable) {
        // Puck is in a corner or on our back wall: jab at it, then back off so it can bounce out.
        const cx = W / 2 - s.x;
        const cy = MID - s.y;
        const cl = Math.hypot(cx, cy) || 1;
        const close = Math.hypot(pd.x - s.x, pd.y - s.y) < r + RULES.puckR + 8;
        if (close) this.backOff = 0.35;
        if (this.backOff > 0) {
          this.backOff -= dt;
          tx = s.x + (cx / cl) * 90;
          ty = s.y + (cy / cl) * 90;
        } else {
          tx = s.x;
          ty = s.y;
        }
      } else {
        tx = lined ? s.x + (ax / al) * 40 : behind.x;
        ty = lined ? s.y + (ay / al) * 40 : behind.y;
      }
    } else {
      // Defend: stay between the puck and our own goal.
      tx = W / 2 + (s.x - W / 2) * 0.6 + this.jitter.x;
      ty = home.y + (s.y - home.y) * 0.15;
    }
    const e = game.energy[this.p];
    const power = game.powersOn && e.ready && this.wantsPower(game);
    return { tx, ty, power };
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
