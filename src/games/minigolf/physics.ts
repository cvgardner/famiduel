// Minigolf ball physics: a fixed-step, deterministic roll on a course made of
// wall segments, surface zones and time-driven moving obstacles. No physics
// engine. The game and the bot (and the aim guide) all call rollFrame(), so a
// predicted shot is exactly the shot that happens when released at that time.

export type Pt = [number, number];

export type WallDef = { kind: 'border' | 'inner'; closed: boolean; pts: Pt[] };
export type ZoneDef = {
  type: 'sand' | 'water' | 'slope' | 'bowl';
  poly?: Pt[];
  circle?: [number, number, number];
  accel?: Pt;
  pull?: number;
};
export type MoverDef =
  | { type: 'windmill'; x: number; y: number; len: number; blades: number; speed: number }
  | { type: 'slider'; a: Pt; b: Pt; travel: Pt; period: number };
export type HoleDef = {
  id: string;
  name: string;
  par: number;
  tee: Pt;
  cup: Pt;
  walls: WallDef[];
  zones: ZoneDef[];
  movers: MoverDef[];
};

export const PHYS = {
  ballR: 7,
  cupR: 11,
  maxSpeed: 800,
  /** Rolling resistance: constant deceleration (u/s²) and speed-proportional drag (1/s). */
  grass: { decel: 110, drag: 0.8 },
  sand: { decel: 520, drag: 2.6 },
  restitution: 0.78,
  moverRestitution: 0.6,
  /**
   * Ball must be slower than this to drop in the cup. Generous on purpose
   * (Chris, Nov 2026: players expect a ball that reaches the hole to drop):
   * anything but a hard-hit ball drops. Was 250.
   */
  captureSpeed: 420,
  /** A ball too fast to drop rattles over the cup and keeps only this much speed. */
  lipKeep: 0.55,
  /** Inside the cup lip the ball is pulled to the centre. */
  lipPull: 1400,
  magnet: { radius: 64, pull: 520, captureSpeed: 600 },
  stopSpeed: 5,
  substeps: 4,
  maxRoll: 10,
  bladeThick: 3,
  sliderThick: 4,
};

/** One collision segment. obj groups the segments of one wall or mover (Ghost Ball skips a whole object). */
export type Seg = { ax: number; ay: number; bx: number; by: number; obj: number; inner: boolean; thick: number; vx?: number; vy?: number; spin?: { cx: number; cy: number; w: number } };

export type Zone = ZoneDef & { minX: number; minY: number; maxX: number; maxY: number };

export type Course = {
  hole: HoleDef;
  segs: Seg[];
  zones: Zone[];
  border: Pt[];
  /** Closed inner blocks (a resting ball is pushed out of these after a ghost shot). */
  blocks: { obj: number; pts: Pt[] }[];
  /** Path distance to the cup on a grid, for the bot's judgement of a resting spot. */
  dist: Float32Array;
  gw: number;
  gh: number;
};

export const MOVER_OBJ = 1000;
const GRID = 8;

export function pointInPoly(x: number, y: number, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inZone(z: Zone, x: number, y: number): boolean {
  if (x < z.minX || x > z.maxX || y < z.minY || y > z.maxY) return false;
  if (z.circle) return Math.hypot(x - z.circle[0], y - z.circle[1]) <= z.circle[2];
  return pointInPoly(x, y, z.poly!);
}

function closest(ax: number, ay: number, bx: number, by: number, px: number, py: number): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [ax + dx * t, ay + dy * t];
}

export function compileCourse(hole: HoleDef): Course {
  const segs: Seg[] = [];
  const blocks: Course['blocks'] = [];
  let border: Pt[] = [];
  hole.walls.forEach((w, obj) => {
    const n = w.pts.length;
    const count = w.closed ? n : n - 1;
    for (let i = 0; i < count; i++) {
      const a = w.pts[i];
      const b = w.pts[(i + 1) % n];
      segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], obj, inner: w.kind === 'inner', thick: 0 });
    }
    if (w.kind === 'border') border = w.pts;
    else if (w.closed) blocks.push({ obj, pts: w.pts });
  });
  const zones: Zone[] = hole.zones.map((z) => {
    if (z.circle) {
      const [cx, cy, r] = z.circle;
      return { ...z, minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
    }
    const xs = z.poly!.map((p) => p[0]);
    const ys = z.poly!.map((p) => p[1]);
    return { ...z, minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  });
  const c: Course = { hole, segs, zones, border, blocks, dist: new Float32Array(0), gw: 0, gh: 0 };
  buildDistance(c);
  return c;
}

/** Segments of the moving obstacles at game time t, with the velocity of each blade. */
export function moverSegs(hole: HoleDef, t: number): Seg[] {
  const out: Seg[] = [];
  hole.movers.forEach((m, i) => {
    const obj = MOVER_OBJ + i;
    if (m.type === 'windmill') {
      for (let b = 0; b < m.blades; b++) {
        const a = m.speed * t + (b * Math.PI * 2) / m.blades;
        out.push({
          ax: m.x, ay: m.y, bx: m.x + Math.cos(a) * m.len, by: m.y + Math.sin(a) * m.len,
          obj, inner: true, thick: PHYS.bladeThick, spin: { cx: m.x, cy: m.y, w: m.speed },
        });
      }
    } else {
      const w = (Math.PI * 2) / m.period;
      const s = Math.sin(w * t);
      const v = Math.cos(w * t) * w;
      out.push({
        ax: m.a[0] + m.travel[0] * s, ay: m.a[1] + m.travel[1] * s,
        bx: m.b[0] + m.travel[0] * s, by: m.b[1] + m.travel[1] * s,
        obj, inner: true, thick: PHYS.sliderThick, vx: m.travel[0] * v, vy: m.travel[1] * v,
      });
    }
  });
  return out;
}

export type Mods = { wind: Pt | null; magnet: boolean; ghost: boolean };
export const NO_MODS: Mods = { wind: null, magnet: false, ghost: false };

export type Roll = {
  x: number; y: number; vx: number; vy: number;
  /** Game time of the next frame of this roll. */
  t: number;
  rollT: number;
  restT: number;
  /** Ghost Ball still unused this shot. */
  ghost: boolean;
  /** The object the ghost is passing through (ignored for the rest of the shot). */
  ghostObj: number;
  inSand: boolean;
  /** Over the cup right now, too fast to drop (slowed as it rolls out). */
  onLip: boolean;
  status: 'roll' | 'stop' | 'sunk' | 'water' | 'out';
};

export type RollEvent =
  | { type: 'wall'; x: number; y: number; speed: number; mover: boolean }
  | { type: 'sand'; x: number; y: number }
  | { type: 'ghost'; x: number; y: number }
  | { type: 'lip'; x: number; y: number };

export function startRoll(x: number, y: number, angle: number, power: number, t: number, mods: Mods): Roll {
  const sp = Math.max(0, Math.min(1, power)) * PHYS.maxSpeed;
  return { x, y, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp, t, rollT: 0, restT: 0, ghost: mods.ghost, ghostObj: -1, inSand: false, onLip: false, status: 'roll' };
}

/** Advance one 1/60 s frame (in fixed substeps). Pushes events when given an array. */
export function rollFrame(c: Course, r: Roll, dt: number, mods: Mods, events?: RollEvent[]): void {
  if (r.status !== 'roll') return;
  const n = PHYS.substeps;
  const h = dt / n;
  const R = PHYS.ballR;
  const [cupX, cupY] = c.hole.cup;
  for (let i = 0; i < n && r.status === 'roll'; i++) {
    const tt = r.t + i * h;
    // --- forces
    let ax = 0;
    let ay = 0;
    let surface = PHYS.grass;
    let sand = false;
    let slope = false;
    for (const z of c.zones) {
      if (!inZone(z, r.x, r.y)) continue;
      if (z.type === 'water') {
        r.status = 'water';
        r.vx = r.vy = 0;
        return;
      }
      if (z.type === 'sand') {
        surface = PHYS.sand;
        sand = true;
      } else if (z.type === 'slope' && z.accel) {
        ax += z.accel[0];
        ay += z.accel[1];
        slope = Math.hypot(z.accel[0], z.accel[1]) > PHYS.grass.decel;
      } else if (z.type === 'bowl' && z.circle) {
        const dx = z.circle[0] - r.x;
        const dy = z.circle[1] - r.y;
        const d = Math.hypot(dx, dy) || 1;
        ax += (dx / d) * (z.pull ?? 150);
        ay += (dy / d) * (z.pull ?? 150);
        slope = true;
      }
    }
    if (sand && !r.inSand) events?.push({ type: 'sand', x: r.x, y: r.y });
    r.inSand = sand;
    if (mods.wind) {
      ax += mods.wind[0];
      ay += mods.wind[1];
    }
    const cdx = cupX - r.x;
    const cdy = cupY - r.y;
    const cd = Math.hypot(cdx, cdy);
    if (mods.magnet && cd < PHYS.magnet.radius && cd > 0.01) {
      ax += (cdx / cd) * PHYS.magnet.pull;
      ay += (cdy / cd) * PHYS.magnet.pull;
      slope = true;
    }
    if (cd < PHYS.cupR && cd > 0.01) {
      ax += (cdx / cd) * PHYS.lipPull;
      ay += (cdy / cd) * PHYS.lipPull;
    }
    r.vx += ax * h;
    r.vy += ay * h;
    // --- rolling resistance
    let sp = Math.hypot(r.vx, r.vy);
    if (sp > 0) {
      const ns = sp - (surface.decel + surface.drag * sp) * h;
      const k = ns > 0 ? ns / sp : 0;
      r.vx *= k;
      r.vy *= k;
    }
    // --- move and collide
    r.x += r.vx * h;
    r.y += r.vy * h;
    const movers = c.hole.movers.length ? moverSegs(c.hole, tt) : null;
    let touching = false;
    for (let pass = 0; pass < 2; pass++) {
      if (collideList(c.segs, r, R, events)) touching = true;
      if (movers && collideList(movers, r, R, events)) touching = true;
    }
    // Safety net: a ball that somehow left the course counts as out of bounds.
    if (c.border.length && !pointInPoly(r.x, r.y, c.border)) {
      r.status = 'out';
      r.vx = r.vy = 0;
      return;
    }
    // --- cup
    sp = Math.hypot(r.vx, r.vy);
    const cd2 = Math.hypot(cupX - r.x, cupY - r.y);
    const capR = PHYS.cupR;
    const capV = mods.magnet ? PHYS.magnet.captureSpeed : PHYS.captureSpeed;
    if (cd2 < capR * 0.75 && sp < capV) {
      r.status = 'sunk';
      r.x = cupX;
      r.y = cupY;
      r.vx = r.vy = 0;
      return;
    }
    if (cd2 < capR && sp >= capV && !r.onLip) {
      r.onLip = true;
      if (events && !events.some((e) => e.type === 'lip')) events.push({ type: 'lip', x: r.x, y: r.y });
    } else if (cd2 >= capR && r.onLip) {
      // It rattled over the cup and lips out, slowed, so it often stops close.
      r.onLip = false;
      r.vx *= PHYS.lipKeep;
      r.vy *= PHYS.lipKeep;
    }
    // --- rest
    r.rollT += h;
    if (sp < PHYS.stopSpeed && (!slope || touching)) {
      r.restT += h;
      if (r.restT > 0.1 || !slope) {
        r.vx = r.vy = 0;
        r.status = 'stop';
      }
    } else if (sp < PHYS.stopSpeed * 3 && touching) {
      r.restT += h;
      if (r.restT > 0.6) {
        r.vx = r.vy = 0;
        r.status = 'stop';
      }
    } else r.restT = 0;
    if (r.rollT >= PHYS.maxRoll) {
      r.vx = r.vy = 0;
      r.status = 'stop';
    }
  }
  r.t += dt;
  if (r.status === 'stop') settleOutOfBlocks(c, r);
}

function collideList(segs: Seg[], r: Roll, R: number, events?: RollEvent[]): boolean {
  let hit = false;
  for (const s of segs) {
    if (s.obj === r.ghostObj) continue;
    const reach = R + s.thick;
    // Cheap bounding-box reject.
    if (r.x < Math.min(s.ax, s.bx) - reach || r.x > Math.max(s.ax, s.bx) + reach) continue;
    if (r.y < Math.min(s.ay, s.by) - reach || r.y > Math.max(s.ay, s.by) + reach) continue;
    const [qx, qy] = closest(s.ax, s.ay, s.bx, s.by, r.x, r.y);
    let nx = r.x - qx;
    let ny = r.y - qy;
    const d = Math.hypot(nx, ny);
    if (d >= reach) continue;
    if (r.ghost && s.inner) {
      // Ghost Ball: pass through this whole wall (or obstacle) for the rest of the shot.
      r.ghost = false;
      r.ghostObj = s.obj;
      events?.push({ type: 'ghost', x: r.x, y: r.y });
      continue;
    }
    if (d < 1e-6) {
      // Dead centre on the line: push back along the velocity.
      const v = Math.hypot(r.vx, r.vy) || 1;
      nx = -r.vx / v;
      ny = -r.vy / v;
    } else {
      nx /= d;
      ny /= d;
    }
    r.x = qx + nx * reach;
    r.y = qy + ny * reach;
    // Velocity of the wall at the contact point (moving obstacles).
    let wvx = s.vx ?? 0;
    let wvy = s.vy ?? 0;
    if (s.spin) {
      wvx = -s.spin.w * (qy - s.spin.cy);
      wvy = s.spin.w * (qx - s.spin.cx);
    }
    const rvx = r.vx - wvx;
    const rvy = r.vy - wvy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const e = s.thick > 0 ? PHYS.moverRestitution : PHYS.restitution;
      r.vx -= (1 + e) * vn * nx;
      r.vy -= (1 + e) * vn * ny;
      const sp = Math.min(PHYS.maxSpeed, Math.hypot(r.vx, r.vy));
      if (-vn > 40) events?.push({ type: 'wall', x: qx, y: qy, speed: -vn, mover: s.thick > 0 });
      const v = Math.hypot(r.vx, r.vy);
      if (v > PHYS.maxSpeed) {
        r.vx *= sp / v;
        r.vy *= sp / v;
      }
    }
    hit = true;
  }
  return hit;
}

/** After a ghost shot a ball may stop inside a solid block: nudge it to the nearest edge. */
function settleOutOfBlocks(c: Course, r: Roll): void {
  for (const b of c.blocks) {
    if (!pointInPoly(r.x, r.y, b.pts)) continue;
    let best: [number, number] = [r.x, r.y];
    let bd = Infinity;
    let bn: [number, number] = [0, 0];
    for (let i = 0; i < b.pts.length; i++) {
      const a = b.pts[i];
      const e = b.pts[(i + 1) % b.pts.length];
      const q = closest(a[0], a[1], e[0], e[1], r.x, r.y);
      const d = Math.hypot(q[0] - r.x, q[1] - r.y);
      if (d < bd) {
        bd = d;
        best = q;
        // Outward normal: from the polygon centroid toward the edge point.
        const cx = b.pts.reduce((s, p) => s + p[0], 0) / b.pts.length;
        const cy = b.pts.reduce((s, p) => s + p[1], 0) / b.pts.length;
        const l = Math.hypot(q[0] - cx, q[1] - cy) || 1;
        bn = [(q[0] - cx) / l, (q[1] - cy) / l];
      }
    }
    r.x = best[0] + bn[0] * (PHYS.ballR + 1);
    r.y = best[1] + bn[1] * (PHYS.ballR + 1);
  }
}

export type SimResult = { roll: Roll; path: Pt[]; frames: number };

/**
 * Run a whole shot to the end (or until the path reaches maxLen units).
 * Used by the bot to judge a shot and by the view's aim guide.
 */
export function simulate(c: Course, x: number, y: number, angle: number, power: number, t: number, mods: Mods, dt: number, maxLen = Infinity): SimResult {
  const r = startRoll(x, y, angle, power, t, mods);
  const path: Pt[] = [[x, y]];
  let len = 0;
  let frames = 0;
  const maxFrames = Math.ceil(PHYS.maxRoll / dt) + 2;
  while (r.status === 'roll' && frames < maxFrames) {
    const px = r.x;
    const py = r.y;
    rollFrame(c, r, dt, mods);
    frames++;
    len += Math.hypot(r.x - px, r.y - py);
    if (maxLen < Infinity) {
      path.push([r.x, r.y]);
      if (len >= maxLen) break;
    }
  }
  return { roll: r, path, frames };
}

// ---------- path distance field (bot judgement) ----------

function buildDistance(c: Course): void {
  const gw = Math.ceil(360 / GRID);
  const gh = Math.ceil(640 / GRID);
  const n = gw * gh;
  const cost = new Float32Array(n);
  const R = PHYS.ballR + 1;
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = i * GRID + GRID / 2;
      const y = j * GRID + GRID / 2;
      let k = 1;
      if (c.border.length && !pointInPoly(x, y, c.border)) k = -1;
      for (const b of c.blocks) if (k > 0 && pointInPoly(x, y, b.pts)) k = -1;
      if (k > 0) {
        for (const s of c.segs) {
          const [qx, qy] = closest(s.ax, s.ay, s.bx, s.by, x, y);
          if (Math.hypot(qx - x, qy - y) < R) {
            k = -1;
            break;
          }
        }
      }
      if (k > 0) {
        for (const z of c.zones) {
          if (!inZone(z, x, y)) continue;
          if (z.type === 'water') k = -1;
          else if (z.type === 'sand') k = Math.max(k, 2.5);
        }
      }
      cost[j * gw + i] = k;
    }
  }
  const dist = new Float32Array(n).fill(Infinity);
  const ci = Math.min(gw - 1, Math.max(0, Math.floor(c.hole.cup[0] / GRID)));
  const cj = Math.min(gh - 1, Math.max(0, Math.floor(c.hole.cup[1] / GRID)));
  // Dijkstra on a small grid with a simple binary heap.
  const heap: [number, number][] = [];
  const push = (d: number, idx: number) => {
    heap.push([d, idx]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const rr = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (rr < heap.length && heap[rr][0] < heap[m][0]) m = rr;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const start = cj * gw + ci;
  dist[start] = 0;
  push(0, start);
  const nbr = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length) {
    const [d, idx] = pop();
    if (d > dist[idx]) continue;
    const i = idx % gw;
    const j = (idx - i) / gw;
    for (const [di, dj, w] of nbr) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
      const nidx = nj * gw + ni;
      const k = cost[nidx];
      if (k < 0) continue;
      const nd = d + w * GRID * k;
      if (nd < dist[nidx]) {
        dist[nidx] = nd;
        // Queue the stored (float32) value: queueing the float64 `nd` made the
        // `d > dist[idx]` check above skip most cells, so the field stopped
        // spreading and bots misjudged whole regions of a hole.
        push(dist[nidx], nidx);
      }
    }
  }
  c.dist = dist;
  c.gw = gw;
  c.gh = gh;
}

/** Walking distance from (x, y) to the cup around walls and water. */
export function pathDist(c: Course, x: number, y: number): number {
  const i = Math.floor(x / GRID);
  const j = Math.floor(y / GRID);
  let best = Infinity;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= c.gw || nj >= c.gh) continue;
      const d = c.dist[nj * c.gw + ni] + Math.hypot(di, dj) * GRID;
      if (d < best) best = d;
    }
  }
  return best === Infinity ? 9999 : best;
}
