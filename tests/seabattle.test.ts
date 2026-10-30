import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerIndex } from '../src/core/types';
import { cellsOf, MARK, N, SeaBattle, SeaBattleBot, SHIPS, strikeCells } from '../src/games/seabattle/logic';
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
        g.apply({ kind: 'fire', cell: g.open(p)[0] });
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
});
