// Sea Battle rules: pure and deterministic, so tests can run whole matches.
// Each player hides 5 ships on a 10×10 sea, then players take turns firing.
// Cells are numbered i = y * N + x.
import { Energy } from '../../core/energy';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';

export const N = 10;
export const SHIPS = [5, 4, 3, 3, 2] as const;
export const SHIP_NAMES = ['Carrier', 'Battleship', 'Cruiser', 'Submarine', 'Patrol boat'];

export const RULES = {
  energyHit: 0.2,
  energySink: 0.15,
  energyMiss: 0.03,
  energyHitTaken: 0.06,
  airstrikeLen: 5,
  /** Extra shot every N of your turns, by assist 0..3 (0 = never). */
  extraEvery: [0, 4, 3, 2],
  /** Classic house rule: a shot that hits a ship lets you fire again (not an airstrike). */
  hitAgain: true,
};

export type Ship = { len: number; x: number; y: number; horiz: boolean; hits: number };

/** Marks on a sea: what has been fired at it. */
export const MARK = { none: 0, miss: 1, hit: 2, mine: 3 } as const;

export type Sea = {
  ships: Ship[];
  /** Ship index per cell, -1 is water. */
  occ: Int8Array;
  marks: Uint8Array;
  mines: Set<number>;
};

export type Move =
  | { kind: 'fire'; cell: number }
  | { kind: 'airstrike'; cell: number }
  | { kind: 'radar'; cell: number }
  | { kind: 'mine'; cell: number };

export type Event =
  | { type: 'shot'; a: PlayerIndex; cell: number; result: 'hit' | 'miss' | 'mine' }
  | { type: 'sunk'; a: PlayerIndex; ship: number; cells: number[] }
  | { type: 'hitBack'; victim: PlayerIndex; cell: number }
  | { type: 'radar'; a: PlayerIndex; cell: number; found: boolean }
  | { type: 'mine'; p: PlayerIndex; cell: number }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'turn'; p: PlayerIndex; shots: number }
  /** A plain shot hit a ship, so the shooter fires again. */
  | { type: 'again'; p: PlayerIndex }
  | { type: 'win'; p: PlayerIndex };

export const cellsOf = (s: Pick<Ship, 'len' | 'x' | 'y' | 'horiz'>): number[] =>
  Array.from({ length: s.len }, (_, k) => (s.y + (s.horiz ? 0 : k)) * N + s.x + (s.horiz ? k : 0));

export const fits = (len: number, x: number, y: number, horiz: boolean) =>
  x >= 0 && y >= 0 && (horiz ? x + len <= N && y < N : y + len <= N && x < N);

/** The 3×3 radar box around a cell (kept inside the sea). */
export function radarCells(cell: number): number[] {
  const cx = Math.min(N - 2, Math.max(1, cell % N));
  const cy = Math.min(N - 2, Math.max(1, Math.floor(cell / N)));
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push((cy + dy) * N + cx + dx);
  return out;
}

/** The airstrike span: 5 cells of the row, centred on the cell (kept inside the sea). */
export function strikeCells(cell: number): number[] {
  const y = Math.floor(cell / N);
  const x0 = Math.min(N - RULES.airstrikeLen, Math.max(0, (cell % N) - 2));
  return Array.from({ length: RULES.airstrikeLen }, (_, k) => y * N + x0 + k);
}

function emptySea(): Sea {
  return { ships: SHIPS.map((len) => ({ len, x: 0, y: 0, horiz: true, hits: 0 })), occ: new Int8Array(N * N).fill(-1), marks: new Uint8Array(N * N), mines: new Set() };
}

export const isSunk = (s: Ship) => s.hits >= s.len;

/** What an attacker knows about the enemy sea: exactly what a person could see. */
export type Knowledge = {
  /** 0 unknown, 1 water (miss, mine or radar-empty), 2 hit on a ship still afloat, 3 sunk ship. */
  k: Uint8Array;
  /** Lengths of enemy ships still afloat (sinking a ship is announced). */
  remaining: number[];
  /** Radar boxes that found a ship and still hold unknown cells. */
  hot: number[][];
};

export class SeaBattle {
  phase: 'place' | 'fire' | 'over' = 'place';
  seas: [Sea, Sea] = [emptySea(), emptySea()];
  ready: [boolean, boolean] = [false, false];
  turn: PlayerIndex = 0;
  /** Who fired first this match (null while fleets are being placed). */
  firstShooter: PlayerIndex | null = null;
  shotsLeft = 1;
  /** Turns started per player (for the extra-shot handicap). */
  turnNo: [number, number] = [0, 0];
  /** Radar results per attacker. */
  radar: [{ cell: number; found: boolean }[], { cell: number; found: boolean }[]] = [[], []];
  /** Free actions used this turn. */
  usedFree = new Set<string>();
  energy: [Energy, Energy];
  winner: PlayerIndex | null = null;
  /** Ships each player has sunk. */
  score: [number, number] = [0, 0];
  shotsFired: [number, number] = [0, 0];
  events: Event[] = [];

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    readonly powersOn: boolean,
    private readonly rng: Rng,
    /** Who fires first once both fleets are ready; undefined = coin toss. */
    private readonly starter?: PlayerIndex,
  ) {
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    this.placeRandom(0);
    this.placeRandom(1);
  }

  powerOf(p: PlayerIndex): string | null {
    return this.powersOn ? (this.players[p].power?.id ?? null) : null;
  }

  // ---------- placement ----------

  canPlace(p: PlayerIndex, i: number, x: number, y: number, horiz: boolean): boolean {
    const sea = this.seas[p];
    const len = sea.ships[i].len;
    if (!fits(len, x, y, horiz)) return false;
    return cellsOf({ len, x, y, horiz }).every((c) => sea.occ[c] === -1 || sea.occ[c] === i);
  }

  setShip(p: PlayerIndex, i: number, x: number, y: number, horiz: boolean): boolean {
    if (this.phase !== 'place' || this.ready[p] || !this.canPlace(p, i, x, y, horiz)) return false;
    const sea = this.seas[p];
    const s = sea.ships[i];
    for (const c of cellsOf(s)) if (sea.occ[c] === i) sea.occ[c] = -1;
    Object.assign(s, { x, y, horiz });
    for (const c of cellsOf(s)) sea.occ[c] = i;
    return true;
  }

  /** Turn a ship in place; if it no longer fits, slide it back along its new direction. */
  rotateShip(p: PlayerIndex, i: number): boolean {
    const s = this.seas[p].ships[i];
    const h = !s.horiz;
    for (let back = 0; back < s.len; back++) {
      const x = h ? s.x - back : s.x;
      const y = h ? s.y : s.y - back;
      if (this.setShip(p, i, x, y, h)) return true;
    }
    return false;
  }

  /** Random legal fleet from the rng. Ships never touch, so the sea looks tidy. */
  placeRandom(p: PlayerIndex): void {
    if (this.phase !== 'place' || this.ready[p]) return;
    for (let attempt = 0; attempt < 200; attempt++) {
      const sea = emptySea();
      const near = new Uint8Array(N * N);
      let ok = true;
      for (let i = 0; i < SHIPS.length && ok; i++) {
        ok = false;
        for (let k = 0; k < 300; k++) {
          const horiz = this.rng.chance(0.5);
          const len = SHIPS[i];
          const x = this.rng.int(0, horiz ? N - len : N - 1);
          const y = this.rng.int(0, horiz ? N - 1 : N - len);
          const cells = cellsOf({ len, x, y, horiz });
          if (cells.some((c) => near[c])) continue;
          Object.assign(sea.ships[i], { x, y, horiz });
          for (const c of cells) {
            sea.occ[c] = i;
            const cx = c % N;
            const cy = Math.floor(c / N);
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++) if (cx + dx >= 0 && cx + dx < N && cy + dy >= 0 && cy + dy < N) near[(cy + dy) * N + cx + dx] = 1;
          }
          ok = true;
          break;
        }
      }
      if (ok) {
        this.seas[p] = sea;
        return;
      }
    }
  }

  setReady(p: PlayerIndex): void {
    if (this.phase !== 'place') return;
    this.ready[p] = true;
    if (this.ready[0] && this.ready[1]) {
      this.phase = 'fire';
      const coin: PlayerIndex = this.rng.chance(0.5) ? 0 : 1;
      this.firstShooter = this.starter ?? coin;
      this.startTurn(this.firstShooter);
    }
  }

  // ---------- firing ----------

  private extraShot(p: PlayerIndex): boolean {
    const every = RULES.extraEvery[Math.max(0, Math.min(3, Math.round(this.players[p].assist)))];
    return every > 0 && this.turnNo[p] % every === 0;
  }

  private startTurn(p: PlayerIndex): void {
    this.turn = p;
    this.turnNo[p]++;
    this.shotsLeft = this.extraShot(p) ? 2 : 1;
    this.usedFree.clear();
    this.events.push({ type: 'turn', p, shots: this.shotsLeft });
  }

  canUsePower(p: PlayerIndex, id: string): boolean {
    if (this.phase !== 'fire' || this.turn !== p || this.powerOf(p) !== id || !this.energy[p].ready) return false;
    return !this.usedFree.has(id);
  }

  /** Cells of the enemy sea the attacker has not fired at yet. */
  open(a: PlayerIndex): number[] {
    const m = this.seas[other(a)].marks;
    const out: number[] = [];
    for (let i = 0; i < N * N; i++) if (m[i] === MARK.none) out.push(i);
    return out;
  }

  apply(m: Move): boolean {
    this.events = [];
    if (this.phase !== 'fire' || m.cell < 0 || m.cell >= N * N) return false;
    const a = this.turn;
    const d = other(a);
    const enemy = this.seas[d];
    if (m.kind === 'radar') {
      if (!this.canUsePower(a, 'radar')) return false;
      this.energy[a].spend();
      this.usedFree.add('radar');
      const box = radarCells(m.cell);
      const found = box.some((c) => enemy.occ[c] >= 0 && !isSunk(enemy.ships[enemy.occ[c]]) && enemy.marks[c] !== MARK.hit);
      this.radar[a].push({ cell: box[4], found });
      this.events.push({ type: 'power', p: a, id: 'radar' }, { type: 'radar', a, cell: box[4], found });
      return true;
    }
    if (m.kind === 'mine') {
      if (!this.canUsePower(a, 'mine')) return false;
      const own = this.seas[a];
      if (own.occ[m.cell] >= 0 || own.marks[m.cell] !== MARK.none || own.mines.has(m.cell)) return false;
      this.energy[a].spend();
      this.usedFree.add('mine');
      own.mines.add(m.cell);
      this.events.push({ type: 'power', p: a, id: 'mine' }, { type: 'mine', p: a, cell: m.cell });
      return true;
    }
    if (m.kind === 'airstrike') {
      if (!this.canUsePower(a, 'airstrike')) return false;
      const cells = strikeCells(m.cell).filter((c) => enemy.marks[c] === MARK.none);
      if (!cells.length) return false;
      this.energy[a].spend();
      this.events.push({ type: 'power', p: a, id: 'airstrike' });
      for (const c of cells) {
        this.shoot(a, c, false);
        if (this.winner !== null) return true;
      }
    } else {
      if (enemy.marks[m.cell] !== MARK.none) return false;
      this.shoot(a, m.cell);
      if (this.winner !== null) return true;
      if (RULES.hitAgain && enemy.marks[m.cell] === MARK.hit) {
        // Hit: same turn, same shots left. Free powers already used stay used.
        this.events.push({ type: 'again', p: a });
        return true;
      }
    }
    this.shotsLeft--;
    if (this.shotsLeft <= 0) this.startTurn(d);
    return true;
  }

  /** charge = false for airstrike hits, so a power never refills itself. */
  private shoot(a: PlayerIndex, cell: number, charge = true): void {
    const d = other(a);
    const sea = this.seas[d];
    this.shotsFired[a]++;
    const si = sea.occ[cell];
    const trailing = this.score[a] < this.score[d];
    const k = charge ? 1 : 0;
    if (si >= 0) {
      sea.marks[cell] = MARK.hit;
      const ship = sea.ships[si];
      ship.hits++;
      this.events.push({ type: 'shot', a, cell, result: 'hit' });
      this.energy[a].charge(RULES.energyHit * k, trailing);
      this.energy[d].charge(RULES.energyHitTaken, true);
      if (isSunk(ship)) {
        this.score[a]++;
        this.energy[a].charge(RULES.energySink * k, trailing);
        this.events.push({ type: 'sunk', a, ship: si, cells: cellsOf(ship) });
        if (sea.ships.every(isSunk)) {
          this.winner = a;
          this.phase = 'over';
          this.events.push({ type: 'win', p: a });
        }
      }
      return;
    }
    if (sea.mines.has(cell)) {
      sea.mines.delete(cell);
      sea.marks[cell] = MARK.mine;
      this.events.push({ type: 'shot', a, cell, result: 'mine' });
      this.hitBack(a);
      return;
    }
    sea.marks[cell] = MARK.miss;
    this.events.push({ type: 'shot', a, cell, result: 'miss' });
    this.energy[a].charge(RULES.energyMiss * k, trailing);
  }

  /** The mine fires back: one of the attacker's ship cells is hit. It never sinks a ship. */
  private hitBack(victim: PlayerIndex): void {
    const sea = this.seas[victim];
    const cells: number[] = [];
    sea.ships.forEach((s, i) => {
      if (s.len - s.hits < 2) return;
      for (const c of cellsOf(s)) if (sea.occ[c] === i && sea.marks[c] === MARK.none) cells.push(c);
    });
    if (!cells.length) return;
    const c = this.rng.pick(cells);
    sea.marks[c] = MARK.hit;
    sea.ships[sea.occ[c]].hits++;
    this.events.push({ type: 'hitBack', victim, cell: c });
  }

  knowledge(a: PlayerIndex): Knowledge {
    const sea = this.seas[other(a)];
    const k = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const m = sea.marks[i];
      if (m === MARK.miss || m === MARK.mine) k[i] = 1;
      else if (m === MARK.hit) k[i] = isSunk(sea.ships[sea.occ[i]]) ? 3 : 2;
    }
    const hot: number[][] = [];
    for (const r of this.radar[a]) {
      const box = radarCells(r.cell);
      if (!r.found) {
        for (const c of box) if (k[c] === 0) k[c] = 1;
      } else hot.push(box);
    }
    const remaining = sea.ships.filter((s) => !isSunk(s)).map((s) => s.len);
    return { k, remaining, hot: hot.filter((b) => b.some((c) => k[c] === 0)) };
  }
}

// ---------- Honest bot: hunt (checkerboard parity) then target around hits ----------
// It only reads knowledge(): the marks a person would see, sunk ships, and its own radar.
const BOT = {
  easy: { forget: 0.45, parity: false, density: false, think: 1.0 },
  normal: { forget: 0.05, parity: true, density: false, think: 0.8 },
  hard: { forget: 0, parity: true, density: true, think: 0.7 },
} satisfies Record<BotLevel, { forget: number; parity: boolean; density: boolean; think: number }>;

/** How many enemy ship placements (consistent with what is known) cover each cell. */
export function density(kn: Knowledge, targetOnly: boolean): Float64Array {
  const score = new Float64Array(N * N);
  for (const len of kn.remaining)
    for (const horiz of [true, false])
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          if (!fits(len, x, y, horiz)) continue;
          const cells = cellsOf({ len, x, y, horiz });
          let hits = 0;
          let bad = false;
          for (const c of cells) {
            const v = kn.k[c];
            if (v === 1 || v === 3) {
              bad = true;
              break;
            }
            if (v === 2) hits++;
          }
          if (bad || (targetOnly && hits === 0)) continue;
          let w = targetOnly ? 1 + hits * 4 : 1;
          if (!targetOnly) for (const box of kn.hot) if (cells.some((c) => box.includes(c))) w *= 3;
          for (const c of cells) if (kn.k[c] === 0) score[c] += w;
        }
  return score;
}

export class SeaBattleBot {
  readonly think: number;

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {
    this.think = BOT[level].think;
  }

  /** Place the fleet: a fresh random layout, then ready. */
  place(game: SeaBattle): void {
    game.placeRandom(this.p);
    game.setReady(this.p);
  }

  private best(cells: number[], score: Float64Array): number {
    let top = -1;
    let pick: number[] = [];
    for (const c of cells) {
      if (score[c] > top) {
        top = score[c];
        pick = [c];
      } else if (score[c] === top) pick.push(c);
    }
    return this.rng.pick(pick);
  }

  /** The next action on the bot's turn (power first when it is worth it, then a shot). */
  choose(game: SeaBattle): Move {
    const cfg = BOT[this.level];
    const kn = game.knowledge(this.p);
    const unknown: number[] = [];
    for (let i = 0; i < N * N; i++) if (kn.k[i] === 0) unknown.push(i);
    const open = game.open(this.p);
    const targeting = kn.k.some((v) => v === 2);
    const pw = game.powerOf(this.p);
    if (pw && game.canUsePower(this.p, pw)) {
      const m = this.powerMove(game, pw, kn, targeting);
      if (m) return m;
    }
    // Nothing unknown left (radar marked the rest as water): fire at any open cell.
    if (!unknown.length) return { kind: 'fire', cell: this.rng.pick(open) };
    if (targeting && !(cfg.forget && this.rng.chance(cfg.forget))) {
      if (cfg.density) return { kind: 'fire', cell: this.best(unknown, density(kn, true)) };
      const cands = this.targetCells(kn);
      if (cands.length) return { kind: 'fire', cell: this.rng.pick(cands) };
    }
    if (cfg.density) return { kind: 'fire', cell: this.best(unknown, density(kn, false)) };
    if (cfg.parity) {
      const minLen = Math.min(...kn.remaining);
      let pool = unknown.filter((c) => ((c % N) + Math.floor(c / N)) % minLen === 0);
      const hotCells = pool.filter((c) => kn.hot.some((b) => b.includes(c)));
      if (hotCells.length) pool = hotCells;
      if (pool.length) return { kind: 'fire', cell: this.rng.pick(pool) };
    }
    // Every level follows up its own radar contact: a person who saw "found!" would.
    const hotCells = unknown.filter((c) => kn.hot.some((b) => b.includes(c)));
    if (hotCells.length) return { kind: 'fire', cell: this.rng.pick(hotCells) };
    return { kind: 'fire', cell: this.rng.pick(unknown) };
  }

  /** Classic targeting: extend a line of hits, else try the four neighbours of a hit. */
  private targetCells(kn: Knowledge): number[] {
    const hits: number[] = [];
    for (let i = 0; i < N * N; i++) if (kn.k[i] === 2) hits.push(i);
    const isHit = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && kn.k[y * N + x] === 2;
    const isOpen = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && kn.k[y * N + x] === 0;
    const line: number[] = [];
    const near: number[] = [];
    for (const h of hits) {
      const x = h % N;
      const y = Math.floor(h / N);
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        if (!isHit(x + dx, y + dy) && !isHit(x - dx, y - dy)) continue;
        // Walk both ways along the run of hits to the first non-hit cell.
        for (const s of [1, -1]) {
          let cx = x;
          let cy = y;
          while (isHit(cx, cy)) {
            cx += dx * s;
            cy += dy * s;
          }
          if (isOpen(cx, cy)) line.push(cy * N + cx);
        }
      }
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        if (isOpen(x + dx, y + dy)) near.push((y + dy) * N + x + dx);
    }
    return line.length ? line : near;
  }

  private powerMove(game: SeaBattle, pw: string, kn: Knowledge, targeting: boolean): Move | null {
    if (pw === 'mine') {
      const own = game.seas[this.p];
      const water: number[] = [];
      for (let i = 0; i < N * N; i++) if (own.occ[i] < 0 && own.marks[i] === MARK.none && !own.mines.has(i)) water.push(i);
      return water.length ? { kind: 'mine', cell: this.rng.pick(water) } : null;
    }
    const dens = density(kn, targeting);
    if (pw === 'radar') {
      if (targeting) return null; // radar is for hunting
      let best = -1;
      let at = -1;
      for (let y = 1; y < N - 1; y++)
        for (let x = 1; x < N - 1; x++) {
          const box = radarCells(y * N + x);
          if (kn.hot.some((b) => b[4] === box[4])) continue;
          const s = box.reduce((t, c) => t + dens[c], 0);
          if (s > best) {
            best = s;
            at = box[4];
          }
        }
      return at >= 0 && best > 0 ? { kind: 'radar', cell: at } : null;
    }
    // Airstrike: the 5-cell row span with the most likely ship cells.
    let best = 0;
    let at = -1;
    for (let y = 0; y < N; y++)
      for (let x = 2; x < N - 2; x++) {
        const span = strikeCells(y * N + x);
        const s = span.reduce((t, c) => t + (kn.k[c] === 0 ? dens[c] : 0), 0);
        const openCount = span.filter((c) => kn.k[c] === 0).length;
        if (openCount >= 3 && s > best) {
          best = s;
          at = y * N + x;
        }
      }
    return at >= 0 ? { kind: 'airstrike', cell: at } : null;
  }
}
