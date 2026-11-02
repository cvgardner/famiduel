// Tank Duel rules: pure and deterministic, so tests can run whole matches.
// Two toy tanks in a small block maze. Shells bounce off blocks and can bonk
// their own tank. Every bonk restarts the round in a fresh arena; knock out
// the other tank's armor (5 hits, more with handicap help) to win.
import { HUMAN } from '../../core/human';
import { Energy } from '../../core/energy';
import { lerpAssist } from '../../core/handicap';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other, PLAYERS } from '../../core/types';
import { clamp } from '../../engine/world';
import { buildGrid, COLS, LAYOUTS, ROWS } from './mazes';

export const CELL = 34;
/** Arena rectangle in world units: the middle of the screen, between the two control strips. */
export const ARENA = { x: 10, y: 116, w: COLS * CELL, h: ROWS * CELL };

export const RULES = {
  armor: 5,
  /** Armor at assist 3: the helped player can take this many bonks. */
  armorMax: 8,
  tankR: 12,
  speed: 92,
  turnRate: 6.5,
  /** Stick deflection below this does nothing; between this and driveFrom the tank turns on the spot. */
  dead: 0.15,
  driveFrom: 0.32,
  shellR: 5,
  shellSpeed: 200,
  bounces: 2,
  bouncyBounces: 5,
  shellLife: 7,
  maxShells: 3,
  reload: 0.5,
  /**
   * A FIRE tap this close to the end of a reload (or while all shells are out)
   * is kept and fires the moment the gun is ready, so a person tapping fast
   * gets the full fire rate instead of losing taps to the reload ring.
   */
  fireBuffer: 0.15,
  /** A tank's own shell can bonk it once this old (or after its first bounce). */
  selfArm: 0.12,
  mineR: 9,
  mineArm: 1,
  blastR: 36,
  readyTime: 1.0,
  bonkTime: 1.5,
  /** Play seconds before time-up (most armor left wins); then sudden death, then a draw. */
  timeCap: 150,
  suddenCap: 60,
  energyPerSec: 0.04,
  energyHit: 0.15,
  energyConcede: 0.3,
};

export type Tank = {
  x: number;
  y: number;
  /** Facing, radians (0 = +x, world coordinates). */
  a: number;
  hits: number;
  armor: number;
  reload: number;
  shield: number;
  bouncy: number;
  /** Seconds since last shot, for the recoil animation. */
  fired: number;
  /** Seconds left on a buffered FIRE tap (see RULES.fireBuffer). */
  queued: number;
  speed: number;
};

export type Shell = {
  id: number;
  owner: PlayerIndex;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounces: number;
  maxBounces: number;
  age: number;
  bouncy: boolean;
  alive: boolean;
};

export type Mine = { id: number; owner: PlayerIndex; x: number; y: number; arm: number; alive: boolean };

export type Phase = 'ready' | 'play' | 'bonk' | 'over';

export type Event =
  | { type: 'fire'; p: PlayerIndex; x: number; y: number; bouncy: boolean }
  | { type: 'dud'; p: PlayerIndex; x: number; y: number }
  | { type: 'bounce'; x: number; y: number; bouncy: boolean }
  | { type: 'fizzle'; x: number; y: number }
  | { type: 'clash'; x: number; y: number }
  | { type: 'block'; p: PlayerIndex; x: number; y: number }
  | { type: 'hit'; p: PlayerIndex; by: PlayerIndex | null; self: boolean; x: number; y: number; mine: boolean }
  | { type: 'mine'; p: PlayerIndex; x: number; y: number }
  | { type: 'boom'; x: number; y: number }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'round'; n: number; layout: number }
  | { type: 'go' }
  | { type: 'timeup' }
  | { type: 'sudden' }
  | { type: 'win'; p: PlayerIndex | null };

/**
 * What a player wants this step. (mx, my) is the stick in world directions,
 * length 0..1: the tank turns to face it and drives forward when pushed far.
 */
export type Intent = { mx: number; my: number; fire: boolean; power: boolean };
export const IDLE: Intent = { mx: 0, my: 0, fire: false, power: false };

export const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// ---------- Arena helpers (shared by the rules and the bot) ----------

export class Arena {
  constructor(readonly grid: boolean[]) {}

  solidCell(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
    return this.grid[r * COLS + c];
  }

  solidAt(x: number, y: number): boolean {
    return this.solidCell(Math.floor((x - ARENA.x) / CELL), Math.floor((y - ARENA.y) / CELL));
  }

  cellOf(x: number, y: number): [number, number] {
    return [clamp(Math.floor((x - ARENA.x) / CELL), 0, COLS - 1), clamp(Math.floor((y - ARENA.y) / CELL), 0, ROWS - 1)];
  }

  center(c: number, r: number): { x: number; y: number } {
    return { x: ARENA.x + (c + 0.5) * CELL, y: ARENA.y + (r + 0.5) * CELL };
  }

  /** Push a circle out of blocks and arena walls. */
  pushOut(o: { x: number; y: number }, r: number): void {
    o.x = clamp(o.x, ARENA.x + r, ARENA.x + ARENA.w - r);
    o.y = clamp(o.y, ARENA.y + r, ARENA.y + ARENA.h - r);
    const [c0, r0] = this.cellOf(o.x, o.y);
    for (let rr = r0 - 1; rr <= r0 + 1; rr++) {
      for (let cc = c0 - 1; cc <= c0 + 1; cc++) {
        if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS || !this.grid[rr * COLS + cc]) continue;
        const bx = ARENA.x + cc * CELL;
        const by = ARENA.y + rr * CELL;
        const nx = clamp(o.x, bx, bx + CELL);
        const ny = clamp(o.y, by, by + CELL);
        const dx = o.x - nx;
        const dy = o.y - ny;
        const d = Math.hypot(dx, dy);
        if (d >= r) continue;
        if (d > 1e-6) {
          o.x = nx + (dx / d) * r;
          o.y = ny + (dy / d) * r;
        } else {
          // Centre inside a block: leave by the nearest face.
          const faces = [o.x - bx, bx + CELL - o.x, o.y - by, by + CELL - o.y];
          const m = Math.min(...faces);
          if (m === faces[0]) o.x = bx - r;
          else if (m === faces[1]) o.x = bx + CELL + r;
          else if (m === faces[2]) o.y = by - r;
          else o.y = by + CELL + r;
        }
      }
    }
  }

  /**
   * Move a shell for dt, bouncing off blocks and walls. Returns the bounce
   * points. The same function drives real shells and the bot's aim preview.
   */
  moveShell(s: Shell, dt: number, bounced?: (x: number, y: number) => void): void {
    s.age += dt;
    const R = RULES.shellR;
    const n = Math.max(1, Math.ceil((Math.hypot(s.vx, s.vy) * dt) / 3));
    const h = dt / n;
    for (let i = 0; i < n && s.alive; i++) {
      let hit = false;
      const nx = s.x + s.vx * h;
      if (this.solidAt(nx + Math.sign(s.vx) * R, s.y)) {
        s.vx = -s.vx;
        hit = true;
      } else s.x = nx;
      const ny = s.y + s.vy * h;
      if (this.solidAt(s.x, ny + Math.sign(s.vy) * R)) {
        s.vy = -s.vy;
        hit = true;
      } else s.y = ny;
      if (!hit && this.solidAt(s.x + Math.sign(s.vx) * R * 0.7, s.y + Math.sign(s.vy) * R * 0.7)) {
        // Exactly into a block corner: come straight back.
        s.vx = -s.vx;
        s.vy = -s.vy;
        hit = true;
      }
      if (hit) {
        s.bounces++;
        if (s.bounces > s.maxBounces) s.alive = false;
        else bounced?.(s.x, s.y);
      }
    }
    if (s.age > RULES.shellLife) s.alive = false;
  }
}

export function spawnOf(p: PlayerIndex): { x: number; y: number; a: number } {
  const x = ARENA.x + ARENA.w / 2;
  return p === 0 ? { x, y: ARENA.y + ARENA.h - CELL / 2, a: -Math.PI / 2 } : { x, y: ARENA.y + CELL / 2, a: Math.PI / 2 };
}

export function armorFor(assist: number): number {
  return Math.round(lerpAssist(assist, RULES.armor, RULES.armorMax));
}

export class TankDuel {
  score: [number, number] = [0, 0];
  tanks: [Tank, Tank];
  shells: Shell[] = [];
  mines: Mine[] = [];
  energy: [Energy, Energy];
  layout = 0;
  arena: Arena;
  phase: Phase = 'play';
  phaseT = 0;
  round = 1;
  playTime = 0;
  sudden = false;
  winner: PlayerIndex | null = null;
  /** True once the match is decided (winner may be null for a draw). */
  over = false;
  events: Event[] = [];
  t = 0;
  private nextId = 1;
  private pendingEnd: { winner: PlayerIndex | null } | null = null;

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    readonly powersOn: boolean,
    private readonly rng: Rng,
  ) {
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    this.tanks = [this.newTank(0), this.newTank(1)];
    this.layout = rng.int(0, LAYOUTS.length - 1);
    this.arena = new Arena(buildGrid(LAYOUTS[this.layout]));
  }

  private newTank(p: PlayerIndex): Tank {
    const s = spawnOf(p);
    return { x: s.x, y: s.y, a: s.a, hits: 0, armor: armorFor(this.players[p].assist), reload: 0, shield: 0, bouncy: 0, fired: 9, speed: 0, queued: 0 };
  }

  /** Bonks a tank can still take. */
  hearts(p: PlayerIndex): number {
    return Math.max(0, this.tanks[p].armor - this.tanks[p].hits);
  }

  shellsOf(p: PlayerIndex): number {
    return this.shells.filter((s) => s.alive && s.owner === p).length;
  }

  canFire(p: PlayerIndex): boolean {
    return this.tanks[p].reload <= 0 && this.shellsOf(p) < RULES.maxShells;
  }

  /** Where a shell fired now would start. */
  muzzle(p: PlayerIndex, a = this.tanks[p].a): { x: number; y: number } {
    const tk = this.tanks[p];
    const d = RULES.tankR + 7;
    return { x: tk.x + Math.cos(a) * d, y: tk.y + Math.sin(a) * d };
  }

  step(dt: number, intents: [Intent, Intent]): void {
    this.events = [];
    if (this.over) return;
    this.t += dt;
    if (this.phase === 'ready') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'play';
        this.events.push({ type: 'go' });
      }
      return;
    }
    if (this.phase === 'bonk') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (this.pendingEnd) this.finish(this.pendingEnd.winner);
        else this.nextRound();
      }
      return;
    }
    this.playTime += dt;
    for (const p of PLAYERS) {
      const e = this.energy[p];
      e.tick(dt);
      e.charge(RULES.energyPerSec * dt, this.hearts(p) < this.hearts(other(p)));
      const tk = this.tanks[p];
      tk.reload = Math.max(0, tk.reload - dt);
      tk.shield = Math.max(0, tk.shield - dt);
      tk.bouncy = Math.max(0, tk.bouncy - dt);
      tk.fired += dt;
      tk.queued = Math.max(0, tk.queued - dt);
      if (this.powersOn && intents[p].power) this.firePower(p);
      this.drive(p, intents[p], dt);
    }
    this.separateTanks();
    for (const p of PLAYERS) {
      const tk = this.tanks[p];
      if (intents[p].fire && !this.canFire(p)) tk.queued = RULES.fireBuffer;
      else if (intents[p].fire || (tk.queued > 0 && this.canFire(p))) this.fire(p);
    }
    const victims = new Map<PlayerIndex, { by: PlayerIndex | null; x: number; y: number; mine: boolean }>();
    this.moveShells(dt, victims);
    this.updateMines(dt, victims);
    if (victims.size) this.bonk(victims);
    else this.checkClock();
  }

  private drive(p: PlayerIndex, it: Intent, dt: number): void {
    const tk = this.tanks[p];
    const mag = Math.min(1, Math.hypot(it.mx, it.my));
    tk.speed = 0;
    if (mag <= RULES.dead) return;
    const target = Math.atan2(it.my, it.mx);
    const diff = wrapAngle(target - tk.a);
    const turn = Math.sign(diff) * Math.min(Math.abs(diff), RULES.turnRate * dt);
    tk.a = wrapAngle(tk.a + turn);
    const left = wrapAngle(target - tk.a);
    const drive = clamp((mag - RULES.driveFrom) / (0.85 - RULES.driveFrom), 0, 1);
    const align = Math.max(0, Math.cos(left));
    const sp = RULES.speed * drive * align * align;
    tk.speed = sp;
    tk.x += Math.cos(tk.a) * sp * dt;
    tk.y += Math.sin(tk.a) * sp * dt;
    this.arena.pushOut(tk, RULES.tankR);
  }

  private separateTanks(): void {
    const [a, b] = this.tanks;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const min = RULES.tankR * 2;
    if (d >= min) return;
    const nx = d > 1e-6 ? dx / d : 0;
    const ny = d > 1e-6 ? dy / d : 1;
    const push = (min - d) / 2;
    a.x -= nx * push;
    a.y -= ny * push;
    b.x += nx * push;
    b.y += ny * push;
    this.arena.pushOut(a, RULES.tankR);
    this.arena.pushOut(b, RULES.tankR);
  }

  private fire(p: PlayerIndex): void {
    if (!this.canFire(p)) return;
    const tk = this.tanks[p];
    tk.queued = 0;
    tk.reload = RULES.reload;
    tk.fired = 0;
    const m = this.muzzle(p);
    if (this.arena.solidAt(m.x, m.y)) {
      this.events.push({ type: 'dud', p, x: m.x, y: m.y });
      return;
    }
    const bouncy = tk.bouncy > 0;
    this.shells.push({
      id: this.nextId++,
      owner: p,
      x: m.x,
      y: m.y,
      vx: Math.cos(tk.a) * RULES.shellSpeed,
      vy: Math.sin(tk.a) * RULES.shellSpeed,
      bounces: 0,
      maxBounces: bouncy ? RULES.bouncyBounces : RULES.bounces,
      age: 0,
      bouncy,
      alive: true,
    });
    this.events.push({ type: 'fire', p, x: m.x, y: m.y, bouncy });
  }

  private firePower(p: PlayerIndex): void {
    const power = this.players[p].power;
    if (!power || !this.energy[p].spend(power.duration ?? 0)) return;
    const tk = this.tanks[p];
    if (power.id === 'bouncy') tk.bouncy = power.duration ?? 8;
    else if (power.id === 'shield') tk.shield = power.duration ?? 3;
    else if (power.id === 'mine') {
      const back = { x: tk.x - Math.cos(tk.a) * (RULES.tankR + 10), y: tk.y - Math.sin(tk.a) * (RULES.tankR + 10) };
      const spot = this.arena.solidAt(back.x, back.y) ? { x: tk.x, y: tk.y } : back;
      this.arena.pushOut(spot, RULES.mineR);
      this.mines.push({ id: this.nextId++, owner: p, x: spot.x, y: spot.y, arm: RULES.mineArm, alive: true });
      this.events.push({ type: 'mine', p, x: spot.x, y: spot.y });
    }
    this.events.push({ type: 'power', p, id: power.id });
  }

  /** Can this shell bonk tank p right now? */
  static armedFor(s: Shell, p: PlayerIndex): boolean {
    return s.owner !== p || s.bounces > 0 || s.age >= RULES.selfArm;
  }

  private moveShells(dt: number, victims: Map<PlayerIndex, { by: PlayerIndex | null; x: number; y: number; mine: boolean }>): void {
    const hitR = RULES.tankR + RULES.shellR;
    for (const s of this.shells) {
      if (!s.alive) continue;
      this.arena.moveShell(s, dt, (x, y) => this.events.push({ type: 'bounce', x, y, bouncy: s.bouncy }));
      if (!s.alive) {
        this.events.push({ type: 'fizzle', x: s.x, y: s.y });
        continue;
      }
      for (const p of PLAYERS) {
        const tk = this.tanks[p];
        if (!TankDuel.armedFor(s, p)) continue;
        const d = Math.hypot(s.x - tk.x, s.y - tk.y);
        if (tk.shield > 0 && d < RULES.tankR + 10 + RULES.shellR) {
          s.alive = false;
          this.events.push({ type: 'block', p, x: s.x, y: s.y });
          break;
        }
        if (d < hitR) {
          s.alive = false;
          if (!victims.has(p)) victims.set(p, { by: s.owner, x: s.x, y: s.y, mine: false });
          break;
        }
      }
      if (!s.alive) continue;
      for (const m of this.mines) {
        if (m.alive && Math.hypot(s.x - m.x, s.y - m.y) < RULES.mineR + RULES.shellR) {
          s.alive = false;
          this.detonate(m, victims);
          break;
        }
      }
    }
    // Shells from different tanks that meet cancel out.
    const live = this.shells.filter((s) => s.alive);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        if (!a.alive || !b.alive || a.owner === b.owner) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < RULES.shellR * 2 + 1) {
          a.alive = b.alive = false;
          this.events.push({ type: 'clash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
    }
    this.shells = this.shells.filter((s) => s.alive);
  }

  private updateMines(dt: number, victims: Map<PlayerIndex, { by: PlayerIndex | null; x: number; y: number; mine: boolean }>): void {
    for (const m of this.mines) {
      if (!m.alive) continue;
      m.arm = Math.max(0, m.arm - dt);
      if (m.arm > 0) continue;
      for (const tk of this.tanks) {
        if (Math.hypot(tk.x - m.x, tk.y - m.y) < RULES.mineR + RULES.tankR) {
          this.detonate(m, victims);
          break;
        }
      }
    }
    this.mines = this.mines.filter((m) => m.alive);
  }

  private detonate(m: Mine, victims: Map<PlayerIndex, { by: PlayerIndex | null; x: number; y: number; mine: boolean }>): void {
    m.alive = false;
    this.events.push({ type: 'boom', x: m.x, y: m.y });
    for (const p of PLAYERS) {
      const tk = this.tanks[p];
      if (Math.hypot(tk.x - m.x, tk.y - m.y) >= RULES.blastR + RULES.tankR) continue;
      if (tk.shield > 0) {
        this.events.push({ type: 'block', p, x: tk.x, y: tk.y });
        continue;
      }
      if (!victims.has(p)) victims.set(p, { by: m.owner, x: tk.x, y: tk.y, mine: true });
    }
  }

  private bonk(victims: Map<PlayerIndex, { by: PlayerIndex | null; x: number; y: number; mine: boolean }>): void {
    for (const [p, v] of victims) {
      this.tanks[p].hits++;
      this.score[other(p)]++;
      this.events.push({ type: 'hit', p, by: v.by, self: v.by === p, x: v.x, y: v.y, mine: v.mine });
      this.energy[p].charge(RULES.energyConcede, true);
      if (v.by !== null && v.by !== p) this.energy[v.by].charge(RULES.energyHit, this.hearts(v.by) < this.hearts(p));
    }
    const out = PLAYERS.filter((p) => this.hearts(p) === 0);
    if (out.length === 2) this.pendingEnd = { winner: null };
    else if (out.length === 1) this.pendingEnd = { winner: other(out[0]) };
    else if (this.sudden) {
      // Sudden death: the first bonk decides it (both bonked at once = draw).
      this.pendingEnd = { winner: victims.size === 2 ? null : other([...victims.keys()][0]) };
    }
    this.phase = 'bonk';
    this.phaseT = RULES.bonkTime;
    this.shells = [];
  }

  private checkClock(): void {
    if (!this.sudden && this.playTime >= RULES.timeCap) {
      this.events.push({ type: 'timeup' });
      const h0 = this.hearts(0);
      const h1 = this.hearts(1);
      if (h0 !== h1) this.finish(h0 > h1 ? 0 : 1);
      else {
        this.sudden = true;
        this.events.push({ type: 'sudden' });
      }
    } else if (this.sudden && this.playTime >= RULES.timeCap + RULES.suddenCap) {
      this.finish(null);
    }
  }

  private nextRound(): void {
    this.round++;
    let next = this.rng.int(0, LAYOUTS.length - 2);
    if (next >= this.layout) next++;
    this.layout = next;
    this.arena = new Arena(buildGrid(LAYOUTS[next]));
    for (const p of PLAYERS) {
      const tk = this.tanks[p];
      const s = spawnOf(p);
      Object.assign(tk, { x: s.x, y: s.y, a: s.a, reload: 0, shield: 0, bouncy: 0, fired: 9, speed: 0, queued: 0 });
      this.energy[p].active = 0;
    }
    this.shells = [];
    this.mines = [];
    this.phase = 'ready';
    this.phaseT = RULES.readyTime;
    this.events.push({ type: 'round', n: this.round, layout: next });
  }

  private finish(winner: PlayerIndex | null): void {
    this.over = true;
    this.phase = 'over';
    this.winner = winner;
    this.shells = [];
    this.events.push({ type: 'win', p: winner });
  }
}

// ---------- Shot preview (bot aim, also handy in tests) ----------

/**
 * Follow a would-be shell fired by p at angle a, with the tanks frozen where
 * they are now. Returns which tank it would bonk first and after how many bounces.
 */
export function traceShot(game: TankDuel, p: PlayerIndex, a: number, maxT = 2.4): { hit: PlayerIndex | null; bounces: number; t: number } {
  const m = game.muzzle(p, a);
  if (game.arena.solidAt(m.x, m.y)) return { hit: null, bounces: 0, t: 0 };
  const s: Shell = {
    id: 0,
    owner: p,
    x: m.x,
    y: m.y,
    vx: Math.cos(a) * RULES.shellSpeed,
    vy: Math.sin(a) * RULES.shellSpeed,
    bounces: 0,
    maxBounces: game.tanks[p].bouncy > 0 ? RULES.bouncyBounces : RULES.bounces,
    age: 0,
    bouncy: false,
    alive: true,
  };
  const dt = 1 / 60;
  const hitR = RULES.tankR + RULES.shellR;
  for (let t = 0; t < maxT && s.alive; t += dt) {
    game.arena.moveShell(s, dt);
    if (!s.alive) break;
    for (const q of PLAYERS) {
      if (!TankDuel.armedFor(s, q)) continue;
      const tk = game.tanks[q];
      if (Math.hypot(s.x - tk.x, s.y - tk.y) < hitR - (q === p ? -4 : 3)) return { hit: q, bounces: s.bounces, t };
    }
  }
  return { hit: null, bounces: s.bounces, t: maxT };
}

// ---------- Honest bot ----------
// Same speed, turn rate, reload and shell cap as a person; it steers with the
// same stick intent and taps the same FIRE button. Skill only changes how often
// it looks at the arena (react), how far off its aim is, how many bounces it
// thinks ahead, and how quickly its thumb follows the reload ring (trigger).
// Like a person, it can't tap the moment the gun is ready: it waits at least
// HUMAN.reaction after the ring fills, and never taps faster than HUMAN.tapGap.
export const BOT = {
  easy: { react: 0.6, noise: 0.16, depth: 0, angles: 48, trigger: 0.32 },
  normal: { react: 0.35, noise: 0.085, depth: 1, angles: 72, trigger: 0.26 },
  hard: { react: 0.2, noise: 0.045, depth: 2, angles: 96, trigger: HUMAN.reaction },
} satisfies Record<BotLevel, { react: number; noise: number; depth: number; angles: number; trigger: number }>;

type Mode = 'aim' | 'move' | 'dodge';
/** A new shot within this angle of the one being lined up is the same shot (keeps its wobble). */
const AIM_KEEP = 0.12;

export class TankBot {
  private timer = 0;
  private mode: Mode = 'move';
  private aimAngle = 0;
  private path: number[] = [];
  private pathI = 0;
  private dodge = { x: 0, y: 0, t: 0 };
  private wantPower = false;
  /** Seconds the gun has been ready (as the bot sees it), and since its last FIRE tap. */
  private readyFor = 0;
  private sinceTap = 9;
  /** The shot being lined up and its committed aim wobble (see replan). */
  private aimShot: number | null = null;
  private aimNoise = 0;

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  think(game: TankDuel, dt: number): Intent {
    if (game.phase !== 'play') {
      this.timer = Math.min(this.timer, BOT[this.level].react * 0.5);
      this.path = [];
      this.readyFor = 0;
      return IDLE;
    }
    this.sinceTap += dt;
    this.readyFor = game.canFire(this.p) ? this.readyFor + dt : 0;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = BOT[this.level].react * this.rng.range(0.8, 1.2);
      this.replan(game);
    }
    const tk = game.tanks[this.p];
    const power = this.wantPower && game.powersOn && game.energy[this.p].ready;
    if (power) this.wantPower = false;
    if (this.mode === 'dodge') {
      this.dodge.t -= dt;
      if (this.dodge.t <= 0) this.mode = 'move';
      return { mx: this.dodge.x, my: this.dodge.y, fire: false, power };
    }
    if (this.mode === 'aim') {
      const off = Math.abs(wrapAngle(this.aimAngle - tk.a));
      const thumb = this.readyFor >= BOT[this.level].trigger && this.sinceTap >= HUMAN.tapGap;
      const fire = off < 0.035 && game.canFire(this.p) && thumb;
      if (fire) {
        // Keep the thumb where it is until the next look: dropping straight back to
        // driving and then turning back for the next shot made the tank wag after
        // every shot. A fresh shot after this one gets a fresh wobble.
        this.aimShot = null;
        this.sinceTap = 0;
      }
      return { mx: Math.cos(this.aimAngle) * 0.22, my: Math.sin(this.aimAngle) * 0.22, fire, power };
    }
    // Follow the path toward the other tank.
    while (this.pathI < this.path.length) {
      const idx = this.path[this.pathI];
      const c = game.arena.center(idx % COLS, Math.floor(idx / COLS));
      const dx = c.x - tk.x;
      const dy = c.y - tk.y;
      const d = Math.hypot(dx, dy);
      if (d < 9) {
        this.pathI++;
        continue;
      }
      return { mx: dx / d, my: dy / d, fire: false, power };
    }
    const foe = game.tanks[other(this.p)];
    const a = Math.atan2(foe.y - tk.y, foe.x - tk.x);
    const close = Math.hypot(foe.x - tk.x, foe.y - tk.y) < RULES.tankR * 3;
    return { mx: Math.cos(a) * (close ? 0.22 : 0.9), my: Math.sin(a) * (close ? 0.22 : 0.9), fire: false, power };
  }

  private replan(game: TankDuel): void {
    const cfg = BOT[this.level];
    const me = game.tanks[this.p];
    const foe = game.tanks[other(this.p)];
    const powerId = game.powersOn ? game.players[this.p].power?.id : undefined;
    const ready = game.powersOn && game.energy[this.p].ready;
    // 1. Is a shell about to bonk me? Get out of its way (if I noticed in time).
    const threat = this.threat(game);
    if (threat) {
      if (ready && powerId === 'shield') this.wantPower = true;
      const opts = [
        { x: -threat.vy, y: threat.vx },
        { x: threat.vy, y: -threat.vx },
      ].map((v) => {
        const l = Math.hypot(v.x, v.y) || 1;
        const n = { x: v.x / l, y: v.y / l };
        const free = !game.arena.solidAt(me.x + n.x * 30, me.y + n.y * 30);
        const away = (me.x + n.x * 20 - threat.x) ** 2 + (me.y + n.y * 20 - threat.y) ** 2;
        return { n, score: (free ? 1e6 : 0) + away };
      });
      opts.sort((a, b) => b.score - a.score);
      this.mode = 'dodge';
      this.dodge = { x: opts[0].n.x, y: opts[0].n.y, t: 0.45 };
      return;
    }
    // 2. Is there a shot (straight or banked) from here?
    if (game.shellsOf(this.p) < RULES.maxShells) {
      const shot = this.findShot(game, cfg.depth, cfg.angles);
      if (shot !== null) {
        // Commit to an aim like a thumb does: keep the same wobble while the shot
        // hasn't really changed, instead of re-rolling it every look (that made the
        // tank shake left and right while it lined up).
        const same = this.mode === 'aim' && this.aimShot !== null && Math.abs(wrapAngle(shot - this.aimShot)) < AIM_KEEP;
        if (!same) this.aimNoise = this.rng.range(-cfg.noise, cfg.noise);
        this.mode = 'aim';
        this.aimShot = shot;
        this.aimAngle = shot + this.aimNoise;
        if (ready && powerId === 'bouncy') this.wantPower = true;
        return;
      }
    }
    // 3. Drive toward the other tank.
    this.mode = 'move';
    this.aimShot = null;
    this.path = this.route(game, me, foe);
    this.pathI = 1;
    const dist = Math.hypot(foe.x - me.x, foe.y - me.y);
    if (ready && powerId === 'mine' && (dist < 150 || this.rng.chance(0.15))) this.wantPower = true;
    if (ready && powerId === 'bouncy' && this.rng.chance(0.25)) this.wantPower = true;
  }

  private threat(game: TankDuel): { x: number; y: number; vx: number; vy: number } | null {
    const me = game.tanks[this.p];
    if (me.shield > 0) return null;
    const danger = RULES.tankR + RULES.shellR + 6;
    for (const s0 of game.shells) {
      const s = { ...s0 };
      for (let t = 0; t < 0.9 && s.alive; t += 1 / 60) {
        game.arena.moveShell(s, 1 / 60);
        if (TankDuel.armedFor(s, this.p) && Math.hypot(s.x - me.x, s.y - me.y) < danger) return { x: s.x, y: s.y, vx: s.vx, vy: s.vy };
      }
    }
    return null;
  }

  private findShot(game: TankDuel, depth: number, n: number): number | null {
    const me = game.tanks[this.p];
    let best: number | null = null;
    let bestScore = Infinity;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 - Math.PI;
      const r = traceShot(game, this.p, a);
      if (r.hit !== other(this.p) || r.bounces > depth) continue;
      const score = r.t + r.bounces * 0.4 + Math.abs(wrapAngle(a - me.a)) * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  /** Breadth-first route over open cells (mines count as blocked), as cell indices. */
  private route(game: TankDuel, from: Tank, to: Tank): number[] {
    const [sc, sr] = game.arena.cellOf(from.x, from.y);
    const [gc, gr] = game.arena.cellOf(to.x, to.y);
    const blocked = new Set<number>();
    for (const m of game.mines) {
      const [mc, mr] = game.arena.cellOf(m.x, m.y);
      blocked.add(mr * COLS + mc);
    }
    const start = sr * COLS + sc;
    const goal = gr * COLS + gc;
    const prev = new Map<number, number>([[start, -1]]);
    const queue = [start];
    const open = (c: number, r: number) => !game.arena.solidCell(c, r) && !blocked.has(r * COLS + c);
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === goal) break;
      const c = cur % COLS;
      const r = Math.floor(cur / COLS);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (!open(nc, nr)) continue;
        if (dc && dr && (!open(c + dc, r) || !open(c, r + dr))) continue;
        const id = nr * COLS + nc;
        if (prev.has(id)) continue;
        prev.set(id, cur);
        queue.push(id);
      }
    }
    if (!prev.has(goal)) return [];
    const path: number[] = [];
    for (let cur = goal; cur !== -1; cur = prev.get(cur)!) path.unshift(cur);
    return path;
  }
}
