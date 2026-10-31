// Sumo rules: pure and deterministic, so tests can run whole matches.
// Two round wrestlers on a round ring. Each one turns at a constant speed;
// holding the button stops the turn and charges, letting go dashes forward.
// Circle physics with friction; leaving the ring loses the round. Best of 3.
// Rope saves: the rope catches a wrestler who dashes out on their own (nobody
// pushed them) a few times a round, so a mashing kid doesn't lose by themself
// in a second. The handicap adds saves.
import { Energy } from '../../core/energy';
import { lerpAssist } from '../../core/handicap';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';
import { clamp, MID, W } from '../../engine/world';

export const RULES = {
  roundsToWin: 2,
  /** Hard cap so a match of drawn rounds still ends. */
  maxRounds: 7,
  cx: W / 2,
  cy: MID,
  ringR: 142,
  /** The ring shrinks to this fraction after shrinkAfter seconds of a round, so rounds always end. */
  ringMinFrac: 0.55,
  shrinkAfter: 18,
  shrinkTime: 14,
  bodyR: 25,
  mass: 1,
  /** Mass at assist 3. */
  massMax: 1.3,
  /** Extra room past the rope before you are out, at assist 3. */
  marginMax: 8,
  turnSpeed: 2.1, // rad/s
  chargeTime: 0.85, // seconds to a full charge
  dashMin: 170,
  dashMax: 540,
  dashCooldown: 0.3,
  friction: 3.3, // velocity decay rate per second (v *= e^-k·dt)
  slipFriction: 0.7,
  restitution: 0.8,
  maxSpeed: 900,
  readyTime: 1.1,
  overTime: 1.5,
  growScale: 1.45,
  growMass: 1.8,
  poundWindup: 0.35,
  poundPush: 430,
  poundRange: 260,
  /** Seconds after contact during which the rope will not catch you (a push still counts). */
  ropeGrace: 0.7,
  /** Speed a caught wrestler bounces back off the rope, as a fraction of their outward speed. */
  ropeBounce: 0.3,
  /** Rope saves per round at assist 0, and at assist 3. */
  ropeSaves: 3,
  ropeSavesMax: 6,
  energyPerSec: 0.025,
  energyHit: 0.1,
  energyLoseRound: 0.3,
};

export type Wrestler = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  /** +1 or -1: which way this wrestler turns. */
  spin: 1 | -1;
  charging: boolean;
  charge: number;
  cooldown: number;
  baseMass: number;
  margin: number;
  grow: number;
  slip: number;
  pound: number;
  out: boolean;
  /** Seconds since this wrestler last touched the other one (or was pounded). */
  freeT: number;
  /** Rope saves left this round. */
  saves: number;
};

export type Phase = 'ready' | 'fight' | 'over' | 'done';

export type Event =
  | { type: 'dash'; p: PlayerIndex; x: number; y: number; power: number }
  | { type: 'bump'; x: number; y: number; strength: number; nx: number; ny: number }
  | { type: 'out'; p: PlayerIndex; x: number; y: number }
  | { type: 'round'; winner: PlayerIndex | null; round: number }
  | { type: 'fight'; round: number }
  | { type: 'shrink' }
  /** The rope caught a wrestler who was about to step out on their own. */
  | { type: 'teeter'; p: PlayerIndex; x: number; y: number; left: number }
  | { type: 'pound'; p: PlayerIndex; x: number; y: number }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'win'; p: PlayerIndex | null };

/** What a player does this step: is the big button held, and fire the power? */
export type Intent = { hold: boolean; power: boolean };

export class Sumo {
  score: [number, number] = [0, 0];
  wrestlers: [Wrestler, Wrestler];
  energy: [Energy, Energy];
  phase: Phase = 'ready';
  phaseT = RULES.readyTime;
  round = 1;
  roundT = 0;
  winner: PlayerIndex | null = null;
  /** True once the match is decided (winner may be null for a capped draw). */
  finished = false;
  lastRoundWinner: PlayerIndex | null = null;
  events: Event[] = [];
  t = 0;
  private lastBump = -1;
  private shrinkAnnounced = false;

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    readonly powersOn: boolean,
    private readonly rng: Rng,
  ) {
    const mk = (p: PlayerIndex): Wrestler => ({
      x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 1, charging: false, charge: 0, cooldown: 0,
      baseMass: lerpAssist(players[p].assist, RULES.mass, RULES.massMax),
      margin: lerpAssist(players[p].assist, 0, RULES.marginMax),
      grow: 0, slip: 0, pound: 0, out: false, freeT: 99, saves: 0,
    });
    this.wrestlers = [mk(0), mk(1)];
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    this.resetRound();
  }

  radius(p: PlayerIndex): number {
    return this.wrestlers[p].grow > 0 ? RULES.bodyR * RULES.growScale : RULES.bodyR;
  }

  mass(p: PlayerIndex): number {
    const w = this.wrestlers[p];
    return w.grow > 0 ? w.baseMass * RULES.growMass : w.baseMass;
  }

  /** Current ring radius (shrinks late in a long round). */
  ringR(): number {
    const k = clamp((this.roundT - RULES.shrinkAfter) / RULES.shrinkTime, 0, 1);
    return RULES.ringR * (1 - (1 - RULES.ringMinFrac) * k);
  }

  /** How far a wrestler's centre may go from the ring centre before they are out. */
  outR(p: PlayerIndex): number {
    return this.ringR() + this.wrestlers[p].margin;
  }

  friction(p: PlayerIndex): number {
    return this.wrestlers[p].slip > 0 ? RULES.slipFriction : RULES.friction;
  }

  /** Dash speed for a charge in 0..1. */
  static dashSpeed(charge: number): number {
    return RULES.dashMin + (RULES.dashMax - RULES.dashMin) * clamp(charge, 0, 1);
  }

  private resetRound(): void {
    const off = 72;
    const pos = [RULES.cy + off, RULES.cy - off];
    for (const p of [0, 1] as PlayerIndex[]) {
      const w = this.wrestlers[p];
      w.x = RULES.cx;
      w.y = pos[p];
      w.vx = w.vy = 0;
      // Start facing roughly sideways, so nobody gets a free first shot.
      w.angle = this.rng.range(0, Math.PI * 2);
      w.spin = p === 0 ? 1 : -1;
      w.charging = false;
      w.charge = 0;
      w.cooldown = 0;
      w.grow = w.slip = w.pound = 0;
      w.out = false;
      w.freeT = 99;
      w.saves = Math.round(lerpAssist(this.players[p].assist, RULES.ropeSaves, RULES.ropeSavesMax));
    }
    this.roundT = 0;
    this.shrinkAnnounced = false;
    this.phase = 'ready';
    this.phaseT = RULES.readyTime;
  }

  step(dt: number, intents: [Intent, Intent]): void {
    this.events = [];
    if (this.finished) return;
    this.t += dt;
    if (this.phase === 'ready') {
      // Wrestlers already turn during "ready", so players can read the spin.
      for (const w of this.wrestlers) w.angle += w.spin * RULES.turnSpeed * dt;
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'fight';
        this.events.push({ type: 'fight', round: this.round });
      }
      return;
    }
    if (this.phase === 'over') {
      this.integrate(dt);
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.nextRound();
      return;
    }
    this.roundT += dt;
    if (!this.shrinkAnnounced && this.roundT >= RULES.shrinkAfter) {
      this.shrinkAnnounced = true;
      this.events.push({ type: 'shrink' });
    }
    for (const p of [0, 1] as PlayerIndex[]) {
      const w = this.wrestlers[p];
      const e = this.energy[p];
      e.tick(dt);
      if (this.powersOn && this.players[p].power) e.charge(RULES.energyPerSec * dt, this.score[p] < this.score[other(p)]);
      w.grow = Math.max(0, w.grow - dt);
      w.slip = Math.max(0, w.slip - dt);
      w.cooldown = Math.max(0, w.cooldown - dt);
      w.freeT += dt;
      if (w.pound > 0) {
        w.pound -= dt;
        if (w.pound <= 0) this.groundPound(p);
      }
      if (this.powersOn && intents[p].power) this.firePower(p);
      this.control(p, intents[p], dt);
    }
    this.integrate(dt);
    this.checkOut();
  }

  private control(p: PlayerIndex, intent: Intent, dt: number): void {
    const w = this.wrestlers[p];
    if (intent.hold && w.cooldown <= 0) {
      if (!w.charging) {
        w.charging = true;
        w.charge = 0;
      }
      w.charge = Math.min(1, w.charge + dt / RULES.chargeTime);
    } else if (w.charging) {
      // Let go: dash in the facing direction.
      const sp = Sumo.dashSpeed(w.charge);
      w.vx += Math.cos(w.angle) * sp;
      w.vy += Math.sin(w.angle) * sp;
      capSpeed(w);
      this.events.push({ type: 'dash', p, x: w.x, y: w.y, power: w.charge });
      w.charging = false;
      w.charge = 0;
      w.cooldown = RULES.dashCooldown;
    }
    if (!w.charging) w.angle += w.spin * RULES.turnSpeed * dt;
  }

  private integrate(dt: number): void {
    const sub = 4;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      for (const w of this.wrestlers) {
        w.x += w.vx * h;
        w.y += w.vy * h;
      }
      this.collide();
      if (this.phase === 'fight') this.rope();
    }
    for (const p of [0, 1] as PlayerIndex[]) {
      const w = this.wrestlers[p];
      const k = Math.exp(-this.friction(p) * dt);
      w.vx *= k;
      w.vy *= k;
    }
  }

  private collide(): void {
    const [a, b] = this.wrestlers;
    if (a.out || b.out) return;
    const R = this.radius(0) + this.radius(1);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d >= R || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const ma = this.mass(0);
    const mb = this.mass(1);
    // Push apart, weighted by mass.
    const overlap = R - d;
    a.x -= nx * overlap * (mb / (ma + mb));
    a.y -= ny * overlap * (mb / (ma + mb));
    b.x += nx * overlap * (ma / (ma + mb));
    b.y += ny * overlap * (ma / (ma + mb));
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    a.freeT = b.freeT = 0;
    if (vn >= 0) return;
    const j = (-(1 + RULES.restitution) * vn) / (1 / ma + 1 / mb);
    a.vx -= (j / ma) * nx;
    a.vy -= (j / ma) * ny;
    b.vx += (j / mb) * nx;
    b.vy += (j / mb) * ny;
    capSpeed(a);
    capSpeed(b);
    const strength = -vn;
    if (strength > 60 && this.t - this.lastBump > 0.12) {
      this.lastBump = this.t;
      this.events.push({ type: 'bump', x: a.x + nx * this.radius(0), y: a.y + ny * this.radius(0), strength, nx, ny });
      if (this.phase === 'fight' && this.powersOn) {
        // Both get energy from contact; the one who was hit gets a bit more.
        const aHit = Math.hypot(a.vx, a.vy) > Math.hypot(b.vx, b.vy) ? 0 : 1;
        for (const p of [0, 1] as PlayerIndex[]) {
          const amt = RULES.energyHit * Math.min(1, strength / 500) * (p === aHit ? 1.4 : 0.8);
          this.energy[p].charge(amt, this.score[p] < this.score[other(p)]);
        }
      }
    }
  }

  /** True when the rope would stop this wrestler instead of letting them out. */
  ropeCatches(p: PlayerIndex): boolean {
    const w = this.wrestlers[p];
    return w.saves > 0 && w.freeT >= RULES.ropeGrace && w.slip <= 0;
  }

  /** Stop a wrestler at the rope if nobody pushed them there. */
  private rope(): void {
    for (const p of [0, 1] as PlayerIndex[]) {
      const w = this.wrestlers[p];
      if (w.out || !this.ropeCatches(p)) continue;
      const dx = w.x - RULES.cx;
      const dy = w.y - RULES.cy;
      const d = Math.hypot(dx, dy);
      const lim = this.outR(p) - 0.5;
      if (d <= lim || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      w.x = RULES.cx + nx * lim;
      w.y = RULES.cy + ny * lim;
      // Bounce back in, at least a little, so the save is visible and you are clear of the rope.
      const vr = Math.max(w.vx * nx + w.vy * ny, 60);
      w.vx -= nx * vr * (1 + RULES.ropeBounce);
      w.vy -= ny * vr * (1 + RULES.ropeBounce);
      w.charging = false;
      w.charge = 0;
      w.saves--;
      this.events.push({ type: 'teeter', p, x: w.x, y: w.y, left: w.saves });
    }
  }

  private checkOut(): void {
    const excess = ([0, 1] as PlayerIndex[]).map((p) => {
      const w = this.wrestlers[p];
      return Math.hypot(w.x - RULES.cx, w.y - RULES.cy) - this.outR(p);
    });
    const out0 = excess[0] > 0;
    const out1 = excess[1] > 0;
    if (!out0 && !out1) return;
    let loser: PlayerIndex | null;
    if (out0 && out1) loser = excess[0] > excess[1] ? 0 : excess[1] > excess[0] ? 1 : null;
    else loser = out0 ? 0 : 1;
    if (loser === null) {
      for (const p of [0, 1] as PlayerIndex[]) this.wrestlers[p].out = true;
    } else this.wrestlers[loser].out = true;
    for (const p of [0, 1] as PlayerIndex[]) {
      const w = this.wrestlers[p];
      w.charging = false;
      w.charge = 0;
      if (w.out) this.events.push({ type: 'out', p, x: w.x, y: w.y });
    }
    const winner = loser === null ? null : other(loser);
    this.lastRoundWinner = winner;
    if (winner !== null) {
      this.score[winner]++;
      if (this.powersOn) this.energy[other(winner)].charge(RULES.energyLoseRound, true);
    }
    this.events.push({ type: 'round', winner, round: this.round });
    this.phase = 'over';
    this.phaseT = RULES.overTime;
  }

  private nextRound(): void {
    const top = Math.max(...this.score);
    if (top >= RULES.roundsToWin || this.round >= RULES.maxRounds) {
      this.finished = true;
      this.phase = 'done';
      this.winner = this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : null;
      this.events.push({ type: 'win', p: this.winner });
      return;
    }
    this.round++;
    this.resetRound();
  }

  private firePower(p: PlayerIndex): void {
    const power = this.players[p].power;
    if (!power || this.phase !== 'fight' || !this.energy[p].spend(power.duration ?? 0)) return;
    const w = this.wrestlers[p];
    const foe = this.wrestlers[other(p)];
    if (power.id === 'pound') {
      w.pound = RULES.poundWindup;
    } else if (power.id === 'grow') {
      w.grow = power.duration ?? 3;
    } else if (power.id === 'slip') {
      foe.slip = power.duration ?? 3.5;
    }
    this.events.push({ type: 'power', p, id: power.id });
  }

  /** The shockwave: pushes the other wrestler straight away from you, weaker with distance. */
  private groundPound(p: PlayerIndex): void {
    const w = this.wrestlers[p];
    const q = other(p);
    const foe = this.wrestlers[q];
    w.pound = 0;
    this.events.push({ type: 'pound', p, x: w.x, y: w.y });
    foe.freeT = 0;
    const dx = foe.x - w.x;
    const dy = foe.y - w.y;
    const d = Math.hypot(dx, dy) || 1;
    const fall = clamp(1 - d / RULES.poundRange, 0.3, 1);
    const sp = (RULES.poundPush * fall) / this.mass(q);
    foe.vx += (dx / d) * sp;
    foe.vy += (dy / d) * sp;
    foe.charging = false;
    foe.charge = 0;
    capSpeed(foe);
  }
}

function capSpeed(w: Wrestler): void {
  const sp = Math.hypot(w.vx, w.vy);
  if (sp > RULES.maxSpeed) {
    w.vx *= RULES.maxSpeed / sp;
    w.vy *= RULES.maxSpeed / sp;
  }
}

/** Smallest signed difference between two angles, in -PI..PI. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------- Honest bot ----------
// The bot holds the same single button. It watches its own arrow sweep round
// and presses when the arrow is about to line up with where it wants to go.
// Skill changes only reaction delay (presses land late), aim noise and how well
// it allows for its own delay; never physics.
const BOT = {
  easy: { react: 0.38, anticip: 0.25, noise: 0.42, care: 0.3 },
  normal: { react: 0.22, anticip: 0.7, noise: 0.2, care: 0.75 },
  hard: { react: 0.12, anticip: 1.0, noise: 0.07, care: 1 },
} satisfies Record<BotLevel, { react: number; anticip: number; noise: number; care: number }>;

export class SumoBot {
  /** Press scheduled to land after the reaction delay. */
  private pressIn = -1;
  private holdFor = 0;
  private held = 0;
  private holding = false;
  private jitter = 0;
  private aimTarget: 'foe' | 'center' = 'foe';

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  think(game: Sumo, dt: number): Intent {
    const cfg = BOT[this.level];
    const me = game.wrestlers[this.p];
    const foe = game.wrestlers[other(this.p)];
    const power = game.powersOn && game.energy[this.p].ready && this.wantsPower(game);
    if (game.phase !== 'fight') {
      this.pressIn = -1;
      this.holding = false;
      return { hold: false, power: false };
    }
    if (this.holding) {
      this.held += dt;
      if (this.held >= this.holdFor || !me.charging && this.held > 0.1) {
        this.holding = false;
        return { hold: false, power };
      }
      return { hold: true, power };
    }
    if (this.pressIn >= 0) {
      this.pressIn -= dt;
      if (this.pressIn <= 0) {
        this.pressIn = -1;
        this.holding = true;
        this.held = 0;
        return { hold: true, power };
      }
      return { hold: false, power };
    }
    if (me.cooldown > 0) return { hold: false, power };
    // Decide what to aim at: the foe, or back to the middle when we are near the edge.
    const ring = game.ringR();
    const myD = Math.hypot(me.x - RULES.cx, me.y - RULES.cy);
    const nearEdge = myD > ring * 0.62;
    const toFoe = Math.atan2(foe.y - me.y, foe.x - me.x);
    const toCenter = Math.atan2(RULES.cy - me.y, RULES.cx - me.x);
    const foeD = Math.hypot(foe.x - me.x, foe.y - me.y);
    // The foe being roughly toward the middle means a dash at them is safe.
    const foeTowardCenter = Math.abs(angleDiff(toFoe, toCenter)) < 0.9;
    this.aimTarget = nearEdge && !foeTowardCenter && this.rng.next() < cfg.care ? 'center' : 'foe';
    const target = this.aimTarget === 'foe' ? toFoe : toCenter;
    // Where will the arrow be when the press lands? A good bot allows for its delay.
    const lead = me.spin * RULES.turnSpeed * cfg.react * cfg.anticip;
    const future = me.angle + lead;
    const err = angleDiff(target + this.jitter, future);
    // Only fire when the target is just ahead of the sweeping arrow.
    const ahead = err * me.spin;
    if (ahead > 0 && ahead < RULES.turnSpeed * dt * 1.5 + 0.02) {
      this.pressIn = cfg.react;
      this.jitter = this.rng.range(-cfg.noise, cfg.noise);
      if (this.aimTarget === 'center') {
        this.holdFor = clamp((myD / ring) * 0.5, 0.1, 0.45) * RULES.chargeTime;
      } else {
        // Charge harder for long shots; a careful bot will not charge itself off the ring.
        const want = clamp(foeD / 260 + 0.45, 0.4, 1);
        let charge = want + this.rng.range(-0.15, 0.15);
        if (this.rng.next() < cfg.care) {
          // Distance this dash would carry us if we miss: speed / friction.
          const travel = Sumo.dashSpeed(charge) / RULES.friction;
          const ex = me.x + Math.cos(target) * travel;
          const ey = me.y + Math.sin(target) * travel;
          const miss = Math.hypot(ex - RULES.cx, ey - RULES.cy) > ring + 10 && foeD > 120;
          if (miss) charge = Math.min(charge, 0.35);
        }
        this.holdFor = clamp(charge, 0.05, 1) * RULES.chargeTime;
      }
    }
    return { hold: false, power };
  }

  private wantsPower(game: Sumo): boolean {
    const id = game.players[this.p].power?.id;
    const me = game.wrestlers[this.p];
    const foe = game.wrestlers[other(this.p)];
    const foeD = Math.hypot(foe.x - RULES.cx, foe.y - RULES.cy);
    const gap = Math.hypot(foe.x - me.x, foe.y - me.y);
    // Pound when they are close and further out than us, so the push sends them toward the rope.
    if (id === 'pound') return gap < 120 && foeD > Math.hypot(me.x - RULES.cx, me.y - RULES.cy);
    if (id === 'grow') return gap < 140;
    if (id === 'slip') return foeD > game.ringR() * 0.4;
    return false;
  }
}
