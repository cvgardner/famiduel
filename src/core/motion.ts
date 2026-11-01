// Motion check: records a moving thing (a bot's paddle, say) frame by frame and
// scores how a person would see it move. People can't reverse a finger many times
// a second or shake it on the spot, so a bot that does looks "spazzy" even when it
// plays fair. Pure, no DOM, so the unit tests can hold every bot to a limit.

export type MotionReport = {
  seconds: number;
  /** Average speed, units per second. */
  speed: number;
  /** Direction flips per second: velocity on an axis going from clearly + to clearly - (or back). */
  flipsPerSec: number;
  /** Twitches per second: a flip that undoes the last one on that axis within `twitchGap` seconds. */
  twitchesPerSec: number;
  /** Share of moving frames whose acceleration is beyond what a finger can do. */
  harshShare: number;
  /** Share of time spent in short back-and-forth wobble (path much longer than the ground covered). */
  wobbleShare: number;
};

export const MOTION = {
  /** A flip counts only when the speed on that axis is above this before and after. */
  flipSpeed: 90,
  /** Two flips this close together on one axis are a twitch (faster than ~3 per second each way). */
  twitchGap: 0.18,
  /** A finger can't change velocity faster than this (units/s²); more is a snap. */
  harshAccel: 14000,
  /** Wobble windows: this long, path at least `wobbleRatio` × the net move and at least `wobbleMin` units. */
  wobbleWindow: 0.5,
  wobbleRatio: 2.2,
  wobbleMin: 40,
};

export class MotionTrace {
  private xs: number[] = [];
  private ys: number[] = [];
  private dts: number[] = [];

  record(x: number, y: number, dt: number): void {
    this.xs.push(x);
    this.ys.push(y);
    this.dts.push(dt);
  }

  /** Drop the history (a goal reset teleports the paddle home, which isn't motion). */
  cut(): MotionReport {
    const r = this.report();
    this.xs = [];
    this.ys = [];
    this.dts = [];
    return r;
  }

  report(): MotionReport {
    const n = this.xs.length;
    const out: MotionReport = { seconds: 0, speed: 0, flipsPerSec: 0, twitchesPerSec: 0, harshShare: 0, wobbleShare: 0 };
    if (n < 3) return out;
    let seconds = 0;
    let path = 0;
    let flips = 0;
    let twitches = 0;
    let harsh = 0;
    let moving = 0;
    const sign: [number, number] = [0, 0];
    const lastFlip: [number, number] = [-1, -1];
    let pvx = 0;
    let pvy = 0;
    const seg: number[] = [0];
    for (let i = 1; i < n; i++) {
      const dt = this.dts[i];
      seconds += dt;
      const dx = this.xs[i] - this.xs[i - 1];
      const dy = this.ys[i] - this.ys[i - 1];
      const d = Math.hypot(dx, dy);
      path += d;
      seg.push(seg[i - 1] + d);
      const vx = dx / dt;
      const vy = dy / dt;
      if (i > 1) {
        const a = Math.hypot(vx - pvx, vy - pvy) / dt;
        if (Math.hypot(vx, vy) > 20 || Math.hypot(pvx, pvy) > 20) {
          moving++;
          if (a > MOTION.harshAccel) harsh++;
        }
      }
      pvx = vx;
      pvy = vy;
      [vx, vy].forEach((v, axis) => {
        const s = v > MOTION.flipSpeed ? 1 : v < -MOTION.flipSpeed ? -1 : 0;
        if (s === 0) return;
        if (sign[axis] !== 0 && s !== sign[axis]) {
          flips++;
          if (lastFlip[axis] >= 0 && seconds - lastFlip[axis] < MOTION.twitchGap) twitches++;
          lastFlip[axis] = seconds;
        }
        sign[axis] = s;
      });
    }
    // Wobble: slide a window along the trace.
    let wob = 0;
    let wobT = 0;
    let j = 0;
    let tAcc = 0;
    const times: number[] = [0];
    for (let i = 1; i < n; i++) times.push(times[i - 1] + this.dts[i]);
    for (let i = 1; i < n; i++) {
      while (times[i] - times[j] > MOTION.wobbleWindow) j++;
      if (times[i] - times[j] < MOTION.wobbleWindow * 0.8) continue;
      tAcc += this.dts[i];
      const p = seg[i] - seg[j];
      const net = Math.hypot(this.xs[i] - this.xs[j], this.ys[i] - this.ys[j]);
      if (p > MOTION.wobbleMin && p > MOTION.wobbleRatio * net) wob += this.dts[i];
    }
    wobT = tAcc;
    out.seconds = seconds;
    out.speed = path / seconds;
    out.flipsPerSec = flips / seconds;
    out.twitchesPerSec = twitches / seconds;
    out.harshShare = moving ? harsh / moving : 0;
    out.wobbleShare = wobT ? wob / wobT : 0;
    return out;
  }
}

/** Time-weighted average of several reports (one per rally). */
export function mergeReports(rs: MotionReport[]): MotionReport {
  const T = rs.reduce((a, r) => a + r.seconds, 0) || 1;
  const avg = (k: keyof MotionReport) => rs.reduce((a, r) => a + r[k] * r.seconds, 0) / T;
  return {
    seconds: T,
    speed: avg('speed'),
    flipsPerSec: avg('flipsPerSec'),
    twitchesPerSec: avg('twitchesPerSec'),
    harshShare: avg('harshShare'),
    wobbleShare: avg('wobbleShare'),
  };
}
