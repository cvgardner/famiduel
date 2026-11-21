// Snake Duel rules: two light-cycle snakes on a grid, each leaving a solid trail.
// Pure and deterministic: the same seed and the same intents replay the same match.
import { HUMAN } from '../../core/human';
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
  turnAssistAt: 1,
  /**
   * From this assist level the auto-turn also steers away from trails, not just walls
   * (F349: the easy snake loses mostly to trails, its own and the other's; with walls alone
   * at three stars easy+0..3 v normal read 13/5/14/15%, now 13/14/21/65%).
   */
  trailAssistAt: 3,
  roundIntro: 1.3,
  roundOutro: 1.8,
  maxQueue: 2,
  energyPerCell: 0.006,
  /** Most trail cells one Phase crossing may pass through (F104). */
  phaseCells: 2,
  energyLose: 0.3,
  boostMult: 1.45,
  bombRadius: 3.3,
  /**
   * Brick Wall: this many bricks across the other snake's path, solid after the fuse. They land
   * where its head will be when they set, plus brickLead cells, so it always gets the whole
   * fuse and a little more to turn (never less than brickAhead cells away).
   */
  brickLen: 5,
  brickAhead: 4,
  brickLead: 2,
  brickFuse: 0.7,
};

/** Grid value of a brick (0 empty, 1 and 2 are the two snakes' trails). */
export const BRICK = 3;

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
  /** Trail cells crossed in the current crossing (at most RULES.phaseCells). */
  phased: number;
  /** Seconds Wall Wrap stays on: a wall lets this snake through to the opposite side. */
  wrap: number;
  moves: number;
  speedMul: number;
  turnAssist: boolean;
  /** The auto-turn also dodges trails (assist >= RULES.trailAssistAt). */
  trailAssist: boolean;
};

export type Event =
  | { type: 'move'; p: PlayerIndex }
  | { type: 'turn'; p: PlayerIndex; auto: boolean }
  | { type: 'crash'; p: PlayerIndex; x: number; y: number; wall: boolean }
  | { type: 'headon'; x: number; y: number }
  | { type: 'phaseThrough'; p: PlayerIndex; x: number; y: number }
  | { type: 'bomb'; p: PlayerIndex; x: number; y: number; cleared: number }
  /** Brick Wall: bricks dropped (blinking) at these cells; `set` when they turn solid. */
  | { type: 'brick'; p: PlayerIndex; cells: [number, number][] }
  | { type: 'brickSet'; p: PlayerIndex; cells: [number, number][] }
  /** Wall Wrap: the snake left at (fx, fy) and came back in at (x, y). */
  | { type: 'wrap'; p: PlayerIndex; fx: number; fy: number; x: number; y: number }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'roundStart'; round: number }
  | { type: 'roundEnd'; winner: PlayerIndex | null }
  | { type: 'win'; p: PlayerIndex | null };

export type Intent = { turn: -1 | 0 | 1; power: boolean };

export type Phase = 'intro' | 'play' | 'over';

export class SnakeDuel {
  score: [number, number] = [0, 0];
  /** 0 empty, 1 player 0's trail, 2 player 1's trail, BRICK a brick. */
  grid: Uint8Array;
  /** Cells where a dropped brick is blinking and will soon be solid (1), else 0. */
  soon: Uint8Array;
  /** Bricks blinking before they set, with the seconds left. */
  bricks: { owner: PlayerIndex; cells: [number, number][]; fuse: number }[] = [];
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
    this.soon = new Uint8Array(RULES.cols * RULES.rows);
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    this.snakes = [this.newSnake(0), this.newSnake(1)];
    this.resetRound();
  }

  private newSnake(p: PlayerIndex): Snake {
    const a = this.players[p].assist;
    return {
      x: 0, y: 0, dir: 0, alive: true, acc: 0, queue: [], boost: 0, phase: 0, phasing: false, phased: 0, wrap: 0, moves: 0,
      speedMul: lerpAssist(a, 1, RULES.assistSpeed),
      turnAssist: a >= RULES.turnAssistAt,
      trailAssist: a >= RULES.trailAssistAt,
    };
  }

  private resetRound(): void {
    this.grid.fill(0);
    this.soon.fill(0);
    this.bricks = [];
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
      Object.assign(s, { x, y, dir, alive: true, acc: 0, queue: [], boost: 0, phase: 0, phasing: false, phased: 0, wrap: 0, moves: 0 });
      this.grid[this.idx(x, y)] = p + 1;
    }
    this.phase = 'intro';
    // F153: round 1 follows the match's own "3 2 1 GO", so it starts at GO (its card made
    // GO a 1.3 s wait in which taps did nothing); later rounds keep their card.
    this.phaseT = this.round === 1 ? 0 : RULES.roundIntro;
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

  /** Where a step from (x, y) going `dir` lands: off the board unless Wall Wrap carries it round. */
  ahead(s: Snake, dir: number, x = s.x, y = s.y): { x: number; y: number; wrapped: boolean } {
    const nx = x + DX[dir];
    const ny = y + DY[dir];
    if (this.inside(nx, ny) || s.wrap <= 0) return { x: nx, y: ny, wrapped: false };
    return { x: (nx + RULES.cols) % RULES.cols, y: (ny + RULES.rows) % RULES.rows, wrapped: true };
  }

  step(dt: number, intents: [Intent, Intent]): void {
    this.events = [];
    if (this.done) return;
    this.t += dt;
    for (const p of [0, 1] as PlayerIndex[]) {
      this.energy[p].tick(dt);
      const s = this.snakes[p];
      s.boost = Math.max(0, s.boost - dt);
      s.wrap = Math.max(0, s.wrap - dt);
      if (!s.phasing) s.phase = Math.max(0, s.phase - dt);
      const it = intents[p];
      if (it.turn !== 0 && this.phase !== 'over' && s.queue.length < RULES.maxQueue) s.queue.push(it.turn);
      if (this.powersOn && it.power && this.phase === 'play') this.firePower(p);
    }
    if (this.phase === 'intro') {
      this.phaseT -= dt;
      if (this.phaseT > 0) return;
      this.phase = 'play';
      this.events.push({ type: 'roundStart', round: this.round });
      // Round 1 plays this very step, so a tap at GO counts.
      if (this.round > 1) return;
    }
    if (this.phase === 'over') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.nextRound();
      return;
    }
    this.roundT += dt;
    this.setBricks(dt);
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
    const next: Record<number, { x: number; y: number; crash: boolean; wall: boolean; pass: boolean; wrapped: boolean }> = {};
    for (const p of movers) {
      const s = this.snakes[p];
      const q = s.queue.shift();
      if (q !== undefined) {
        s.dir = (s.dir + (q === 1 ? 1 : 3)) % 4;
        this.events.push({ type: 'turn', p, auto: false });
      }
      if (s.turnAssist) this.assistTurn(p);
      const { x, y, wrapped } = this.ahead(s, s.dir);
      const wall = !this.inside(x, y);
      const filled = !wall && this.grid[this.idx(x, y)] !== 0;
      const pass = filled && canPhase(s);
      next[p] = { x, y, wall, pass, wrapped, crash: wall || (filled && !pass) };
    }
    if (movers.length === 2) {
      const a = next[0];
      const b = next[1];
      const s0 = this.snakes[0];
      const s1 = this.snakes[1];
      // Heads side by side and facing: each runs into the other's head cell (a swap).
      // That is a head-on too (F337: ~19 of 33 drawn hard-mirror rounds were swaps).
      const swap = a.x === s1.x && a.y === s1.y && b.x === s0.x && b.y === s0.y;
      if ((a.x === b.x && a.y === b.y) || swap) {
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
      if (n.wrapped) this.events.push({ type: 'wrap', p, fx: s.x, fy: s.y, x: n.x, y: n.y });
      s.x = n.x;
      s.y = n.y;
      s.moves++;
      if (n.pass) {
        if (!s.phasing) this.events.push({ type: 'phaseThrough', p, x: n.x, y: n.y });
        s.phasing = true;
        s.phased++;
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

  /** One cell before a wall (and at three stars a trail), turn toward the side with more room. */
  private assistTurn(p: PlayerIndex): void {
    const s = this.snakes[p];
    const ax = s.x + DX[s.dir];
    const ay = s.y + DY[s.dir];
    if (s.trailAssist ? !this.blocked(ax, ay) || canPhase(s) : this.inside(ax, ay)) return;
    // Wall Wrap is on and the far side is open: the wall is a door now, keep going.
    if (!this.inside(ax, ay)) {
      const through = this.ahead(s, s.dir);
      if (through.wrapped && !this.blocked(through.x, through.y)) return;
    }
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
    else if (power.id === 'brick') this.dropBricks(p);
    else if (power.id === 'wrap') s.wrap = power.duration ?? 5;
    else if (power.id === 'phase') {
      s.phase = power.duration ?? 5;
      s.phased = 0;
    }
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

  /** Brick Wall: a row of blinking bricks across the other snake's path, a few cells ahead of it. */
  private dropBricks(p: PlayerIndex): void {
    const o = this.snakes[other(p)];
    const { cols, rows, brickLen } = RULES;
    const clampX = (x: number) => Math.max(0, Math.min(cols - 1, x));
    const clampY = (y: number) => Math.max(0, Math.min(rows - 1, y));
    const ahead = this.brickDistance(other(p));
    const cx = clampX(o.x + DX[o.dir] * ahead);
    const cy = clampY(o.y + DY[o.dir] * ahead);
    const side = (o.dir + 1) % 4;
    const cells: [number, number][] = [];
    const half = Math.floor(brickLen / 2);
    for (let k = -half; k <= half; k++) {
      const x = cx + DX[side] * k;
      const y = cy + DY[side] * k;
      if (!this.inside(x, y) || this.grid[this.idx(x, y)] !== 0 || this.soon[this.idx(x, y)]) continue;
      if (this.snakes.some((s) => s.x === x && s.y === y)) continue;
      cells.push([x, y]);
      this.soon[this.idx(x, y)] = 1;
    }
    this.bricks.push({ owner: p, cells, fuse: RULES.brickFuse });
    this.events.push({ type: 'brick', p, cells });
  }

  /** How many cells ahead of snake q a Brick Wall lands (see RULES.brickLead). */
  brickDistance(q: PlayerIndex): number {
    return Math.max(RULES.brickAhead, Math.ceil(this.speed(q) * RULES.brickFuse) + RULES.brickLead);
  }

  /** Blinking bricks whose fuse ran out turn solid (except where a snake got there first). */
  private setBricks(dt: number): void {
    for (const b of this.bricks) {
      b.fuse -= dt;
      if (b.fuse > 0) continue;
      const set: [number, number][] = [];
      for (const [x, y] of b.cells) {
        const i = this.idx(x, y);
        this.soon[i] = 0;
        if (this.grid[i] !== 0 || this.snakes.some((s) => s.x === x && s.y === y)) continue;
        this.grid[i] = BRICK;
        set.push([x, y]);
      }
      this.events.push({ type: 'brickSet', p: b.owner, cells: set });
    }
    this.bricks = this.bricks.filter((b) => b.fuse > 0);
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
/**
 * F327: how much the hard bot shies away from a head-on (a drawn round). Its territory
 * pull (0.5 a cell, hundreds of cells) outweighed the old 50 / 8, so two hard snakes
 * charged the middle and met head-on in ~40% of rounds (half of all rounds drawn, matches
 * ran to the 9-round cap; a rival app's review: its hard snake "mimics my actions, making
 * it impossible to win or lose"). Still far above -1e9, so a head-on (a draw) beats a sure crash.
 */
const HEADON_HARD = 1000;
const NEARHEAD_HARD = 1000;
/**
 * F330: easy had no head-on worry, so two easy snakes met head-on in ~19% of rounds (a
 * drawn round each time). A small one (still below its 0.5 noise times a few cells of
 * room) only breaks a tie between two equally open turns; kid rows didn't move.
 */
const HEADON_EASY = 10;

const BOT = {
  easy: { depth: 14, react: 0.3, slip: 0.07, noise: 0.5, headOn: HEADON_EASY, nearHead: 0, lockAhead: false, territory: false },
  normal: { depth: 80, react: 0.15, slip: 0.015, noise: 0.5, headOn: 50, nearHead: 8, lockAhead: false, territory: false },
  hard: { depth: 600, react: HUMAN.tapGap, slip: 0, noise: 0.5, headOn: HEADON_HARD, nearHead: NEARHEAD_HARD, lockAhead: true, territory: true },
} satisfies Record<BotLevel, { depth: number; react: number; slip: number; noise: number; headOn: number; nearHead: number; lockAhead: boolean; territory: boolean }>;

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
    const ready = game.powersOn && game.energy[this.p].ready;
    // Wall Wrap: with the power ready, look at the moves that would go through a wall. One that
    // leads to much more room is taken (and the power switched on as it turns); heading straight
    // into a wall with as much room on the far side, it often goes through rather than turn.
    let wrapNow = false;
    if (ready && game.players[this.p].power?.id === 'wrap' && s.wrap <= 0) {
      for (const turn of [0, -1, 1] as const) {
        const dir = (s.dir + (turn === 1 ? 1 : turn === -1 ? 3 : 0)) % 4;
        if (game.inside(s.x + DX[dir], s.y + DY[dir])) continue;
        const score = this.evaluate(game, turn, true);
        if (score > best.score + 8 || (turn === 0 && score > best.score - 2 && this.rng.chance(0.35))) {
          best = { turn, score };
          wrapNow = true;
        }
      }
    }
    let turn: -1 | 0 | 1 = best.turn;
    // Reaction time: a person can't turn again instantly; a fumble keeps going straight.
    if (turn !== 0 && (this.sinceTurn < cfg.react || this.rng.chance(cfg.slip))) turn = 0;
    if (turn !== 0) this.sinceTurn = 0;
    const power = ready && (wrapNow || this.wantsPower(game, best.score));
    return { turn, power };
  }

  /** How good a turn is: room reachable after it. `wrap`: as if Wall Wrap were on. */
  private evaluate(game: SnakeDuel, turn: -1 | 0 | 1, wrap = false): number {
    const cfg = BOT[this.level];
    const s = game.snakes[this.p];
    const o = game.snakes[other(this.p)];
    const dir = (s.dir + (turn === 1 ? 1 : turn === -1 ? 3 : 0)) % 4;
    const { x, y } = game.ahead(wrap ? { ...s, wrap: Math.max(s.wrap, 1) } : s, dir);
    if (!game.inside(x, y)) return -1e9;
    // A blinking brick is about to be solid: a careful player steers clear of it.
    if ((game.grid[game.idx(x, y)] !== 0 || game.soon[game.idx(x, y)]) && !canPhase(s)) return -1e9;
    let score = flood(game, x, y, cfg.depth);
    if (o.alive && Math.abs(o.x + DX[o.dir] - x) + Math.abs(o.y + DY[o.dir] - y) === 0) score -= cfg.headOn;
    else if (o.alive && Math.abs(o.x - x) + Math.abs(o.y - y) === 1) score -= cfg.nearHead;
    // A turn locks the next cell straight (no second tap that soon), so the hard bot also
    // checks that cell: one the other head reaches in two steps is a likely head-on.
    else if (cfg.lockAhead && turn !== 0 && o.alive) {
      const d2 = Math.abs(o.x - x - DX[dir]) + Math.abs(o.y - y - DY[dir]);
      if (d2 === 2) score -= o.x + 2 * DX[o.dir] === x + DX[dir] && o.y + 2 * DY[o.dir] === y + DY[dir] ? cfg.headOn : cfg.nearHead;
      // ...or the other head is two cells past it, straight on: if it turns into the cell
      // between (as a mirror-image bot does), both heads are locked facing, a swap head-on.
      else if (o.x === x + 2 * DX[dir] && o.y === y + 2 * DY[dir]) score -= cfg.headOn;
    }
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
    if (id === 'brick') {
      // Drop it while the two race for the same open room and the other snake has a clear run
      // ahead (a wall across it takes that room away); not once trails have walled you apart.
      const s = game.snakes[this.p];
      const o = game.snakes[other(this.p)];
      if (trapped || !o.alive) return false;
      const ahead = game.brickDistance(other(this.p));
      for (let k = 1; k <= ahead; k++) if (game.blocked(o.x + DX[o.dir] * k, o.y + DY[o.dir] * k)) return false;
      return Math.abs(s.x - o.x) + Math.abs(s.y - o.y) < 16 && reaches(game, s.x, s.y, o.x, o.y);
    }
    return false;
  }
}

/**
 * True when the snake's next step may pass through a trail cell: Phase is armed or mid-crossing,
 * and this crossing has not yet passed RULES.phaseCells cells (a crossing goes through one trail,
 * not along it or through a packed block of trails).
 */
export function canPhase(s: Snake): boolean {
  return (s.phase > 0 || s.phasing) && s.phased < RULES.phaseCells;
}

/** True when a snake head at (x, y) can still reach a cell next to (tx, ty) over empty cells. */
export function reaches(game: SnakeDuel, x: number, y: number, tx: number, ty: number): boolean {
  const seen = new Uint8Array(RULES.cols * RULES.rows);
  const stack = [game.idx(x, y)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const cx = i % RULES.cols;
    const cy = (i - cx) / RULES.cols;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (!game.inside(nx, ny)) continue;
      if (Math.abs(nx - tx) + Math.abs(ny - ty) === 1 && game.grid[game.idx(nx, ny)] === 0) return true;
      const j = game.idx(nx, ny);
      if (seen[j] || game.grid[j] !== 0) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return false;
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
      if (seen[j] || game.grid[j] !== 0 || game.soon[j]) continue;
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
