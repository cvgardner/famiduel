// A swipe sweep for Ping Pong: plays a grid of human-like finger gestures (direction,
// length, speed, timing) through the same finger → paddle mapping the view uses, against
// incoming balls of different speeds and positions, and tallies which shot each made.
// Used by tests/pingpong-swipes.test.ts and `npm run swipes` (prints the table).
import { makeRng } from '../src/core/rng';
import { FingerPaddle, PingPong, RULES, type Intent } from '../src/games/pingpong/logic';
import { player } from './helpers';

const DT = 1 / 60;

export type Outcome = 'smash' | 'curve' | 'drive' | 'block' | 'chop' | 'miss';
export type Gesture = { family: Family; angle: number; len: number; dur: number; at: number };
export type Family = 'hold' | 'push' | 'hard push' | 'sideways' | 'diagonal';

/** What each family of gesture is meant to make. */
export const INTENDED: Record<Family, Outcome> = {
  hold: 'block',
  push: 'drive',
  'hard push': 'smash',
  sideways: 'curve',
  diagonal: 'curve',
};

export function outcomeOf(shot: string, spin: number): Outcome {
  if (shot === 'smash') return 'smash';
  if (Math.abs(spin) >= RULES.curveCall) return 'curve';
  return shot as Outcome;
}

/** The gesture grid: a spread of what people actually do with a finger. */
export function gestures(): Gesture[] {
  const out: Gesture[] = [];
  const add = (family: Family, angles: number[], lens: number[], durs: number[]) => {
    for (const angle of angles) for (const len of lens) for (const dur of durs) for (const at of [0.6, 0.85, 1]) out.push({ family, angle, len, dur, at });
  };
  add('hold', [0], [0], [0.1]);
  // A world unit is about 0.2 mm on a phone, so a casual 1–2 cm push is 50–100 units.
  add('push', [0, 15, -15], [40, 60, 80, 100], [0.15, 0.22, 0.3]);
  add('hard push', [0, 12, -12], [120, 160, 220], [0.07, 0.1, 0.14]);
  add('sideways', [70, 90, -70, -90], [60, 100, 150, 200], [0.1, 0.16, 0.25]);
  add('diagonal', [40, -40, 55, -55], [80, 120, 170], [0.1, 0.16, 0.25]);
  return out;
}

/** Play one gesture against one incoming ball; returns what came off the paddle. */
export function playSwipe(gst: Gesture, ballX: number, speed: number, seed: number): { outcome: Outcome; spin: number; speed: number } {
  const g = new PingPong([player({ bot: null }), player({ bot: null })], false, makeRng(seed));
  g.serveT = 0;
  g.pointT = 0;
  const b = g.ball;
  b.x = ballX;
  b.y = g.faceY(1);
  b.vx = 0;
  b.vy = speed;
  b.fromY = b.y;
  b.toY = g.homeFaceY(0);
  const finger = new FingerPaddle(0);
  const rad = (gst.angle * Math.PI) / 180;
  const sx = Math.sin(rad) * gst.len;
  const sy = -Math.cos(rad) * gst.len; // toward the net is up the screen for the bottom player
  const restY = 575;
  // The person lines the swipe up so the paddle crosses the ball `at` of the way through it.
  const x0 = ballX - sx * gst.at;
  // When the ball would reach the paddle at home: the person times the swipe from that.
  const tHome = (g.homeFaceY(0) - (b.y + RULES.ballR)) / speed;
  const start = tHome - gst.dur * gst.at;
  let t = 0;
  for (let i = 0; i < 400; i++) {
    // Before the swipe the finger waits at x0; then it moves in a straight line for `dur`.
    const u = gst.len === 0 ? 0 : Math.min(1, Math.max(0, (t - start) / gst.dur));
    const fx = x0 + sx * u;
    const fy = restY + sy * u;
    const me: Intent = { tx: fx, ty: RULES.paddleY[0] - finger.lunge({ id: 1, y: fy }, DT), power: false };
    g.step(DT, [me, { tx: g.paddles[1].x, power: false }]);
    t += DT;
    for (const e of g.events) {
      if (e.type === 'hit' && e.p === 0) return { outcome: outcomeOf(e.shot, e.spin), spin: e.spin, speed: e.speed };
      if (e.type === 'point') return { outcome: 'miss', spin: 0, speed: 0 };
    }
  }
  return { outcome: 'miss', spin: 0, speed: 0 };
}

export type Tally = Record<Outcome, number>;
const empty = (): Tally => ({ smash: 0, curve: 0, drive: 0, block: 0, chop: 0, miss: 0 });

/** Runs the whole grid: per family and overall outcome counts. */
export function sweep(): { byFamily: Record<Family, Tally>; all: Tally; n: number } {
  const byFamily = {} as Record<Family, Tally>;
  const all = empty();
  let n = 0;
  let seed = 1;
  for (const gst of gestures()) {
    for (const ballX of [110, 180, 250]) {
      for (const speed of [420, 560, 700]) {
        const r = playSwipe(gst, ballX, speed, seed++);
        (byFamily[gst.family] ??= empty())[r.outcome]++;
        all[r.outcome]++;
        n++;
      }
    }
  }
  return { byFamily, all, n };
}

export function table(): string {
  const { byFamily, all } = sweep();
  const cols: Outcome[] = ['smash', 'curve', 'drive', 'block', 'chop', 'miss'];
  const row = (name: string, t: Tally) => {
    const tot = cols.reduce((a, c) => a + t[c], 0);
    return name.padEnd(10) + cols.map((c) => `${Math.round((100 * t[c]) / tot)}%`.padStart(7)).join('') + `   (${tot})`;
  };
  const lines = ['gesture   ' + cols.map((c) => c.padStart(7)).join(''), ...Object.entries(byFamily).map(([f, t]) => row(f, t)), row('ALL', all)];
  return lines.join('\n');
}
