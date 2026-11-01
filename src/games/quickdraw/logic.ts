// Quick Draw rules: wait for DRAW!, then tap first. Tapping early, or on a
// fake-out, loses the round. Pure and deterministic for a seed.
import { HUMAN } from '../../core/human';
import { Energy } from '../../core/energy';
import { lerpAssist } from '../../core/handicap';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';

export const RULES = {
  winRounds: 3,
  /** Void rounds (both early, nobody tapped, exact tie) don't score; stop after this many. */
  maxRounds: 11,
  ready: 1.2,
  waitMin: 1.6,
  waitMax: 4.6,
  /** No tap this long after DRAW! voids the round. */
  drawTimeout: 2.5,
  result: 2.4,
  fakeLen: 0.85,
  /** Gap kept between fakes, and before DRAW!. */
  fakeGap: 0.35,
  /** Seconds added to the opponent's tap at assist 3. */
  maxPenalty: 0.15,
  /** Slow Time: how long before DRAW! the "get ready" pulse starts. */
  pulseLead: 0.45,
  /** After a forgiven early tap, taps are ignored this long (so one press can't be both). */
  forgiveLock: 0.25,
  energyWin: 0.3,
  energyLose: 0.45,
};

export type FakeKind = 'picture' | 'bridge' | 'tumbleweed' | 'drawer';
export const FAKE_KINDS: readonly FakeKind[] = ['picture', 'bridge', 'tumbleweed', 'drawer'];

export type Fake = { at: number; kind: FakeKind; by: PlayerIndex | null; id: number };

export type Phase = 'ready' | 'wait' | 'draw' | 'result';

export type RoundReason = 'faster' | 'early' | 'fooled' | 'bothEarly' | 'tooSlow' | 'tie';

export type RoundResult = {
  winner: PlayerIndex | null;
  reason: RoundReason;
  /** Who tapped too early (when that decided it). */
  early: PlayerIndex | null;
  /** Raw reaction times in seconds after DRAW!, or null. */
  times: [number | null, number | null];
  /** The handicap delay that was added to each player's time. */
  penalty: [number, number];
};

export type Event =
  | { type: 'ready'; round: number }
  | { type: 'fake'; fake: Fake }
  | { type: 'draw' }
  | { type: 'shot'; p: PlayerIndex; time: number }
  | { type: 'forgiven'; p: PlayerIndex }
  | { type: 'round'; result: RoundResult }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'win'; p: PlayerIndex | null };

export type Intent = { tap: boolean; power: boolean };

export class QuickDraw {
  score: [number, number] = [0, 0];
  energy: [Energy, Energy];
  phase: Phase = 'ready';
  /** Time spent in the current phase. */
  phaseT = 0;
  round = 1;
  /** Length of this round's wait. Hidden from bots: they only see what is on screen. */
  private waitLen = 0;
  private fakes: Fake[] = [];
  private fakeId = 0;
  private pendingFake: [boolean, boolean] = [false, false];
  /** The fake-out on screen right now, if any. */
  fake: Fake | null = null;
  taps: [number | null, number | null] = [null, null];
  /** Handicap delay added to each player's own tap (from the other player's assist). */
  readonly penalty: [number, number];
  /** Double Shot: early taps that will be forgiven. */
  shots: [number, number] = [0, 0];
  /** Slow Time armed for the next DRAW!. */
  focus: [boolean, boolean] = [false, false];
  private lock: [number, number] = [0, 0];
  last: RoundResult | null = null;
  history: RoundResult[] = [];
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
    this.penalty = [
      lerpAssist(players[1].assist, 0, RULES.maxPenalty),
      lerpAssist(players[0].assist, 0, RULES.maxPenalty),
    ];
    this.startRound();
  }

  private startRound(): void {
    this.phase = 'ready';
    this.phaseT = 0;
    this.taps = [null, null];
    this.fake = null;
    this.waitLen = this.rng.range(RULES.waitMin, RULES.waitMax);
    this.fakes = [];
    const n = this.rng.int(0, 2);
    let at = this.rng.range(0.4, 1.0);
    for (let i = 0; i < n; i++) {
      if (at + RULES.fakeLen + RULES.fakeGap > this.waitLen) break;
      this.fakes.push({ at, kind: this.rng.pick(FAKE_KINDS), by: null, id: ++this.fakeId });
      at += RULES.fakeLen + RULES.fakeGap + this.rng.range(0.2, 1.0);
    }
    this.events.push({ type: 'ready', round: this.round });
  }

  /** Slow Time pulse on this player's side: true just before the real DRAW!. */
  pulse(p: PlayerIndex): boolean {
    return this.focus[p] && this.phase === 'wait' && this.phaseT >= this.waitLen - RULES.pulseLead;
  }

  step(dt: number, intents: [Intent, Intent]): void {
    this.events = [];
    if (this.done) return;
    this.t += dt;
    this.phaseT += dt;
    for (const p of [0, 1] as PlayerIndex[]) {
      this.energy[p].tick(dt);
      this.lock[p] = Math.max(0, this.lock[p] - dt);
      if (this.powersOn && intents[p].power) this.firePower(p);
    }
    if (this.phase === 'ready') {
      if (this.phaseT >= RULES.ready) {
        this.phase = 'wait';
        this.phaseT = 0;
        for (const p of [0, 1] as PlayerIndex[]) if (this.pendingFake[p]) this.addFake(p, 0.5);
        this.pendingFake = [false, false];
      }
      return;
    }
    if (this.phase === 'result') {
      if (this.phaseT >= RULES.result) {
        this.round++;
        this.startRound();
      }
      return;
    }
    if (this.phase === 'wait') {
      // Fake-outs on screen
      const f = this.fakes.find((k) => this.phaseT >= k.at && this.phaseT < k.at + RULES.fakeLen) ?? null;
      if (f && f !== this.fake) this.events.push({ type: 'fake', fake: f });
      this.fake = f;
      const early = ([0, 1] as PlayerIndex[]).filter((p) => intents[p].tap && this.lock[p] <= 0);
      const lost: PlayerIndex[] = [];
      for (const p of early) {
        if (this.shots[p] > 0) {
          this.shots[p]--;
          this.lock[p] = RULES.forgiveLock;
          this.events.push({ type: 'forgiven', p });
        } else lost.push(p);
      }
      if (lost.length) {
        const reason: RoundReason = lost.length === 2 ? 'bothEarly' : this.fake ? 'fooled' : 'early';
        this.finishRound(lost.length === 2 ? null : other(lost[0]), reason, lost.length === 2 ? null : lost[0]);
        return;
      }
      if (this.phaseT >= this.waitLen) {
        this.phase = 'draw';
        this.phaseT = 0;
        this.fake = null;
        this.focus = [false, false];
        this.events.push({ type: 'draw' });
      }
      return;
    }
    // DRAW! is up: record taps, then decide once no later tap could still win.
    for (const p of [0, 1] as PlayerIndex[]) {
      if (intents[p].tap && this.taps[p] === null && this.lock[p] <= 0) {
        this.taps[p] = this.phaseT;
        this.events.push({ type: 'shot', p, time: this.phaseT });
      }
    }
    const eff = (p: PlayerIndex) => (this.taps[p] === null ? Infinity : this.taps[p]! + this.penalty[p]);
    const best = Math.min(eff(0), eff(1));
    const settled = ([0, 1] as PlayerIndex[]).every((p) => this.taps[p] !== null || this.phaseT + this.penalty[p] > best);
    if (best < Infinity && settled) {
      const a = eff(0);
      const b = eff(1);
      if (Math.abs(a - b) < 1e-9) this.finishRound(null, 'tie', null);
      else this.finishRound(a < b ? 0 : 1, 'faster', null);
    } else if (this.phaseT >= RULES.drawTimeout) this.finishRound(null, 'tooSlow', null);
  }

  private addFake(by: PlayerIndex, delay: number): void {
    const at = this.phaseT + delay;
    // Never overlap the real DRAW!: push it back if needed (the same for both players).
    if (at + RULES.fakeLen + RULES.fakeGap > this.waitLen) this.waitLen = at + RULES.fakeLen + RULES.fakeGap + 0.3;
    // Drop scripted fakes that would overlap this one.
    this.fakes = this.fakes.filter((f) => f.at + RULES.fakeLen + RULES.fakeGap < at || f.at > at + RULES.fakeLen + RULES.fakeGap || f.at <= this.phaseT);
    this.fakes.push({ at, kind: this.rng.pick(FAKE_KINDS), by, id: ++this.fakeId });
    this.fakes.sort((x, y) => x.at - y.at);
  }

  private firePower(p: PlayerIndex): void {
    const power = this.players[p].power;
    if (!power || this.phase === 'draw' || !this.energy[p].ready) return;
    if (power.id === 'fakeout') {
      if (this.phase === 'wait') {
        if (this.fake) return; // wait for the current one to pass
        this.energy[p].spend();
        this.addFake(p, 0.15);
      } else {
        if (this.pendingFake[p]) return;
        this.energy[p].spend();
        this.pendingFake[p] = true;
      }
    } else if (power.id === 'slowtime') {
      if (this.focus[p]) return;
      this.energy[p].spend();
      this.focus[p] = true;
    } else if (power.id === 'double') {
      this.energy[p].spend();
      this.shots[p]++;
    } else return;
    this.events.push({ type: 'power', p, id: power.id });
  }

  private finishRound(winner: PlayerIndex | null, reason: RoundReason, early: PlayerIndex | null): void {
    const result: RoundResult = { winner, reason, early, times: [...this.taps] as [number | null, number | null], penalty: [...this.penalty] as [number, number] };
    this.last = result;
    this.history.push(result);
    this.phase = 'result';
    this.phaseT = 0;
    this.fake = null;
    if (winner !== null) {
      this.score[winner]++;
      this.energy[winner].charge(RULES.energyWin, this.score[winner] < this.score[other(winner)]);
      this.energy[other(winner)].charge(RULES.energyLose, true);
    }
    this.events.push({ type: 'round', result });
    if (Math.max(...this.score) >= RULES.winRounds || this.round >= RULES.maxRounds) {
      this.done = true;
      this.winner = this.score[0] === this.score[1] ? null : this.score[0] > this.score[1] ? 0 : 1;
      this.events.push({ type: 'win', p: this.winner });
    }
  }
}

// ---------- Honest bot ----------
// It only reacts to what is on screen. On DRAW! it samples a human-like reaction
// time for its skill; it never taps before the signal, and an easy bot sometimes
// falls for a fake-out (which loses it the round, exactly like a person).
// The times are what a person would see on the round's timer: their reaction
// plus the phone's screen and touch delay, which the bot doesn't otherwise pay.
// Hard is a quick adult (about 0.3 s on a phone), and never beats the fastest
// a person can do (HUMAN.reaction + HUMAN.touchLag).
const BOT = {
  easy: { mean: 0.5, sd: 0.07, fooled: 0.22 },
  normal: { mean: 0.38, sd: 0.045, fooled: 0.05 },
  hard: { mean: 0.3, sd: 0.03, fooled: 0 },
} satisfies Record<BotLevel, { mean: number; sd: number; fooled: number }>;

export const BOT_LEVELS = BOT;
export const MIN_REACTION = HUMAN.reaction + HUMAN.touchLag;

export class QuickDrawBot {
  /** Seconds until the bot's thumb lands, or Infinity when it is not about to tap. */
  private tapIn = Infinity;
  private mode: 'draw' | 'pulse' | 'fooled' | null = null;
  private seenFake = -1;
  private round = -1;

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  reaction(): number {
    const cfg = BOT[this.level];
    // Box-Muller normal sample
    const u = Math.max(1e-9, this.rng.next());
    const v = this.rng.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(MIN_REACTION, cfg.mean + z * cfg.sd);
  }

  think(game: QuickDraw, dt: number): Intent {
    const cfg = BOT[this.level];
    if (game.round !== this.round || game.phase === 'ready' || game.phase === 'result') {
      this.round = game.round;
      this.mode = null;
      this.tapIn = Infinity;
    }
    if (game.phase === 'wait') {
      if (game.fake && game.fake.id !== this.seenFake) {
        this.seenFake = game.fake.id;
        // The bot that played the fake-out knows it is fake.
        if (this.mode === null && game.fake.by !== this.p && this.rng.chance(cfg.fooled)) {
          this.mode = 'fooled';
          this.tapIn = this.reaction() * 0.9;
        }
      }
      if (this.mode === null && game.pulse(this.p)) {
        // Slow Time: the pulse is a head start, but the bot still waits for DRAW!.
        this.mode = 'pulse';
        this.tapIn = RULES.pulseLead + Math.max(0.08, this.reaction() - 0.15);
      }
    } else if (game.phase === 'draw' && (this.mode === null || this.mode === 'fooled')) {
      this.mode = 'draw';
      this.tapIn = this.reaction();
    }
    let tap = false;
    if (this.tapIn !== Infinity) {
      this.tapIn -= dt;
      // A pulse head start never fires before DRAW! is actually on screen.
      const allowed = game.phase === 'draw' || (game.phase === 'wait' && this.mode === 'fooled');
      if (this.tapIn <= 0 && allowed) {
        tap = true;
        this.tapIn = Infinity;
      }
    }
    return { tap, power: game.powersOn && game.energy[this.p].ready && this.wantsPower(game) };
  }

  private wantsPower(game: QuickDraw): boolean {
    const id = game.players[this.p].power?.id;
    if (id === 'fakeout') {
      if (game.phase !== 'wait' || game.fake) return false;
      return this.rng.chance(0.02);
    }
    return game.phase === 'ready';
  }
}
