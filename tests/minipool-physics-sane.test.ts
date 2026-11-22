import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { NO_MODS, PHYS, POCKETS, stepTable, strike, TABLE, type Ball, type PhysEvent, type ShotMods } from '../src/games/minipool/physics';
import { DT } from './helpers';

// F404: a rival pool game's reviews say its "physics [are] a bit wacky". Mini Pool's own
// tests only check the break; this plays hundreds of seeded full-power shots from random
// layouts (every power's table mods too) and checks what a player would call wacky: a ball
// through a cushion or off the cloth, balls left sitting inside each other, or a table that
// gains speed from nowhere.
const SLACK = 0.5; // units a ball may sit past a cushion within a frame before the next bounce
const KINDS: Ball['kind'][] = ['cue', 0, 0, 0, 1, 1, 1, 'eight'];

function layout(rng: ReturnType<typeof makeRng>): Ball[] {
  const r = PHYS.r;
  const balls: Ball[] = [];
  for (const kind of KINDS) {
    for (let tries = 0; tries < 500; tries++) {
      const x = rng.range(TABLE.left + r, TABLE.right - r);
      const y = rng.range(TABLE.top + r, TABLE.bottom - r);
      if (balls.some((b) => Math.hypot(b.x - x, b.y - y) < 2 * r + 1)) continue;
      if (POCKETS.some((pk) => Math.hypot(pk.x - x, pk.y - y) < 30)) continue;
      balls.push({ id: balls.length, kind, x, y, vx: 0, vy: 0, on: true });
      break;
    }
  }
  return balls;
}

const energy = (balls: Ball[]) => balls.reduce((s, b) => s + (b.on ? b.vx * b.vx + b.vy * b.vy : 0), 0);

function play(seed: number, mods: ShotMods) {
  const rng = makeRng(seed);
  const balls = layout(rng);
  strike(balls, rng.range(-Math.PI, Math.PI), rng.range(0.85, 1));
  const out: PhysEvent[] = [];
  let worstOut = 0;
  let grew = 0;
  let frames = 0;
  let e = energy(balls);
  while (balls.some((b) => b.on && (b.vx || b.vy)) && frames < PHYS.maxRoll * 60) {
    out.length = 0;
    stepTable(balls, DT, mods, out);
    frames++;
    for (const b of balls) {
      if (!b.on) continue;
      const past = Math.max(TABLE.left + PHYS.r - b.x, b.x - (TABLE.right - PHYS.r), TABLE.top + PHYS.r - b.y, b.y - (TABLE.bottom - PHYS.r));
      worstOut = Math.max(worstOut, past);
    }
    const e2 = energy(balls);
    if (e2 > e * 1.0001 + 1e-6) grew++;
    e = e2;
  }
  const on = balls.filter((b) => b.on);
  let worstOverlap = 0;
  for (let i = 0; i < on.length; i++)
    for (let j = i + 1; j < on.length; j++) worstOverlap = Math.max(worstOverlap, 2 * PHYS.r - Math.hypot(on[i].x - on[j].x, on[i].y - on[j].y));
  return { worstOut, worstOverlap, grew, frames };
}

const MODS: [string, ShotMods][] = [
  ['no power', NO_MODS],
  ['big pockets', { pocketBonus: 6, frozenId: null }],
  ['freeze', { pocketBonus: 0, frozenId: 4 }],
  ['plug', { pocketBonus: 0, frozenId: null, closed: 0 }],
  ['stop shot', { pocketBonus: 0, frozenId: null, stop: true }],
];

describe('mini pool physics stay sane on hard shots from any layout (F404)', () => {
  for (const [name, mods] of MODS) {
    it(name, () => {
      let worstOut = 0;
      let worstOverlap = 0;
      let grew = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const r = play(seed, mods);
        worstOut = Math.max(worstOut, r.worstOut);
        worstOverlap = Math.max(worstOverlap, r.worstOverlap);
        grew += r.grew;
        expect(r.frames, `seed ${seed} rolled to the time limit`).toBeLessThan(PHYS.maxRoll * 60);
      }
      expect(worstOut).toBeLessThanOrEqual(SLACK);
      expect(worstOverlap).toBeLessThan(0.5);
      expect(grew).toBe(0);
    });
  }
});
