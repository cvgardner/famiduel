// Mini Pool table physics: pure and deterministic (same balls + same shot = same result),
// so the bot can line up a shot with exactly the physics a person's eye estimates and the
// tests can replay whole racks. Equal-mass balls, elastic-ish ball hits, bouncy cushions,
// rolling friction, six pockets. A frozen ball (the Freeze Ball power) is fixed in place:
// balls bounce off it like off a post.
import { MID, W } from '../../engine/world';

/** The cloth inside the cushions (world units). The rails are drawn outside it. */
export const TABLE = { left: 40, right: W - 40, top: 104, bottom: 536 } as const;

export const PHYS = {
  /** Ball radius. Chunky on purpose: easy to see and to hit on a small phone. */
  r: 11,
  /** Cue ball speed at full power. */
  maxSpeed: 980,
  /** Rolling friction: constant slow-down (units/s²) plus a little drag (fraction per second). */
  roll: 230,
  drag: 0.45,
  /** Below this speed a ball stops. */
  stopSpeed: 5,
  /** Fraction of speed kept off a cushion, and in a ball-to-ball hit. */
  cushion: 0.8,
  restitution: 0.95,
  /** Physics substeps per frame, so a fast ball never jumps through another. */
  substeps: 4,
  /** Capture radius (ball centre to pocket centre) of the corner and middle pockets. */
  cornerR: 20,
  sideR: 17,
  /** Longest a shot may roll before every ball is stopped where it is. */
  maxRoll: 12,
};

export type Pocket = { x: number; y: number; side: boolean };

/** Four corners and the middle of each long rail. */
export const POCKETS: readonly Pocket[] = [
  { x: TABLE.left, y: TABLE.top, side: false },
  { x: TABLE.right, y: TABLE.top, side: false },
  { x: TABLE.left, y: MID, side: true },
  { x: TABLE.right, y: MID, side: true },
  { x: TABLE.left, y: TABLE.bottom, side: false },
  { x: TABLE.right, y: TABLE.bottom, side: false },
];

/**
 * The spot to send a ball at to drop it in this pocket: the nearest place its centre can
 * reach (a ball's centre stays a radius off each cushion), inside the pocket's capture ring.
 */
export function pocketAim(pk: Pocket): { x: number; y: number } {
  const r = PHYS.r;
  const x = pk.x < W / 2 ? pk.x + r : pk.x - r;
  const y = pk.side ? pk.y : pk.y < MID ? pk.y + r : pk.y - r;
  return { x, y };
}

/** Where the cue ball must touch `t` to send it at the pocket (the "ghost ball"). */
export function ghostBall(t: { x: number; y: number }, pk: Pocket): { x: number; y: number; ux: number; uy: number } {
  const aim = pocketAim(pk);
  const ux = aim.x - t.x;
  const uy = aim.y - t.y;
  const ul = Math.hypot(ux, uy) || 1;
  return { x: t.x - (ux / ul) * PHYS.r * 2, y: t.y - (uy / ul) * PHYS.r * 2, ux: ux / ul, uy: uy / ul };
}

/** 'cue' is the white ball, 'eight' the black one, 0 / 1 the balls of that player. */
export type Kind = 'cue' | 'eight' | 0 | 1;
export type Ball = { id: number; kind: Kind; x: number; y: number; vx: number; vy: number; on: boolean };

/** What changes physics for one shot: extra pocket size (handicap, Big Pockets) and a frozen ball. */
export type ShotMods = { pocketBonus: number; frozenId: number | null };
export const NO_MODS: ShotMods = { pocketBonus: 0, frozenId: null };

export type PhysEvent =
  | { type: 'hit'; a: number; b: number; x: number; y: number; speed: number }
  | { type: 'cushion'; id: number; x: number; y: number; speed: number }
  | { type: 'pocket'; id: number; kind: Kind; pocket: number; x: number; y: number };

export function pocketR(pk: Pocket, mods: ShotMods): number {
  return (pk.side ? PHYS.sideR : PHYS.cornerR) + mods.pocketBonus;
}

export function cloneBalls(balls: readonly Ball[]): Ball[] {
  return balls.map((b) => ({ ...b }));
}

export function moving(balls: readonly Ball[]): boolean {
  return balls.some((b) => b.on && (b.vx !== 0 || b.vy !== 0));
}

/** Sets the cue ball rolling. power is 0..1 of full speed. */
export function strike(balls: Ball[], angle: number, power: number): void {
  const cue = balls.find((b) => b.kind === 'cue')!;
  const v = PHYS.maxSpeed * Math.max(0, Math.min(1, power));
  cue.vx = Math.cos(angle) * v;
  cue.vy = Math.sin(angle) * v;
}

/**
 * One frame of rolling. Pushes what happened into `out`. Order inside a substep is fixed
 * (move, pockets, cushions, ball pairs in id order), so a frame replays exactly.
 */
export function stepTable(balls: Ball[], dt: number, mods: ShotMods, out: PhysEvent[]): void {
  const n = PHYS.substeps;
  const h = dt / n;
  const r = PHYS.r;
  for (let s = 0; s < n; s++) {
    for (const b of balls) {
      if (!b.on) continue;
      if (b.id === mods.frozenId) {
        b.vx = b.vy = 0;
        continue;
      }
      const sp = Math.hypot(b.vx, b.vy);
      if (sp === 0) continue;
      let ns = Math.max(0, sp - PHYS.roll * h) * (1 - PHYS.drag * h);
      if (ns < PHYS.stopSpeed) ns = 0;
      b.vx *= ns / sp;
      b.vy *= ns / sp;
      b.x += b.vx * h;
      b.y += b.vy * h;
    }
    for (const b of balls) {
      if (!b.on) continue;
      for (let i = 0; i < POCKETS.length; i++) {
        const pk = POCKETS[i];
        if (Math.hypot(b.x - pk.x, b.y - pk.y) < pocketR(pk, mods)) {
          b.on = false;
          b.vx = b.vy = 0;
          out.push({ type: 'pocket', id: b.id, kind: b.kind, pocket: i, x: pk.x, y: pk.y });
          break;
        }
      }
      if (!b.on) continue;
      const lo = { x: TABLE.left + r, y: TABLE.top + r };
      const hi = { x: TABLE.right - r, y: TABLE.bottom - r };
      if (b.x < lo.x || b.x > hi.x) {
        const sp = Math.abs(b.vx);
        b.x = b.x < lo.x ? 2 * lo.x - b.x : 2 * hi.x - b.x;
        b.vx = -b.vx * PHYS.cushion;
        b.vy *= PHYS.cushion;
        if (sp > 20) out.push({ type: 'cushion', id: b.id, x: b.x, y: b.y, speed: sp });
      }
      if (b.y < lo.y || b.y > hi.y) {
        const sp = Math.abs(b.vy);
        b.y = b.y < lo.y ? 2 * lo.y - b.y : 2 * hi.y - b.y;
        b.vy = -b.vy * PHYS.cushion;
        b.vx *= PHYS.cushion;
        if (sp > 20) out.push({ type: 'cushion', id: b.id, x: b.x, y: b.y, speed: sp });
      }
    }
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.on) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.on) collide(a, b, mods, out);
      }
    }
  }
}

function collide(a: Ball, b: Ball, mods: ShotMods, out: PhysEvent[]): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = PHYS.r * 2;
  if (d >= min) return;
  const nx = d > 1e-9 ? dx / d : 1;
  const ny = d > 1e-9 ? dy / d : 0;
  const aFix = a.id === mods.frozenId;
  const bFix = b.id === mods.frozenId;
  // Pull them apart (a frozen ball stays put).
  const over = min - d;
  if (aFix) {
    b.x += nx * over;
    b.y += ny * over;
  } else if (bFix) {
    a.x -= nx * over;
    a.y -= ny * over;
  } else {
    a.x -= (nx * over) / 2;
    a.y -= (ny * over) / 2;
    b.x += (nx * over) / 2;
    b.y += (ny * over) / 2;
  }
  const vrel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (vrel <= 0) return; // already moving apart
  const e = PHYS.restitution;
  if (aFix) {
    const j = (1 + e) * -vrel;
    b.vx -= j * nx;
    b.vy -= j * ny;
  } else if (bFix) {
    const j = (1 + e) * vrel;
    a.vx -= j * nx;
    a.vy -= j * ny;
  } else {
    const j = ((1 + e) * vrel) / 2;
    a.vx -= j * nx;
    a.vy -= j * ny;
    b.vx += j * nx;
    b.vy += j * ny;
  }
  out.push({ type: 'hit', a: a.id, b: b.id, x: a.x + nx * PHYS.r, y: a.y + ny * PHYS.r, speed: vrel });
}

export type ShotResult = { balls: Ball[]; potted: Ball[]; firstHit: number | null; time: number };

/** Plays one shot to the end on a copy of the balls (the bot's line-up and the tests). */
export function simulateShot(start: readonly Ball[], angle: number, power: number, mods: ShotMods, dt: number): ShotResult {
  const balls = cloneBalls(start);
  strike(balls, angle, power);
  const cueId = balls.find((b) => b.kind === 'cue')!.id;
  const potted: Ball[] = [];
  let firstHit: number | null = null;
  const ev: PhysEvent[] = [];
  let t = 0;
  while (moving(balls) && t < PHYS.maxRoll) {
    ev.length = 0;
    stepTable(balls, dt, mods, ev);
    t += dt;
    for (const e of ev) {
      if (e.type === 'pocket') potted.push(balls.find((b) => b.id === e.id)!);
      else if (e.type === 'hit' && firstHit === null && (e.a === cueId || e.b === cueId)) firstHit = e.a === cueId ? e.b : e.a;
    }
  }
  return { balls, potted, firstHit, time: t };
}

/**
 * Where the cue ball first touches something along `angle`, up to `len` units: the cue's
 * centre at that moment, and the ball it hits (if any). For the aim guide.
 */
export function castAim(balls: readonly Ball[], angle: number, len: number): { x: number; y: number; hit: Ball | null; cushion: boolean } {
  const cue = balls.find((b) => b.kind === 'cue')!;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const r = PHYS.r;
  let best = len;
  let hit: Ball | null = null;
  for (const b of balls) {
    if (!b.on || b === cue) continue;
    // Solve |cue + t·d - b| = 2r.
    const fx = cue.x - b.x;
    const fy = cue.y - b.y;
    const bq = fx * dx + fy * dy;
    const c = fx * fx + fy * fy - 4 * r * r;
    const disc = bq * bq - c;
    if (disc < 0) continue;
    const t = -bq - Math.sqrt(disc);
    if (t >= 0 && t < best) {
      best = t;
      hit = b;
    }
  }
  let cushion = false;
  const walls = [
    dx < 0 ? (TABLE.left + r - cue.x) / dx : dx > 0 ? (TABLE.right - r - cue.x) / dx : Infinity,
    dy < 0 ? (TABLE.top + r - cue.y) / dy : dy > 0 ? (TABLE.bottom - r - cue.y) / dy : Infinity,
  ];
  for (const t of walls) {
    if (t >= 0 && t < best) {
      best = t;
      hit = null;
      cushion = true;
    }
  }
  return { x: cue.x + dx * best, y: cue.y + dy * best, hit, cushion };
}

/**
 * The paths the cue ball and the first ball it hits will roll, for the Long Aim guide:
 * the same physics as the shot, run on a copy. Points every few frames, up to `maxT` s.
 */
export function tracePaths(start: readonly Ball[], angle: number, power: number, mods: ShotMods, dt: number, maxT = 2.5): { cue: { x: number; y: number }[]; hit: { x: number; y: number }[]; hitId: number | null } {
  const balls = cloneBalls(start);
  strike(balls, angle, power);
  const cue = balls.find((b) => b.kind === 'cue')!;
  const cuePts = [{ x: cue.x, y: cue.y }];
  const hitPts: { x: number; y: number }[] = [];
  let hitId: number | null = null;
  const ev: PhysEvent[] = [];
  let t = 0;
  let k = 0;
  while (moving(balls) && t < maxT) {
    ev.length = 0;
    stepTable(balls, dt, mods, ev);
    t += dt;
    for (const e of ev) {
      if (e.type === 'hit' && hitId === null && (e.a === cue.id || e.b === cue.id)) {
        hitId = e.a === cue.id ? e.b : e.a;
        const hb = balls.find((b) => b.id === hitId)!;
        hitPts.push({ x: hb.x, y: hb.y });
      }
    }
    if (++k % 3 === 0 || !moving(balls)) {
      if (cue.on) cuePts.push({ x: cue.x, y: cue.y });
      const hb = hitId === null ? null : balls.find((b) => b.id === hitId)!;
      if (hb?.on) hitPts.push({ x: hb.x, y: hb.y });
    }
  }
  return { cue: cuePts, hit: hitPts, hitId };
}
