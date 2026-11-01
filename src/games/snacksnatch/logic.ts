// Snack Snatch rules: pure and deterministic, so tests can run whole matches.
// A snack pot in the middle shoots snacks around a picnic blanket. Each player
// has two round frog-like critters at their edge; a tap snaps one critter's
// head forward and it gulps any snack it touches. Golden snacks are worth 3.
// The last 10 seconds are a Frenzy: snacks pour out and move much faster.
// Most points after 30 seconds wins; a tie goes to a "sudden snack".
// Fairness: the pot always shoots mirrored pairs, one identical snack at each
// player (same angle, speed and gold), so both get exactly the same supply.
import { Energy } from '../../core/energy';
import { lerpAssist } from '../../core/handicap';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';
import { clamp, MID, W } from '../../engine/world';

export const RULES = {
  matchTime: 30,
  /** Sudden snack: one golden snack at each player, first gulp wins; after this long it's a draw. */
  suddenTime: 12,
  /** Field edges: the side walls and each player's "gum line" the snacks bounce off. */
  wall: 12,
  gum: [490, 150] as [number, number],
  critterX: [95, 265] as [number, number],
  /** Head resting centre, measured from the gum line toward the player's edge. */
  restBack: 30,
  headR: 24,
  reach: 92,
  /** Reach at assist 3. */
  reachMax: 140,
  extendT: 0.12,
  holdT: 0.05,
  retractT: 0.16,
  cooldown: 0.4,
  /** A snap that catches nothing leaves the critter dizzy for longer, so spamming doesn't pay. */
  missCooldown: 1.0,
  /** Miss cooldown at assist 3: an assisted player recovers from a miss much sooner. */
  missCooldownMin: 0.45,
  snackR: 10,
  goldR: 11,
  goldChance: 0.14,
  goldValue: 3,
  potR: 24,
  maxSnacks: 10,
  /** Seconds between mirrored pairs. */
  spawnMin: 1.0,
  spawnMax: 1.7,
  /** Frenzy: the last third of the match. Pairs come faster, snacks fly faster, more fit on the blanket. */
  frenzyAt: 20,
  frenzySpawn: 0.4,
  frenzySpeed: 1.5,
  frenzyMaxSnacks: 14,
  speedMin: 200,
  speedMax: 300,
  minRoll: 120,
  maxRoll: 400,
  friction: 0.15,
  magnetPull: 110,
  stickyRange: 175,
  stickyDamp: 4,
  stickyRoll: 35,
  doubleSnaps: 3,
  doubleScale: 2,
  energyPerSec: 0.05,
  energyPerPoint: 0.05,
};

export type Snack = { id: number; x: number; y: number; vx: number; vy: number; gold: boolean; r: number; alive: boolean; kind: number };

export type Critter = {
  p: PlayerIndex;
  i: 0 | 1;
  x: number;
  restY: number;
  /** Time since the current snap started; < 0 when idle. */
  snapT: number;
  cooldown: number;
  /** Reach of the snap in progress. */
  snapReach: number;
  /** Snacks eaten during this snap (for the "combo" pop-up). */
  gulps: number;
  /** The last snap missed: the critter is dizzy until its cooldown ends. */
  dizzy: boolean;
};

export type Event =
  | { type: 'snap'; p: PlayerIndex; i: 0 | 1; double: boolean }
  | { type: 'miss'; p: PlayerIndex; i: 0 | 1 }
  | { type: 'grab'; p: PlayerIndex; i: 0 | 1; x: number; y: number; value: number; gold: boolean; combo: number }
  | { type: 'spawn'; x: number; y: number; gold: boolean }
  | { type: 'bounce'; x: number; y: number }
  | { type: 'tick'; sec: number }
  | { type: 'sudden' }
  | { type: 'frenzy' }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'win'; p: PlayerIndex | null };

/** One frame of a player's input: which critters snap this frame, and fire the power. */
export type Intent = { snap: [boolean, boolean]; power: boolean };

/** Direction toward the field from player p's edge: player 0 snaps up (-y). */
export const fwd = (p: PlayerIndex) => (p === 0 ? -1 : 1);

export class SnackSnatch {
  score: [number, number] = [0, 0];
  snacks: Snack[] = [];
  critters: [[Critter, Critter], [Critter, Critter]];
  energy: [Energy, Energy];
  reach: [number, number];
  /** Each player's miss cooldown (shorter with assist). */
  missCooldown: [number, number];
  /** Remaining "Double Grab" snaps. */
  doubleLeft: [number, number] = [0, 0];
  /** Seconds left in regulation, then in sudden snack. */
  timeLeft = RULES.matchTime;
  sudden = false;
  /** The last third of regulation: faster pairs, faster snacks. */
  frenzy = false;
  winner: PlayerIndex | null = null;
  finished = false;
  events: Event[] = [];
  t = 0;
  private spawnIn = 0.3;
  private nextId = 1;
  private lastSec = Math.ceil(RULES.matchTime);
  /** The opening volley: this many quick pairs. */
  private opening = 2;

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    readonly powersOn: boolean,
    private readonly rng: Rng,
  ) {
    const mk = (p: PlayerIndex, i: 0 | 1): Critter => ({
      p,
      i,
      x: RULES.critterX[i],
      restY: RULES.gum[p] - fwd(p) * RULES.restBack,
      snapT: -1,
      cooldown: 0,
      snapReach: 0,
      gulps: 0,
      dizzy: false,
    });
    this.critters = [
      [mk(0, 0), mk(0, 1)],
      [mk(1, 0), mk(1, 1)],
    ];
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    this.reach = [lerpAssist(players[0].assist, RULES.reach, RULES.reachMax), lerpAssist(players[1].assist, RULES.reach, RULES.reachMax)];
    this.missCooldown = [
      lerpAssist(players[0].assist, RULES.missCooldown, RULES.missCooldownMin),
      lerpAssist(players[1].assist, RULES.missCooldown, RULES.missCooldownMin),
    ];
  }

  /** How far forward of its rest point a critter's head is right now. */
  extension(c: Critter): number {
    if (c.snapT < 0) return 0;
    const { extendT, holdT, retractT } = RULES;
    if (c.snapT < extendT) return c.snapReach * easeOut(c.snapT / extendT);
    if (c.snapT < extendT + holdT) return c.snapReach;
    const k = (c.snapT - extendT - holdT) / retractT;
    return c.snapReach * (1 - clamp(k, 0, 1));
  }

  headY(c: Critter): number {
    return c.restY + fwd(c.p) * this.extension(c);
  }

  /** The head can gulp while it is going out and at full stretch. */
  biting(c: Critter): boolean {
    return c.snapT >= 0 && c.snapT < RULES.extendT + RULES.holdT;
  }

  /** Reach the next snap of player p would have. */
  nextReach(p: PlayerIndex): number {
    return this.reach[p] * (this.doubleLeft[p] > 0 ? RULES.doubleScale : 1);
  }

  magnetOn(p: PlayerIndex): boolean {
    return this.players[p].power?.id === 'magnet' && this.energy[p].active > 0;
  }

  stickyOn(p: PlayerIndex): boolean {
    return this.players[p].power?.id === 'sticky' && this.energy[p].active > 0;
  }

  step(dt: number, intents: [Intent, Intent]): void {
    this.events = [];
    if (this.finished) return;
    this.t += dt;
    for (const p of [0, 1] as PlayerIndex[]) {
      const e = this.energy[p];
      e.tick(dt);
      if (this.powersOn && this.players[p].power) e.charge(RULES.energyPerSec * dt, this.score[p] < this.score[other(p)]);
      if (this.powersOn && intents[p].power) this.firePower(p);
      for (const c of this.critters[p]) {
        c.cooldown = Math.max(0, c.cooldown - dt);
        if (c.cooldown === 0) c.dizzy = false;
        if (intents[p].snap[c.i]) this.snap(c);
      }
    }
    this.spawn(dt);
    const sub = 3;
    for (let s = 0; s < sub; s++) {
      for (const p of [0, 1] as PlayerIndex[]) for (const c of this.critters[p]) this.advanceSnap(c, dt / sub);
      for (const sn of this.snacks) this.moveSnack(sn, dt / sub);
      const before = this.score[0] + this.score[1];
      for (const p of [0, 1] as PlayerIndex[]) for (const c of this.critters[p]) this.gulp(c);
      this.snacks = this.snacks.filter((s) => s.alive);
      if (this.sudden && this.score[0] + this.score[1] > before) this.settleSudden();
      if (this.finished) return;
    }
    for (const sn of this.snacks) this.dampSnack(sn, dt);
    this.clock(dt);
  }

  private snap(c: Critter): void {
    if (c.cooldown > 0) return;
    const double = this.doubleLeft[c.p] > 0;
    c.snapReach = this.nextReach(c.p);
    if (double) this.doubleLeft[c.p]--;
    c.snapT = 0;
    c.gulps = 0;
    c.cooldown = RULES.cooldown;
    this.events.push({ type: 'snap', p: c.p, i: c.i, double });
  }

  private advanceSnap(c: Critter, h: number): void {
    if (c.snapT < 0) return;
    const wasBiting = this.biting(c);
    c.snapT += h;
    if (wasBiting && !this.biting(c) && c.gulps === 0) {
      c.cooldown = Math.max(c.cooldown, this.missCooldown[c.p] - RULES.extendT - RULES.holdT);
      c.dizzy = true;
      this.events.push({ type: 'miss', p: c.p, i: c.i });
    }
    if (c.snapT > RULES.extendT + RULES.holdT + RULES.retractT) c.snapT = -1;
  }

  private gulp(c: Critter): void {
    if (!this.biting(c)) return;
    const hy = this.headY(c);
    for (const sn of this.snacks) {
      if (!sn.alive) continue;
      if (Math.hypot(sn.x - c.x, sn.y - hy) > RULES.headR + sn.r) continue;
      sn.alive = false;
      c.gulps++;
      const value = sn.gold ? RULES.goldValue : 1;
      this.score[c.p] += value;
      this.events.push({ type: 'grab', p: c.p, i: c.i, x: sn.x, y: sn.y, value, gold: sn.gold, combo: c.gulps });
      if (this.powersOn) this.energy[c.p].charge(RULES.energyPerPoint * value, this.score[c.p] < this.score[other(c.p)]);
    }
  }

  private spawn(dt: number): void {
    if (this.sudden) return;
    this.spawnIn -= dt;
    if (!this.frenzy && RULES.matchTime - this.timeLeft >= RULES.frenzyAt) {
      this.frenzy = true;
      this.spawnIn = 0;
      this.events.push({ type: 'frenzy' });
    }
    const frenzy = this.frenzy;
    if (this.spawnIn > 0 || this.snacks.length + 2 > (frenzy ? RULES.frenzyMaxSnacks : RULES.maxSnacks)) return;
    if (this.opening > 0) {
      this.opening--;
      this.spawnIn = 0.25;
    } else {
      this.spawnIn = this.rng.range(RULES.spawnMin, RULES.spawnMax) * (frenzy ? RULES.frenzySpawn : 1);
    }
    this.launchPair(this.rng.chance(RULES.goldChance) || (frenzy && this.rng.chance(0.15)), frenzy ? this.rng.range(RULES.speedMin, RULES.speedMax) * RULES.frenzySpeed : undefined);
  }

  /**
   * Shoot two snacks out of the pot at once, mirror images across the halfway line: one at
   * each player, with the same angle, speed and gold. Neither player can be dealt a better
   * supply. Angles avoid straight sideways so snacks reach the critters.
   */
  private launchPair(gold: boolean, speed?: number): void {
    const a = Math.PI / 2 + this.rng.range(-1.05, 1.05);
    const sp = speed ?? this.rng.range(RULES.speedMin, RULES.speedMax);
    const kind = this.rng.int(0, 3);
    for (const toward of [1, -1]) this.launch(gold, sp, Math.cos(a), Math.sin(a) * toward, kind);
  }

  private launch(gold: boolean, sp: number, dirX: number, dirY: number, kind: number): Snack {
    const r = gold ? RULES.goldR : RULES.snackR;
    const sn: Snack = {
      id: this.nextId++,
      x: W / 2 + dirX * (RULES.potR + r + 1),
      y: MID + dirY * (RULES.potR + r + 1),
      vx: dirX * sp,
      vy: dirY * sp,
      gold,
      r,
      alive: true,
      kind,
    };
    this.snacks.push(sn);
    this.events.push({ type: 'spawn', x: sn.x, y: sn.y, gold });
    return sn;
  }

  private moveSnack(sn: Snack, h: number): void {
    // Powers pull snacks before they move.
    for (const p of [0, 1] as PlayerIndex[]) {
      if (!this.magnetOn(p)) continue;
      // Pull toward the nearer of p's two critter heads.
      let best: Critter = this.critters[p][0];
      let bd = Infinity;
      for (const c of this.critters[p]) {
        const d = Math.hypot(sn.x - c.x, sn.y - c.restY);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      const dx = best.x - sn.x;
      const dy = best.restY - sn.y;
      const d = Math.hypot(dx, dy) || 1;
      sn.vx += (dx / d) * RULES.magnetPull * h;
      sn.vy += (dy / d) * RULES.magnetPull * h;
    }
    sn.x += sn.vx * h;
    sn.y += sn.vy * h;
    const r = sn.r;
    let bounced = false;
    if (sn.x < RULES.wall + r) {
      sn.x = RULES.wall + r;
      sn.vx = Math.abs(sn.vx);
      bounced = true;
    } else if (sn.x > W - RULES.wall - r) {
      sn.x = W - RULES.wall - r;
      sn.vx = -Math.abs(sn.vx);
      bounced = true;
    }
    const top = RULES.gum[1] + r;
    const bottom = RULES.gum[0] - r;
    if (sn.y < top) {
      sn.y = top;
      sn.vy = Math.abs(sn.vy);
      bounced = true;
    } else if (sn.y > bottom) {
      sn.y = bottom;
      sn.vy = -Math.abs(sn.vy);
      bounced = true;
    }
    // Bounce off the snack pot in the middle.
    const dx = sn.x - W / 2;
    const dy = sn.y - MID;
    const d = Math.hypot(dx, dy);
    const R = RULES.potR + r;
    if (d < R && d > 0) {
      const nx = dx / d;
      const ny = dy / d;
      sn.x = W / 2 + nx * R;
      sn.y = MID + ny * R;
      const vn = sn.vx * nx + sn.vy * ny;
      if (vn < 0) {
        sn.vx -= 2 * vn * nx;
        sn.vy -= 2 * vn * ny;
        bounced = true;
      }
    }
    if (bounced) this.events.push({ type: 'bounce', x: sn.x, y: sn.y });
  }

  private dampSnack(sn: Snack, dt: number): void {
    const k = Math.exp(-RULES.friction * dt);
    sn.vx *= k;
    sn.vy *= k;
    let sticky = false;
    for (const p of [0, 1] as PlayerIndex[]) {
      if (!this.stickyOn(p) || Math.abs(sn.y - RULES.gum[p]) >= RULES.stickyRange) continue;
      // Honey: snacks near you slow right down, and barely move away from you.
      sticky = true;
      const h = Math.exp(-RULES.stickyDamp * dt);
      sn.vx *= h;
      const towardMe = -fwd(p); // +y for the bottom player
      if (sn.vy * towardMe < 0) sn.vy *= Math.exp(-RULES.stickyDamp * 2.5 * dt);
      else sn.vy *= h;
    }
    const sp = Math.hypot(sn.vx, sn.vy);
    // Snacks keep rolling (slowly in honey), and never get too fast.
    const fast = this.frenzy && !this.sudden ? RULES.frenzySpeed : 1;
    const min = sticky ? RULES.stickyRoll : RULES.minRoll * fast;
    const max = RULES.maxRoll * fast;
    if (sp < min) {
      if (sp < 1e-6) {
        sn.vx = min;
      } else {
        sn.vx *= min / sp;
        sn.vy *= min / sp;
      }
    } else if (sp > max) {
      sn.vx *= max / sp;
      sn.vy *= max / sp;
    }
  }

  private clock(dt: number): void {
    this.timeLeft -= dt;
    const sec = Math.ceil(this.timeLeft);
    if (!this.sudden && sec !== this.lastSec && sec <= 5 && sec > 0) this.events.push({ type: 'tick', sec });
    this.lastSec = sec;
    if (this.timeLeft > 0) return;
    if (this.sudden) {
      this.finish(null);
      return;
    }
    if (this.score[0] !== this.score[1]) {
      this.finish(this.score[0] > this.score[1] ? 0 : 1);
      return;
    }
    // Tie: clear the blanket and shoot a golden snack at each player. First to gulp one wins.
    this.sudden = true;
    this.timeLeft = RULES.suddenTime;
    this.snacks = [];
    this.events.push({ type: 'sudden' });
    this.launchPair(true, 170);
  }

  /** Someone gulped during the sudden snack: the leader wins; a same-instant double gulp goes again. */
  private settleSudden(): void {
    if (this.score[0] !== this.score[1]) {
      this.finish(this.score[0] > this.score[1] ? 0 : 1);
      return;
    }
    this.snacks = [];
    this.launchPair(true, 170);
  }

  private finish(winner: PlayerIndex | null): void {
    this.finished = true;
    this.winner = winner;
    this.events.push({ type: 'win', p: winner });
  }

  private firePower(p: PlayerIndex): void {
    const power = this.players[p].power;
    if (!power || !this.energy[p].spend(power.duration ?? 0)) return;
    if (power.id === 'double') this.doubleLeft[p] = RULES.doubleSnaps;
    this.events.push({ type: 'power', p, id: power.id });
  }
}

function easeOut(k: number): number {
  const x = clamp(k, 0, 1);
  return 1 - (1 - x) * (1 - x);
}

// ---------- Honest bot ----------
// The bot taps the same buttons. It sees a snack, guesses where it will be,
// and taps after its reaction delay. Skill changes only the delay, how well it
// allows for that delay, timing noise and stray taps; never the rules.
const BOT = {
  easy: { react: 0.42, anticip: 0, noise: 0.2, stray: 0.6, slack: 0 },
  normal: { react: 0.24, anticip: 0.6, noise: 0.08, stray: 0.15, slack: -6 },
  hard: { react: 0.13, anticip: 0.5, noise: 0.02, stray: 0, slack: -4 },
} satisfies Record<BotLevel, { react: number; anticip: number; noise: number; stray: number; slack: number }>;

export class SnackSnatchBot {
  private pending: [number, number] = [-1, -1];

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  think(game: SnackSnatch, dt: number): Intent {
    const cfg = BOT[this.level];
    const snap: [boolean, boolean] = [false, false];
    const reach = game.nextReach(this.p);
    for (const c of game.critters[this.p]) {
      if (this.pending[c.i] >= 0) {
        this.pending[c.i] -= dt;
        if (this.pending[c.i] <= 0) {
          this.pending[c.i] = -1;
          snap[c.i] = true;
        }
        continue;
      }
      if (c.cooldown > cfg.react) continue;
      // When will the head be out? After our reaction delay plus most of the extend.
      const lookAhead = cfg.react * cfg.anticip + RULES.extendT * 0.8 + this.rng.range(-cfg.noise, cfg.noise);
      const hit = game.snacks.some((s) => {
        const x = s.x + s.vx * lookAhead;
        const y = s.y + s.vy * lookAhead;
        // Distance from the snap path (a vertical segment in front of the critter).
        const y0 = c.restY;
        const y1 = c.restY + fwd(this.p) * reach;
        const cy = clamp(y, Math.min(y0, y1), Math.max(y0, y1));
        return Math.hypot(x - c.x, y - cy) < RULES.headR + s.r + cfg.slack;
      });
      if (hit || this.rng.next() < cfg.stray * dt) this.pending[c.i] = cfg.react;
    }
    const power = game.powersOn && game.energy[this.p].ready && this.wantsPower(game);
    return { snap, power };
  }

  private wantsPower(game: SnackSnatch): boolean {
    const id = game.players[this.p].power?.id;
    const near = game.snacks.filter((s) => Math.abs(s.y - RULES.gum[this.p]) < RULES.stickyRange).length;
    if (id === 'magnet') return game.snacks.length >= 3;
    if (id === 'sticky') return near >= 2;
    if (id === 'double') return game.snacks.length >= 3;
    return false;
  }
}

