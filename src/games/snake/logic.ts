// Snake Duel rules: two light-cycle snakes on a grid, each leaving a solid trail.
// Pure and deterministic: the same seed and the same intents replay the same match.
import { Energy } from '../../core/energy';
import { lerpAssist } from '../../core/handicap';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';

export const RULES = {
  cols: 28,
  rows: 38,
  /** Cell size and arena origin in world units (the view uses these). */
  cell: 12,
  ox: 12,
  oy: 92,
  winRounds: 3,
  /** Draw rounds don't score; stop after this many rounds anyway. */
  maxRounds: 9,
  /** Cells per second at round start, the cap, and the ramp per second of round time. */
  speed0: 7.5,
  speedMax: 12.5,
  speedRamp: 0.12,
  /** Speed multiplier for the assisted snake at assist 3. */
  assistSpeed: 0.78,
  /** Turn assist (auto-turn away from a wall) switches on at this assist level. */
  turnAssistAt: 3,
  roundIntro: 1.3,
  roundOutro: 1.8,
  maxQueue: 2,
  energyPerCell: 0.006,
  energyLose: 0.3,
  boostMult: 1.45,
  bombRadius: 3.3,
};

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export type Snake = {
  x: number;
  y: number;
  /** 0 up, 1 right, 2 down, 3 left (screen directions). */
  dir: number;
  alive: boolean;
  /** Progress toward the next cell (moves at 1). */
  acc: number;
  /** Queued relative turns: -1 left, +1 right (from the snake's point of view). */
  queue: number[];
  boost: number;
  /** Seconds the Phase power stays armed; it ends after one trail is crossed. */
  phase: number;
  phasing: boolean;
  moves: number;
  speedMul: number;
  turnAssist: boolean;
};

export type Event =
  | { type: 'move'; p: PlayerIndex }
  | { type: 'turn'; p: PlayerIndex; auto: boolean }
  | { type: 'crash'; p: PlayerIndex; x: number; y: number; wall: boolean }
  | { type: 'headon'; x: number; y: number }
  | { type: 'phaseThrough'; p: PlayerIndex; x: number; y: number }
  | { type: 'bomb'; p: PlayerIndex; x: number; y: number; cleared: number }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'roundStart'; round: number }
  | { type: 'roundEnd'; winner: PlayerIndex | null }
  | { type: 'win'; p: PlayerIndex | null };

export type Intent = { turn: -1 | 0 | 1; power: boolean };

export type Phase = 'intro' | 'play' | 'over';

export class SnakeDuel {
  score: [number, number] = [0, 0];
  /** 0 empty, 1 player 0's trail, 2 player 1's trail. */
  grid: Uint8Array;
  snakes: [Snake, Snake];
  energy: [Energy, Energy];
  phase: Phase = 'intro';
  phaseT = RULES.roundIntro;
  round = 1;
  roundT = 0;
  lastRound: PlayerIndex | null | undefined = undefined;
  winner: PlayerIndex | null = null;
  done = false;
  events: Event[] = [];
  t = 0;

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    readonly powersOn: boolean,
    private readonly rng: Rng,
  ) {
    this.grid = new Uint8Array(RULES.cols * RULES.rows);
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    this.snakes = [this.newSnake(0), this.newSnake(1)];
    this.resetRound();
  }

  private newSnake(p: PlayerIndex): Snake {
    const a = this.players[p].assist;
    return {
      x: 0, y: 0, dir: 0, alive: true, acc: 0, queue: [], boost: 0, phase: 0, phasing: false, moves: 0,
      speedMul: lerpAssist(a, 1, RULES.assistSpeed),
      turnAssist: a >= RULES.turnAssistAt,
    };
  }

  private resetRound(): void {
    this.grid.fill(0);
    const { cols, rows } = RULES;
    // Seeded start lanes, each the same distance from its own back wall. Lanes are
    // picked separately so two careful players don't mirror each other into a draw.
    const lane = () => 6 + this.rng.int(0, 5);
    const y0 = rows - 6;
    const starts: [number, number, number][] = [
      [lane(), y0, 0],
      [cols - 1 - lane(), rows - 1 - y0, 2],
    ];
    for (const p of [0, 1] as PlayerIndex[]) {
      const s = this.snakes[p];
      const [x, y, dir] = starts[p];
      Object.assign(s, { x, y, dir, alive: true, acc: 0, queue: [], boost: 0, phase: 0, phasing: false, moves: 0 });
      this.grid[this.idx(x, y)] = p + 1;
    }
    this.phase = 'intro';
    this.phaseT = RULES.roundIntro;
    this.roundT = 0;
  }

  idx(x: number, y: number): number {
    return y * RULES.cols + x;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < RULES.cols && y < RULES.rows;
  }

  blocked(x: number, y: number): boolean {
    return !this.inside(x, y) || this.grid[this.idx(x, y)] !== 0;
  }

  /** Cells per second for a player right now. */
  speed(p: PlayerIndex): number {
    const s = this.snakes[p];
    const base = Math.min(RULES.speedMax, RULES.speed0 + RULES.speedRamp * this.roundT);
    return base * s.speedMul * (s.boost > 0 ? RULES.boostMult : 1);
  }

  step(dt: number, intents: [Intent, Intent]): void {
    this.events = [];
    if (this.done) return;
    this.t += dt;
    for (const p of [0, 1] as PlayerIndex[]) {
      this.energy[p].tick(dt);
      const s = this.snakes[p];
      s.boost = Math.max(0, s.boost - dt);
      if (!s.phasing) s.phase = Math.max(0, s.phase - dt);
      const it = intents[p];
      if (it.turn !== 0 && this.phase !== 'over' && s.queue.length < RULES.maxQueue) s.queue.push(it.turn);
      if (this.powersOn && it.power && this.phase === 'play') this.firePower(p);
    }
    if (this.phase === 'intro') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'play';
        this.events.push({ type: 'roundStart', round: this.round });
      }
      return;
    }
    if (this.phase === 'over') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.nextRound();
      return;
    }
    this.roundT += dt;
    const movers: PlayerIndex[] = [];
    for (const p of [0, 1] as PlayerIndex[]) {
      const s = this.snakes[p];
      s.acc += this.speed(p) * dt;
      if (s.acc >= 1) {
        s.acc -= 1;
        movers.push(p);
      }
    }
    if (movers.length) this.move(movers);
  }

  private move(movers: PlayerIndex[]): void {
    const next: Record<number, { x: number; y: number; crash: boolean; wall: boolean; pass: boolean }> = {};
    for (const p of movers) {
      const s = this.snakes[p];
      const q = s.queue.shift();
      if (q !== undefined) {
        s.dir = (s.dir + (q === 1 ? 1 : 3)) % 4;
        this.events.push({ type: 'turn', p, auto: false });
      }
      if (s.turnAssist) this.assistTurn(p);
      const x = s.x + DX[s.dir];
      const y = s.y + DY[s.dir];
      const wall = !this.inside(x, y);
      const filled = !wall && this.grid[this.idx(x, y)] !== 0;
      const pass = filled && (s.phase > 0 || s.phasing);
      next[p] = { x, y, wall, pass, crash: wall || (filled && !pass) };
    }
    if (movers.length === 2) {
      const a = next[0];
      const b = next[1];
      if (a.x === b.x && a.y === b.y) {
        a.crash = b.crash = true;
        this.events.push({ type: 'headon', x: a.x, y: a.y });
      }
    }
    for (const p of movers) {
      const s = this.snakes[p];
      const n = next[p];
      if (n.crash) {
        s.alive = false;
        this.events.push({ type: 'crash', p, x: n.wall ? s.x : n.x, y: n.wall ? s.y : n.y, wall: n.wall });
        continue;
      }
      s.x = n.x;
      s.y = n.y;
      s.moves++;
      if (n.pass) {
        if (!s.phasing) this.events.push({ type: 'phaseThrough', p, x: n.x, y: n.y });
        s.phasing = true;
      } else {
        if (s.phasing) {
          s.phasing = false;
          s.phase = 0; // one trail crossed: the power is used up
        }
        this.grid[this.idx(n.x, n.y)] = p + 1;
      }
      this.energy[p].charge(RULES.energyPerCell, this.score[p] < this.score[other(p)]);
      this.events.push({ type: 'move', p });
    }
    const dead = ([0, 1] as PlayerIndex[]).filter((p) => !this.snakes[p].alive);
    if (dead.length) this.endRound(dead.length === 2 ? null : other(dead[0]));
  }

  /** Assist 3: one cell before a wall, turn toward the side with more room. */
  private assistTurn(p: PlayerIndex): void {
    const s = this.snakes[p];
    if (this.inside(s.x + DX[s.dir], s.y + DY[s.dir])) return;
    let best = -1;
    let bestDir = s.dir;
    for (const turn of [3, 1]) {
      const d = (s.dir + turn) % 4;
      let run = 0;
      let x = s.x + DX[d];
      let y = s.y + DY[d];
      while (!this.blocked(x, y) && run < 40) {
        run++;
        x += DX[d];
        y += DY[d];
      }
      if (run > best) {
        best = run;
        bestDir = d;
      }
    }
    if (best > 0) {
      s.dir = bestDir;
      this.events.push({ type: 'turn', p, auto: true });
    }
  }

  private firePower(p: PlayerIndex): void {
    const power = this.players[p].power;
    const s = this.snakes[p];
    if (!power || !s.alive || !this.energy[p].spend(power.duration ?? 0)) return;
    if (power.id === 'boost') s.boost = power.duration ?? 3;
    else if (power.id === 'phase') s.phase = power.duration ?? 5;
    else if (power.id === 'bomb') {
      const r = RULES.bombRadius;
      let cleared = 0;
      const o = this.snakes[other(p)];
      for (let y = Math.floor(s.y - r); y <= s.y + r; y++)
        for (let x = Math.floor(s.x - r); x <= s.x + r; x++) {
          if (!this.inside(x, y) || Math.hypot(x - s.x, y - s.y) > r) continue;
          if ((x === s.x && y === s.y) || (x === o.x && y === o.y)) continue;
          const i = this.idx(x, y);
          if (this.grid[i]) cleared++;
          this.grid[i] = 0;
        }
      this.events.push({ type: 'bomb', p, x: s.x, y: s.y, cleared });
    }
    this.events.push({ type: 'power', p, id: power.id });
  }

  private endRound(winner: PlayerIndex | null): void {
    this.phase = 'over';
    this.phaseT = RULES.roundOutro;
    this.lastRound = winner;
    if (winner !== null) {
      this.score[winner]++;
      this.energy[other(winner)].charge(RULES.energyLose, true);
    }
    this.events.push({ type: 'roundEnd', winner });
    const maxed = this.round >= RULES.maxRounds;
    if (Math.max(...this.score) >= RULES.winRounds || maxed) {
      this.done = true;
      this.winner = this.score[0] === this.score[1] ? null : this.score[0] > this.score[1] ? 0 : 1;
      this.events.push({ type: 'win', p: this.winner });
    }
  }

  private nextRound(): void {
    this.round++;
    this.resetRound();
  }
}

// ---------- Honest bot ----------
// Sees the same grid a person sees and steers with the same turn buttons.
// Skill changes how far it looks (flood-fill depth), whether it thinks about
// where the other head can go, its reaction time between two turns, and how
// often it fumbles a turn.
const BOT = {
  easy: { depth: 14, react: 0.3, slip: 0.07, noise: 0.5, avoidHead: false, territory: false },
  normal: { depth: 80, react: 0.15, slip: 0.015, noise: 0.5, avoidHead: true, territory: false },
  hard: { depth: 600, react: 0.06, slip: 0, noise: 0.5, avoidHead: true, territory: true },
} satisfies Record<BotLevel, { depth: number; react: number; slip: number; noise: number; avoidHead: boolean; territory: boolean }>;

export class SnakeBot {
  private plannedFor = -1;
  private sinceTurn = 1;

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  think(game: SnakeDuel, dt: number): Intent {
    const cfg = BOT[this.level];
    this.sinceTurn += dt;
    const s = game.snakes[this.p];
    if (game.phase !== 'play' || !s.alive) {
      this.plannedFor = -1;
      return { turn: 0, power: false };
    }
    // One decision per cell, made right after the snake moves.
    if (s.moves === this.plannedFor) return { turn: 0, power: false };
    this.plannedFor = s.moves;
    const options = ([0, -1, 1] as const).map((turn) => ({ turn, score: this.evaluate(game, turn) }));
    let best = options[0];
    for (const o of options) if (o.score > best.score) best = o;
    let turn: -1 | 0 | 1 = best.turn;
    // Reaction time: a person can't turn again instantly; a fumble keeps going straight.
    if (turn !== 0 && (this.sinceTurn < cfg.react || this.rng.chance(cfg.slip))) turn = 0;
    if (turn !== 0) this.sinceTurn = 0;
    const power = game.powersOn && game.energy[this.p].ready && this.wantsPower(game, best.score);
    return { turn, power };
  }

  private evaluate(game: SnakeDuel, turn: -1 | 0 | 1): number {
    const cfg = BOT[this.level];
    const s = game.snakes[this.p];
    const o = game.snakes[other(this.p)];
    const dir = (s.dir + (turn === 1 ? 1 : turn === -1 ? 3 : 0)) % 4;
    const x = s.x + DX[dir];
    const y = s.y + DY[dir];
    if (!game.inside(x, y)) return -1e9;
    const canPhase = s.phase > 0 || s.phasing;
    if (game.grid[game.idx(x, y)] !== 0 && !canPhase) return -1e9;
    let score = flood(game, x, y, cfg.depth);
    if (cfg.avoidHead && o.alive && Math.abs(o.x + DX[o.dir] - x) + Math.abs(o.y + DY[o.dir] - y) === 0) score -= 50;
    else if (cfg.avoidHead && o.alive && Math.abs(o.x - x) + Math.abs(o.y - y) === 1) score -= 8;
    if (cfg.territory && o.alive) score += 0.5 * territory(game, x, y, o.x, o.y);
    if (turn === 0) score += 0.6; // mild preference for going straight; noise only breaks left/right ties
    return score + this.rng.range(0, cfg.noise);
  }

  private wantsPower(game: SnakeDuel, bestScore: number): boolean {
    const id = game.players[this.p].power?.id;
    const cfg = BOT[this.level];
    const trapped = bestScore < Math.min(cfg.depth, 30);
    if (id === 'phase' || id === 'bomb') return trapped;
    if (id === 'boost') return !trapped && this.rng.chance(0.02);
    return false;
  }
}

/** Count empty cells reachable from (x, y), up to cap. (x, y) itself counts. */
export function flood(game: SnakeDuel, x: number, y: number, cap: number): number {
  const seen = new Uint8Array(RULES.cols * RULES.rows);
  const stack = [game.idx(x, y)];
  seen[stack[0]] = 1;
  let n = 0;
  while (stack.length && n < cap) {
    const i = stack.pop()!;
    n++;
    const cx = i % RULES.cols;
    const cy = (i - cx) / RULES.cols;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (!game.inside(nx, ny)) continue;
      const j = game.idx(nx, ny);
      if (seen[j] || game.grid[j] !== 0) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return n;
}

/** Cells (x, y) reaches strictly before (ox, oy): a rough share of the arena. */
function territory(game: SnakeDuel, x: number, y: number, ox: number, oy: number): number {
  const N = RULES.cols * RULES.rows;
  const owner = new Int8Array(N).fill(-1);
  const dist = new Int16Array(N).fill(-1);
  let frontier: number[] = [];
  const a = game.idx(x, y);
  const b = game.idx(ox, oy);
  owner[a] = 0;
  dist[a] = 0;
  owner[b] = 1;
  dist[b] = 0;
  frontier.push(a, b);
  let mine = 0;
  let d = 0;
  while (frontier.length) {
    d++;
    const nextF: number[] = [];
    for (const i of frontier) {
      const cx = i % RULES.cols;
      const cy = (i - cx) / RULES.cols;
      for (let k = 0; k < 4; k++) {
        const nx = cx + DX[k];
        const ny = cy + DY[k];
        if (!game.inside(nx, ny)) continue;
        const j = game.idx(nx, ny);
        if (game.grid[j] !== 0) continue;
        if (dist[j] === -1) {
          dist[j] = d;
          owner[j] = owner[i];
          nextF.push(j);
          if (owner[i] === 0) mine++;
        } else if (dist[j] === d && owner[j] !== owner[i] && owner[j] !== 2) {
          if (owner[j] === 0) mine--;
          owner[j] = 2; // contested
        }
      }
    }
    frontier = nextF;
  }
  return mine;
}
