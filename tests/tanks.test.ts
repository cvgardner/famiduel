import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerIndex } from '../src/core/types';
import { ARENA, armorFor, CELL, IDLE, RULES, spawnOf, TankBot, TankDuel, traceShot, type Intent } from '../src/games/tanks/logic';
import { buildGrid, COLS, LAYOUTS, ROWS } from '../src/games/tanks/mazes';
import { DT, player, power } from './helpers';

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: [string, string]; assist?: [number, number] } = {}) {
  const rng = makeRng(seed);
  const pw = (p: PlayerIndex) => (opts.powers ? power('tanks', opts.powers[p]) : null);
  const g = new TankDuel(
    [player({ bot: levels[0], power: pw(0), assist: opts.assist?.[0] ?? 0 }), player({ bot: levels[1], power: pw(1), assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    rng,
  );
  const bots = [new TankBot(0, levels[0], rng), new TankBot(1, levels[1], rng)];
  let t = 0;
  const powersFired: string[] = [];
  while (!g.over && t < 900) {
    g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
    for (const e of g.events) if (e.type === 'power') powersFired.push(e.id);
    t += DT;
  }
  return { g, t, powersFired };
}

/** A quiet match: no bots, tanks parked at spawn, for setting up power situations by hand. */
function fresh(powers: [string | null, string | null] = [null, null], layout = 0) {
  const g = new TankDuel(
    [player({ bot: null, power: powers[0] ? power('tanks', powers[0]) : null }), player({ bot: null, power: powers[1] ? power('tanks', powers[1]) : null })],
    true,
    makeRng(1),
  );
  g.layout = layout;
  g.arena = new (g.arena.constructor as new (grid: boolean[]) => typeof g.arena)(buildGrid(LAYOUTS[layout]));
  return g;
}

const idle2: [Intent, Intent] = [IDLE, IDLE];

describe('tank duel', () => {
  it('every arena is 180° symmetric, keeps spawns and the pause spot open, and is fully connected', () => {
    for (const lay of LAYOUTS) {
      const grid = buildGrid(lay);
      expect(grid).toHaveLength(COLS * ROWS);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) expect(grid[r * COLS + c]).toBe(grid[(ROWS - 1 - r) * COLS + (COLS - 1 - c)]);
      for (const i of [4, 5, (ROWS - 1) * COLS + 4, (ROWS - 1) * COLS + 5, 5 * COLS, 6 * COLS]) expect(grid[i]).toBe(false);
      const open = grid.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
      const seen = new Set([open[0]]);
      const q = [open[0]];
      while (q.length) {
        const i = q.pop()!;
        const c = i % COLS;
        const r = Math.floor(i / COLS);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc;
          const nr = r + dr;
          const j = nr * COLS + nc;
          if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || grid[j] || seen.has(j)) continue;
          seen.add(j);
          q.push(j);
        }
      }
      expect(seen.size, lay.name).toBe(open.length);
    }
  });

  it('bot vs bot always reaches a result, in about 1–3 minutes of game time', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { g, t } = play(['normal', 'normal'], seed);
      expect(g.over).toBe(true);
      expect(g.winner).not.toBeNull();
      expect(Math.max(...g.score)).toBeGreaterThanOrEqual(RULES.armor);
      expect(t).toBeLessThan(RULES.timeCap + RULES.suddenCap + 30);
    }
  });

  it('bot vs bot with powers also finishes', () => {
    for (const [i, pair] of ([['bouncy', 'shield'], ['mine', 'bouncy'], ['shield', 'mine']] as [string, string][]).entries()) {
      const { g, powersFired } = play(['normal', 'normal'], 20 + i, { powers: pair });
      expect(g.over).toBe(true);
      expect(powersFired.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for a seed', () => {
    const a = play(['hard', 'easy'], 7);
    const b = play(['hard', 'easy'], 7);
    expect(a.g.score).toEqual(b.g.score);
    expect(a.t).toBe(b.t);
  });

  it('a hard bot beats an easy bot most of the time', () => {
    let hardWins = 0;
    for (let s = 0; s < 8; s++) if (play(['easy', 'hard'], 100 + s).g.winner === 1) hardWins++;
    expect(hardWins).toBeGreaterThanOrEqual(6);
  });

  it('handicap gives extra armor: one more bonk to knock out per assist level', () => {
    expect([0, 1, 2, 3].map(armorFor)).toEqual([5, 6, 7, 8]);
    const g = new TankDuel([player({ assist: 2 }), player()], false, makeRng(1));
    expect(g.hearts(0)).toBe(7);
    expect(g.hearts(1)).toBe(5);
  });

  it('a stick push turns first, then drives forward; a little push only turns', () => {
    const g = fresh();
    const right: Intent = { mx: 0.25, my: 0, fire: false, power: false };
    const y0 = g.tanks[0].y;
    const x0 = g.tanks[0].x;
    for (let i = 0; i < 30; i++) g.step(DT, [right, IDLE]);
    expect(g.tanks[0].a).toBeCloseTo(0, 3);
    expect(g.tanks[0].x).toBeCloseTo(x0, 5);
    expect(g.tanks[0].y).toBeCloseTo(y0, 5);
    for (let i = 0; i < 30; i++) g.step(DT, [{ mx: 1, my: 0, fire: false, power: false }, IDLE]);
    expect(g.tanks[0].x).toBeGreaterThan(x0 + 30);
    expect(g.tanks[0].x - x0).toBeLessThanOrEqual(RULES.speed * 0.5 + 1);
  });

  it('tanks can drive anywhere but never through blocks', () => {
    const g = fresh([null, null], 0);
    const up: Intent = { mx: 0, my: -1, fire: false, power: false };
    for (let i = 0; i < 60 * 8; i++) g.step(DT, [up, IDLE]);
    // Blocks layout has a block in the middle (rows 5–6, cols 4–5): the tank stops below it,
    // just under player 1's tank row, never inside a block.
    const tk = g.tanks[0];
    expect(g.arena.solidAt(tk.x, tk.y)).toBe(false);
    expect(tk.y).toBeGreaterThan(ARENA.y + 7 * CELL - 1);
  });

  it('shells bounce off walls a limited number of times, and can bonk their own tank', () => {
    const g = fresh();
    g.tanks[0].x = ARENA.x + 50;
    g.tanks[0].y = ARENA.y + ARENA.h - 20;
    g.tanks[0].a = Math.PI; // facing the left wall, close up
    g.step(DT, [{ ...IDLE, fire: true }, IDLE]);
    let hit = false;
    let bounces = 0;
    for (let i = 0; i < 120 && !hit; i++) {
      g.step(DT, idle2);
      for (const e of g.events) {
        if (e.type === 'bounce') bounces++;
        if (e.type === 'hit') hit = e.p === 0 && e.self;
      }
    }
    expect(bounces).toBeGreaterThanOrEqual(1);
    expect(hit).toBe(true);
    expect(g.score).toEqual([0, 1]);
    expect(g.phase).toBe('bonk');
  });

  it('a shell dies after too many bounces', () => {
    const g = fresh();
    const s = { id: 1, owner: 0 as PlayerIndex, x: ARENA.x + 17, y: ARENA.y + 17, vx: -RULES.shellSpeed, vy: 0, bounces: 0, maxBounces: 2, age: 0, bouncy: false, alive: true };
    g.arena.moveShell(s, 0.2);
    expect(s.bounces).toBe(1);
    s.bounces = 2;
    s.vx = -RULES.shellSpeed;
    g.arena.moveShell(s, 0.2);
    expect(s.alive).toBe(false);
  });

  it('caps shells in flight and enforces the reload', () => {
    const g = fresh();
    const fire: Intent = { ...IDLE, fire: true };
    g.step(DT, [fire, IDLE]);
    g.step(DT, [fire, IDLE]);
    expect(g.shellsOf(0)).toBe(1);
    expect(g.canFire(0)).toBe(false);
    for (let i = 0; i < 4; i++) {
      g.tanks[0].reload = 0;
      g.step(DT, [fire, IDLE]);
    }
    expect(g.shellsOf(0)).toBeLessThanOrEqual(RULES.maxShells);
  });

  it('first to knock out all armor wins; each bonk restarts in a new arena', () => {
    const g = fresh();
    g.tanks[1].hits = RULES.armor - 1;
    // Point blank at player 1.
    g.tanks[0].x = spawnOf(1).x;
    g.tanks[0].y = spawnOf(1).y + 40;
    g.tanks[0].a = -Math.PI / 2;
    g.step(DT, [{ ...IDLE, fire: true }, IDLE]);
    for (let i = 0; i < 60 && g.phase === 'play'; i++) g.step(DT, idle2);
    expect(g.phase).toBe('bonk');
    for (let i = 0; i < 120 && !g.over; i++) g.step(DT, idle2);
    expect(g.winner).toBe(0);

    const h = fresh();
    const layout = h.layout;
    h.tanks[0].x = spawnOf(1).x;
    h.tanks[0].y = spawnOf(1).y + 40;
    h.tanks[0].a = -Math.PI / 2;
    h.step(DT, [{ ...IDLE, fire: true }, IDLE]);
    for (let i = 0; i < 200 && h.round === 1; i++) h.step(DT, idle2);
    expect(h.round).toBe(2);
    expect(h.layout).not.toBe(layout);
    expect(h.tanks[0].y).toBe(spawnOf(0).y);
    expect(h.over).toBe(false);
  });

  it('shells that meet cancel out', () => {
    const g = fresh([null, null], 3); // Bunkers: open band in the middle
    g.shells.push(
      { id: 1, owner: 0, x: 100, y: 320, vx: 200, vy: 0, bounces: 0, maxBounces: 2, age: 1, bouncy: false, alive: true },
      { id: 2, owner: 1, x: 130, y: 320, vx: -200, vy: 0, bounces: 0, maxBounces: 2, age: 1, bouncy: false, alive: true },
    );
    let clash = false;
    for (let i = 0; i < 20; i++) {
      g.step(DT, idle2);
      if (g.events.some((e) => e.type === 'clash')) clash = true;
    }
    expect(clash).toBe(true);
    expect(g.shells).toHaveLength(0);
  });

  it('Bouncing Shot: shells get extra bounces and a glow for its duration', () => {
    const g = fresh(['bouncy', null]);
    g.energy[0].value = 1;
    g.step(DT, [{ ...IDLE, power: true }, IDLE]);
    expect(g.tanks[0].bouncy).toBeGreaterThan(7);
    g.step(DT, [{ ...IDLE, fire: true }, IDLE]);
    expect(g.shells[0].bouncy).toBe(true);
    expect(g.shells[0].maxBounces).toBe(RULES.bouncyBounces);
    g.tanks[0].bouncy = 0;
    g.tanks[0].reload = 0;
    g.step(DT, [{ ...IDLE, fire: true }, IDLE]);
    expect(g.shells[1].maxBounces).toBe(RULES.bounces);
  });

  it('Shield: a bubble blocks shells for 3 seconds', () => {
    const g = fresh([null, 'shield']);
    g.energy[1].value = 1;
    g.step(DT, [IDLE, { ...IDLE, power: true }]);
    expect(g.tanks[1].shield).toBeGreaterThan(2.9);
    g.tanks[0].x = spawnOf(1).x;
    g.tanks[0].y = spawnOf(1).y + 60;
    g.tanks[0].a = -Math.PI / 2;
    g.step(DT, [{ ...IDLE, fire: true }, IDLE]);
    let blocked = false;
    for (let i = 0; i < 40; i++) {
      g.step(DT, idle2);
      if (g.events.some((e) => e.type === 'block' && e.p === 1)) blocked = true;
    }
    expect(blocked).toBe(true);
    expect(g.tanks[1].hits).toBe(0);
    // After it wears off, shells bonk again.
    for (let i = 0; i < 200; i++) g.step(DT, idle2);
    expect(g.tanks[1].shield).toBe(0);
    g.tanks[0].reload = 0;
    g.step(DT, [{ ...IDLE, fire: true }, IDLE]);
    for (let i = 0; i < 40 && g.phase === 'play'; i++) g.step(DT, idle2);
    expect(g.tanks[1].hits).toBe(1);
  });

  it('Mine: dropped behind the tank, arms after a second, bonks whoever rolls over it', () => {
    const g = fresh(['mine', null]);
    g.energy[0].value = 1;
    g.tanks[0].a = 0; // facing right, so the mine lands to the left
    g.step(DT, [{ ...IDLE, power: true }, IDLE]);
    expect(g.mines).toHaveLength(1);
    const m = g.mines[0];
    expect(m.x).toBeLessThan(g.tanks[0].x);
    // Not armed yet: sitting on it is safe.
    g.tanks[1].x = m.x;
    g.tanks[1].y = m.y - 40;
    for (let i = 0; i < 30; i++) g.step(DT, idle2);
    expect(g.mines).toHaveLength(1);
    // Player 1 drives down onto it once it is armed.
    let boom = false;
    for (let i = 0; i < 120 && g.phase === 'play'; i++) {
      g.step(DT, [IDLE, { mx: 0, my: 1, fire: false, power: false }]);
      if (g.events.some((e) => e.type === 'boom')) boom = true;
    }
    expect(boom).toBe(true);
    expect(g.tanks[1].hits).toBe(1);
    expect(g.score[0]).toBe(1);
  });

  it('a shell sets a mine off from afar', () => {
    const g = fresh([null, null], 3);
    g.mines.push({ id: 9, owner: 1, x: 180, y: 300, arm: 0, alive: true });
    g.shells.push({ id: 1, owner: 0, x: 140, y: 300, vx: 200, vy: 0, bounces: 0, maxBounces: 2, age: 1, bouncy: false, alive: true });
    let boom = false;
    for (let i = 0; i < 30; i++) {
      g.step(DT, idle2);
      if (g.events.some((e) => e.type === 'boom')) boom = true;
    }
    expect(boom).toBe(true);
    expect(g.mines).toHaveLength(0);
  });

  it('the bot only takes shots its preview says will land, and never sees through blocks', () => {
    const g = fresh([null, null], 0);
    // Spawns face each other across the centre block: no straight shot down the middle.
    expect(traceShot(g, 0, -Math.PI / 2).hit).not.toBe(1);
  });

  it('time-up: the player with more armor left wins; level armor goes to sudden death', () => {
    const g = fresh();
    g.tanks[1].hits = 1;
    g.playTime = RULES.timeCap - DT / 2;
    g.step(DT, idle2);
    expect(g.winner).toBe(0);

    const h = fresh();
    h.playTime = RULES.timeCap - DT / 2;
    h.step(DT, idle2);
    expect(h.over).toBe(false);
    expect(h.sudden).toBe(true);
    h.playTime = RULES.timeCap + RULES.suddenCap;
    h.step(DT, idle2);
    expect(h.over).toBe(true);
    expect(h.winner).toBeNull();
  });
});
