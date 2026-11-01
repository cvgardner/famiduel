import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerIndex } from '../src/core/types';
import { other } from '../src/core/types';
import { cellsOf, MARK, N, radarCells, SeaBattle, SeaBattleBot, SHIPS, strikeCells } from '../src/games/seabattle/logic';
import { player, power } from './helpers';

function setup(opts: { powers?: [string, string]; assist?: [number, number]; seed?: number } = {}) {
  const pw = (p: PlayerIndex) => (opts.powers ? power('seabattle', opts.powers[p]) : null);
  const g = new SeaBattle(
    [player({ power: pw(0), assist: opts.assist?.[0] ?? 0 }), player({ power: pw(1), assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    makeRng(opts.seed ?? 1),
  );
  return g;
}

function play(levels: [BotLevel, BotLevel], seed: number, opts: { powers?: [string, string]; assist?: [number, number] } = {}) {
  const rng = makeRng(seed);
  const pw = (p: PlayerIndex) => (opts.powers ? power('seabattle', opts.powers[p]) : null);
  const g = new SeaBattle(
    [player({ bot: levels[0], power: pw(0), assist: opts.assist?.[0] ?? 0 }), player({ bot: levels[1], power: pw(1), assist: opts.assist?.[1] ?? 0 })],
    !!opts.powers,
    rng,
  );
  const bots = [new SeaBattleBot(0, levels[0], rng), new SeaBattleBot(1, levels[1], rng)];
  bots[0].place(g);
  bots[1].place(g);
  let actions = 0;
  const powersUsed = [0, 0];
  while (g.winner === null && actions < 1000) {
    const p = g.turn;
    const m = bots[p].choose(g);
    expect(g.apply(m)).toBe(true);
    if (m.kind !== 'fire') powersUsed[p]++;
    actions++;
  }
  return { g, actions, powersUsed };
}

/** Put player p's fleet in rows 0..4, each ship starting at x = 0, horizontal. */
function lineUp(g: SeaBattle, p: PlayerIndex) {
  g.seas[p].ships.forEach((s, i) => Object.assign(s, { x: 0, y: i, horiz: true, hits: 0 }));
  g.seas[p].occ.fill(-1);
  g.seas[p].ships.forEach((s, i) => cellsOf(s).forEach((c) => (g.seas[p].occ[c] = i)));
}

function start(g: SeaBattle, first: PlayerIndex = 0) {
  g.setReady(0);
  g.setReady(1);
  g.turn = first;
  g.shotsLeft = 1;
}

describe('sea battle', () => {
  it('random fleets are legal: 5 ships, 17 cells, no overlap', () => {
    const g = setup({ seed: 9 });
    for (const p of [0, 1] as PlayerIndex[]) {
      const sea = g.seas[p];
      expect(sea.ships.map((s) => s.len)).toEqual([...SHIPS]);
      expect([...sea.occ].filter((v) => v >= 0)).toHaveLength(17);
      sea.ships.forEach((s, i) => cellsOf(s).forEach((c) => expect(sea.occ[c]).toBe(i)));
    }
  });

  it('placement: move and rotate stay legal, no overlaps', () => {
    const g = setup();
    lineUp(g, 0);
    expect(g.setShip(0, 4, 0, 0, true)).toBe(false); // on top of the carrier
    expect(g.setShip(0, 4, 8, 9, true)).toBe(true);
    expect(g.setShip(0, 4, 9, 9, true)).toBe(false); // off the sea
    // Rotating the patrol boat at the bottom edge slides it up to fit.
    expect(g.rotateShip(0, 4)).toBe(true);
    expect(g.seas[0].ships[4]).toMatchObject({ x: 8, y: 8, horiz: false });
    g.setReady(0);
    expect(g.setShip(0, 4, 5, 9, true)).toBe(false); // locked once ready
  });

  it('bot vs bot always sinks a whole fleet', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { g, actions } = play(['normal', 'normal'], seed);
      expect(g.winner).not.toBeNull();
      expect(g.score[g.winner!]).toBe(5);
      expect(actions).toBeLessThan(200);
    }
  });

  it('is deterministic for a seed', () => {
    const a = play(['hard', 'easy'], 7, { powers: ['radar', 'mine'] });
    const b = play(['hard', 'easy'], 7, { powers: ['radar', 'mine'] });
    expect(a.g.score).toEqual(b.g.score);
    expect(a.actions).toBe(b.actions);
  });

  it('a hard bot beats an easy bot most of the time', () => {
    let wins = 0;
    for (let s = 0; s < 10; s++) {
      const hardSeat = (s % 2) as PlayerIndex;
      const lv: [BotLevel, BotLevel] = hardSeat === 0 ? ['hard', 'easy'] : ['easy', 'hard'];
      if (play(lv, 200 + s).g.winner === hardSeat) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(7);
  });

  it('the bot never peeks: its shots depend only on what it can see', () => {
    // Same seed, same knowledge, different hidden enemy fleets → same first shot.
    const shots = [5, 6].map((fleetSeed) => {
      const g = setup({ seed: fleetSeed });
      start(g, 0);
      const bot = new SeaBattleBot(0, 'hard', makeRng(42));
      return bot.choose(g);
    });
    expect(shots[0]).toEqual(shots[1]);
  });

  it('extra shots: the assisted player gets 2 shots every N turns', () => {
    const g = setup({ assist: [3, 0] });
    start(g, 1);
    const shotsPerTurn: number[] = [];
    for (let t = 0; t < 8; t++) {
      const p = g.turn;
      let n = 0;
      while (g.turn === p && g.winner === null) {
        // Fire at water: a hit would earn another shot and blur the bonus count.
        const water = g.open(p).find((c) => g.seas[other(p)].occ[c] < 0)!;
        g.apply({ kind: 'fire', cell: water });
        n++;
      }
      if (p === 0) shotsPerTurn.push(n);
    }
    expect(shotsPerTurn).toEqual([1, 2, 1, 2]); // every 2nd turn at assist 3
    const plain = setup();
    start(plain, 0);
    plain.apply({ kind: 'fire', cell: 0 });
    expect(plain.turn).toBe(1);
  });

  it('a hit fires again; a miss, a mine or an airstrike passes the turn', () => {
    // Chris, 2026-11-01: rules must match the ones kids know, e.g. an extra shot on a hit.
    const g = setup({ powers: ['airstrike', 'mine'] });
    lineUp(g, 1);
    lineUp(g, 0);
    start(g, 0);
    // Row 0 is player 1's carrier: hit, hit, hit and still player 0's turn.
    for (const c of [0, 1, 2]) {
      expect(g.apply({ kind: 'fire', cell: c })).toBe(true);
      expect(g.events.some((e) => e.type === 'again')).toBe(true);
      expect(g.turn).toBe(0);
      expect(g.shotsLeft).toBe(1);
    }
    // Sinking a ship is a hit too: the patrol boat (row 4, x 0..1).
    g.apply({ kind: 'fire', cell: 4 * N });
    g.apply({ kind: 'fire', cell: 4 * N + 1 });
    expect(g.score[0]).toBe(1);
    expect(g.turn).toBe(0);
    // A miss ends the turn.
    g.apply({ kind: 'fire', cell: 9 * N + 9 });
    expect(g.events.some((e) => e.type === 'again')).toBe(false);
    expect(g.turn).toBe(1);
    // A mine is not a ship: firing on one passes the turn (and hits back).
    g.turn = 0;
    g.shotsLeft = 1;
    g.seas[1].mines.add(8 * N + 8);
    g.apply({ kind: 'fire', cell: 8 * N + 8 });
    expect(g.turn).toBe(1);
    // An airstrike that hits still ends the turn (it is already 5 shots).
    g.turn = 0;
    g.shotsLeft = 1;
    g.energy[0].value = 1;
    expect(g.apply({ kind: 'airstrike', cell: 1 * N + 2 })).toBe(true);
    expect(g.events.filter((e) => e.type === 'shot' && e.result === 'hit').length).toBeGreaterThan(0);
    expect(g.turn).toBe(1);
  });

  it('a hit keeps a bonus shot: hit on the first of 2 shots still leaves 2', () => {
    const g = setup({ assist: [3, 0] });
    lineUp(g, 1);
    start(g, 0);
    g.shotsLeft = 2;
    g.apply({ kind: 'fire', cell: 0 }); // hit
    expect(g.shotsLeft).toBe(2);
    g.apply({ kind: 'fire', cell: 9 * N + 9 }); // miss
    expect(g.turn).toBe(0);
    expect(g.shotsLeft).toBe(1);
    g.apply({ kind: 'fire', cell: 9 * N + 8 }); // miss
    expect(g.turn).toBe(1);
  });

  it('bot vs bot with hit-again: shooters chain hits in every match', () => {
    let chained = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { g } = play(['hard', 'hard'], 500 + seed);
      expect(g.winner).not.toBeNull();
      chained += g.turnNo[0] + g.turnNo[1] < g.shotsFired[0] + g.shotsFired[1] ? 1 : 0;
    }
    expect(chained).toBe(6);
  });

  it('sinking every ship wins; hits charge energy', () => {
    const g = setup();
    lineUp(g, 1);
    start(g, 0);
    let fired = 0;
    for (const s of g.seas[1].ships)
      for (const c of cellsOf(s)) {
        g.turn = 0;
        g.shotsLeft = 1;
        g.apply({ kind: 'fire', cell: c });
        fired++;
      }
    expect(fired).toBe(17);
    expect(g.winner).toBe(0);
    expect(g.score[0]).toBe(5);
    expect(g.energy[0].value).toBe(1);
  });

  it('radar tells whether a ship is in the 3×3 box, and you still fire after', () => {
    const g = setup({ powers: ['radar', 'radar'] });
    lineUp(g, 1);
    start(g, 0);
    g.energy[0].value = 1;
    expect(g.apply({ kind: 'radar', cell: 8 * N + 5 })).toBe(true);
    expect(g.radar[0][0].found).toBe(false);
    expect(g.turn).toBe(0);
    const kn = g.knowledge(0);
    expect(kn.k[8 * N + 5]).toBe(1); // known water
    g.energy[0].value = 1;
    expect(g.apply({ kind: 'radar', cell: 1 * N + 1 })).toBe(false); // once per turn
    g.apply({ kind: 'fire', cell: 99 });
    expect(g.turn).toBe(1);
    g.turn = 0;
    g.usedFree.clear();
    expect(g.apply({ kind: 'radar', cell: 1 * N + 1 })).toBe(true);
    expect(g.radar[0][1].found).toBe(true);
  });

  it('airstrike hits 5 cells of a row as one shot', () => {
    const g = setup({ powers: ['airstrike', 'radar'] });
    lineUp(g, 1);
    start(g, 0);
    g.energy[0].value = 1;
    expect(strikeCells(0)).toEqual([0, 1, 2, 3, 4]);
    expect(g.apply({ kind: 'airstrike', cell: 2 })).toBe(true);
    expect(g.seas[1].ships[0].hits).toBe(5);
    expect(g.score[0]).toBe(1); // carrier sunk in one strike
    expect(g.turn).toBe(1);
    g.turn = 0;
    expect(g.apply({ kind: 'airstrike', cell: 12 })).toBe(false); // bar empty
  });

  it('hit-back mine: firing on it hits one of your own ships, never sinking it', () => {
    const g = setup({ powers: ['radar', 'mine'] });
    lineUp(g, 0);
    lineUp(g, 1);
    start(g, 1);
    g.energy[1].value = 1;
    expect(g.apply({ kind: 'mine', cell: 0 })).toBe(false); // on a ship
    expect(g.apply({ kind: 'mine', cell: 9 * N + 9 })).toBe(true);
    g.apply({ kind: 'fire', cell: 99 - 1 });
    expect(g.turn).toBe(0);
    g.apply({ kind: 'fire', cell: 99 });
    expect(g.seas[1].marks[99]).toBe(MARK.mine);
    const hitsOn0 = g.seas[0].ships.reduce((t, s) => t + s.hits, 0);
    expect(hitsOn0).toBe(1);
    expect(g.seas[0].ships.every((s) => s.hits < s.len)).toBe(true);
    // The mine layer can see the hit on the enemy fleet.
    expect([...g.knowledge(1).k].filter((v) => v === 2)).toHaveLength(1);
  });

  it('bots use their powers and still finish', () => {
    for (const powers of [['radar', 'airstrike'], ['mine', 'radar'], ['airstrike', 'mine']] as [string, string][]) {
      const { g, powersUsed } = play(['normal', 'hard'], 13, { powers });
      expect(g.winner).not.toBeNull();
      expect(powersUsed[0] + powersUsed[1]).toBeGreaterThan(0);
    }
  });

  it('every bot level follows up its own radar contact', () => {
    for (const lv of ['easy', 'normal', 'hard'] as BotLevel[])
      for (let seed = 1; seed <= 20; seed++) {
        const g = setup({ seed });
        start(g, 0);
        const centre = 6 * N + 6;
        g.radar[0].push({ cell: centre, found: true });
        const m = new SeaBattleBot(0, lv, makeRng(seed)).choose(g);
        expect(m.kind).toBe('fire');
        expect(radarCells(centre)).toContain(m.cell);
      }
  });

  it('no seat bias: mirrored bots win about half the time from either seat', () => {
    // Backlog 2026-10-31: a 200-game sim showed 58% for player 1. 2000 games per level
    // gave 49-50% for every level, so it was noise; this pins it.
    for (const lv of ['easy', 'normal'] as BotLevel[]) {
      let p1 = 0;
      const n = 300;
      for (let s = 0; s < n; s++) if (play([lv, lv], 3000 + s).g.winner === 1) p1++;
      expect(p1 / n).toBeGreaterThan(0.42);
      expect(p1 / n).toBeLessThan(0.58);
    }
  });
});

describe('sea battle: the bot\'s shot stays on screen', () => {
  it('holds longer on a hit and longest on a sinking, never under a beat', async () => {
    const { botBeat } = await import('../src/games/seabattle/beat');
    const miss = botBeat({ hits: 0, misses: 1, sunk: 0 });
    const hit = botBeat({ hits: 1, misses: 0, sunk: 0 });
    const sunk = botBeat({ hits: 1, misses: 0, sunk: 1 });
    expect(miss).toBeGreaterThanOrEqual(0.8);
    expect(hit).toBeGreaterThanOrEqual(1.5);
    expect(sunk).toBeGreaterThan(hit);
    expect(sunk).toBeLessThanOrEqual(2.5); // a kid shouldn't wait long either
  });

  it('names what the bot did, and only says "your" for your own fleet', async () => {
    const { botResultTitle } = await import('../src/games/seabattle/beat');
    expect(botResultTitle('Bot', { hits: 0, misses: 1, sunk: 0 })).toBe('Bot missed!');
    expect(botResultTitle('Bot', { hits: 1, misses: 0, sunk: 0 })).toBe('Bot hit your ship!');
    expect(botResultTitle('Bot', { hits: 1, misses: 0, sunk: 0 }, false)).toBe('Bot hit a ship!');
    expect(botResultTitle('Bot', { hits: 3, misses: 2, sunk: 0 })).toBe('Bot hit 3 times!');
    expect(botResultTitle('Bot', { hits: 2, misses: 0, sunk: 1 })).toBe('Bot sank a ship!');
  });

  it('the view starts the beat when the last shell lands, not when the bot fires', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/games/seabattle/index.ts', 'utf8');
    expect(src).toMatch(/if \(busy\) m\.t = 0;\s*else if \(m\.t > botBeat\(this\.turnLog\[m\.p\]\)\) this\.advance\(\);/);
  });
});
