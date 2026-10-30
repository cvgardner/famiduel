// Chop Chop rules: each player chops their own tree from the left or right.
// A branch on your side when it reaches you bonks you; the timer bar drains and
// every chop refills it. Both trees share one seeded branch pattern per round.
import { Energy } from '../../core/energy';
import { lerpAssist } from '../../core/handicap';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';

export const RULES = {
  goal: 50,
  winRounds: 3,
  /** Tied rounds don't score; stop after this many anyway. */
  maxRounds: 7,
  intro: 1.3,
  outro: 2.0,
  timerStart: 0.8,
  /** Timer bar drained per second at chop 0, growing with each chop. */
  drain0: 0.22,
  drainGrow: 1 / 60,
  /** Drain multiplier at assist 3. */
  assistDrain: 0.6,
  refill: 0.1,
  doubleChop: 4,
  freeze: 1,
  energyPerChop: 0.02,
  energyLose: 0.35,
};

/** -1 left, 1 right, 0 none. */
export type Side = -1 | 1;
export type Branch = -1 | 0 | 1;

export type Chopper = {
  side: Side;
  /** Pattern index of the trunk segment at the chopper's level. */
  idx: number;
  chops: number;
  timer: number;
  out: boolean;
  outReason: 'bonk' | 'time' | null;
  shield: boolean;
  frozen: number;
  double: number;
  drainMul: number;
  /** Pattern indices whose branch this chopper broke off with a shield. */
  broken: Set<number>;
};

export type Event =
  | { type: 'chop'; p: PlayerIndex; side: Side; count: number }
  | { type: 'bonk'; p: PlayerIndex; side: Side }
  | { type: 'timeUp'; p: PlayerIndex }
  | { type: 'shieldBreak'; p: PlayerIndex; side: Side }
  | { type: 'frozenTap'; p: PlayerIndex }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'roundStart'; round: number }
  | { type: 'roundEnd'; winner: PlayerIndex | null }
  | { type: 'win'; p: PlayerIndex | null };

/** chop: the side tapped this step, or 0. */
export type Intent = { chop: -1 | 0 | 1; power: boolean };

export type Phase = 'intro' | 'play' | 'over';

export class ChopChop {
  score: [number, number] = [0, 0];
  energy: [Energy, Energy];
  choppers: [Chopper, Chopper];
  /** Shared branch pattern for this round. pattern[i] is the branch on segment i. */
  pattern: Branch[] = [];
  phase: Phase = 'intro';
  phaseT = RULES.intro;
  round = 1;
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
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    const mk = (p: PlayerIndex): Chopper => ({
      side: -1, idx: 0, chops: 0, timer: RULES.timerStart, out: false, outReason: null, shield: false, frozen: 0, double: 0,
      drainMul: lerpAssist(players[p].assist, 1, RULES.assistDrain), broken: new Set(),
    });
    this.choppers = [mk(0), mk(1)];
    this.resetRound();
  }

  private resetRound(): void {
    // A branch is always followed by a bare segment, so every pattern can be survived.
    const n = RULES.goal * 2 + 40;
    const pat: Branch[] = [0, 0, 0];
    while (pat.length < n) {
      if (pat[pat.length - 1] !== 0) pat.push(0);
      else {
        const r = this.rng.next();
        pat.push(r < 0.34 ? 0 : r < 0.67 ? -1 : 1);
      }
    }
    this.pattern = pat;
    for (const c of this.choppers) {
      Object.assign(c, { side: -1, idx: 0, chops: 0, timer: RULES.timerStart, out: false, outReason: null, frozen: 0, double: 0 });
      c.broken = new Set();
    }
    this.phase = 'intro';
    this.phaseT = RULES.intro;
  }

  /** The branch on segment i of player p's tree (shields can break branches off). */
  branch(p: PlayerIndex, i: number): Branch {
    if (this.choppers[p].broken.has(i)) return 0;
    return this.pattern[i] ?? 0;
  }

  drain(p: PlayerIndex): number {
    const c = this.choppers[p];
    return RULES.drain0 * (1 + c.chops * RULES.drainGrow) * c.drainMul;
  }

  step(dt: number, intents: [Intent, Intent]): void {
    this.events = [];
    if (this.done) return;
    this.t += dt;
    for (const p of [0, 1] as PlayerIndex[]) {
      this.energy[p].tick(dt);
      const c = this.choppers[p];
      c.frozen = Math.max(0, c.frozen - dt);
      c.double = Math.max(0, c.double - dt);
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
      if (this.phaseT <= 0) {
        this.round++;
        this.resetRound();
      }
      return;
    }
    for (const p of [0, 1] as PlayerIndex[]) {
      if (this.powersOn && intents[p].power) this.firePower(p);
      if (intents[p].chop) this.chop(p, intents[p].chop as Side);
    }
    for (const p of [0, 1] as PlayerIndex[]) {
      const c = this.choppers[p];
      if (c.out) continue;
      c.timer -= this.drain(p) * dt;
      if (c.timer <= 0) {
        c.timer = 0;
        c.out = true;
        c.outReason = 'time';
        this.events.push({ type: 'timeUp', p });
      }
    }
    const [a, b] = this.choppers;
    const reached = ([0, 1] as PlayerIndex[]).filter((p) => this.choppers[p].chops >= RULES.goal && !this.choppers[p].out);
    if (reached.length === 2) this.endRound(a.chops === b.chops ? null : a.chops > b.chops ? 0 : 1);
    else if (reached.length === 1) this.endRound(reached[0]);
    else if (a.out && b.out) this.endRound(null);
    else if (a.out) this.endRound(1);
    else if (b.out) this.endRound(0);
  }

  /** Returns true when the branch was absorbed (shield) or there was none. */
  private hit(p: PlayerIndex, i: number, side: Side): boolean {
    const c = this.choppers[p];
    if (this.branch(p, i) !== side) return true;
    if (c.shield) {
      c.shield = false;
      c.broken.add(i);
      this.events.push({ type: 'shieldBreak', p, side });
      return true;
    }
    c.out = true;
    c.outReason = 'bonk';
    this.events.push({ type: 'bonk', p, side });
    return false;
  }

  private chop(p: PlayerIndex, side: Side): void {
    const c = this.choppers[p];
    if (c.out) return;
    if (c.frozen > 0) {
      this.events.push({ type: 'frozenTap', p });
      return;
    }
    // Stepping round to a side where a branch hangs at your level: bonk.
    if (!this.hit(p, c.idx, side)) return;
    c.side = side;
    c.idx++;
    const n = c.double > 0 ? 2 : 1;
    c.chops += n;
    c.timer = Math.min(1, c.timer + RULES.refill);
    this.energy[p].charge(RULES.energyPerChop, c.chops < this.choppers[other(p)].chops);
    this.events.push({ type: 'chop', p, side, count: n });
    // The tree drops one segment: a branch now at your level on your side lands on you.
    this.hit(p, c.idx, side);
  }

  private firePower(p: PlayerIndex): void {
    const power = this.players[p].power;
    const c = this.choppers[p];
    if (!power || c.out) return;
    if (power.id === 'shield' && c.shield) return;
    if (!this.energy[p].spend(power.duration ?? 0)) return;
    if (power.id === 'shield') c.shield = true;
    else if (power.id === 'freeze') this.choppers[other(p)].frozen = power.duration ?? RULES.freeze;
    else if (power.id === 'double') c.double = power.duration ?? RULES.doubleChop;
    this.events.push({ type: 'power', p, id: power.id });
  }

  private endRound(winner: PlayerIndex | null): void {
    this.phase = 'over';
    this.phaseT = RULES.outro;
    this.lastRound = winner;
    if (winner !== null) {
      this.score[winner]++;
      this.energy[other(winner)].charge(RULES.energyLose, true);
    }
    this.events.push({ type: 'roundEnd', winner });
    if (Math.max(...this.score) >= RULES.winRounds || this.round >= RULES.maxRounds) {
      this.done = true;
      this.winner = this.score[0] === this.score[1] ? null : this.score[0] > this.score[1] ? 0 : 1;
      this.events.push({ type: 'win', p: this.winner });
    }
  }
}

// ---------- Honest bot ----------
// It looks at the same two trunk segments a person sees, and taps at a steady,
// skill-based rate. Easy bots sometimes pick the wrong side.
const BOT = {
  easy: { rate: 2.7, jitter: 0.35, mistake: 0.03, react: 0.5 },
  normal: { rate: 3.7, jitter: 0.25, mistake: 0.008, react: 0.35 },
  hard: { rate: 4.7, jitter: 0.15, mistake: 0.002, react: 0.25 },
} satisfies Record<BotLevel, { rate: number; jitter: number; mistake: number; react: number }>;

export class ChopBot {
  private wait = 0;
  private wasPlaying = false;

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  think(game: ChopChop, dt: number): Intent {
    const cfg = BOT[this.level];
    const c = game.choppers[this.p];
    const playing = game.phase === 'play' && !c.out;
    if (playing && !this.wasPlaying) this.wait = cfg.react * this.rng.range(0.8, 1.2);
    this.wasPlaying = playing;
    const power = game.powersOn && playing && game.energy[this.p].ready && this.wantsPower(game);
    if (!playing) return { chop: 0, power: false };
    this.wait -= dt;
    if (this.wait > 0) return { chop: 0, power };
    this.wait = (1 / cfg.rate) * (1 + this.rng.range(-cfg.jitter, cfg.jitter));
    if (c.frozen > 0) return { chop: 0, power };
    const safe = (s: -1 | 1) => game.branch(this.p, c.idx) !== s && game.branch(this.p, c.idx + 1) !== s;
    let side: -1 | 1 = safe(c.side) ? c.side : (-c.side as -1 | 1);
    if (this.rng.chance(cfg.mistake)) side = -side as -1 | 1;
    return { chop: side, power };
  }

  private wantsPower(game: ChopChop): boolean {
    const id = game.players[this.p].power?.id;
    if (id === 'freeze') return !game.choppers[other(this.p)].out;
    return true;
  }
}
