// Tug of War rules: tap fast in your half to pull the rope toward you. Pull the red ribbon
// past your line to win the round; first to 2 rounds wins. Pure and deterministic for a seed.
//
// The pull model, so mashing is fair and spam can't glitch it:
// - Each player has a grip `force` that every counted tap adds to and that fades away
//   (time constant RULES.tau), so you must keep tapping to keep pulling.
// - A tap counts only when RULES.minTapGap has passed since that player's last counted one:
//   five fingers landing together, a palm, or a bouncing touch are one pull, not five.
// - Grip is capped at RULES.maxForce (about 10 taps a second), so tapping beyond that pulls
//   no harder.
// - The rope has weight: the two grips' difference accelerates it against drag, so it sways
//   and strains instead of jumping.
// - A long, even round can't go on for ever: from RULES.closeAt both lines slide in toward
//   the middle ("the lines are closing in!"), so any lead soon wins; at RULES.roundTime the
//   ribbon's side decides it.
import { Energy } from '../../core/energy';
import { HUMAN } from '../../core/human';
import { lerpAssist } from '../../core/handicap';
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';
import { other } from '../../core/types';

export const RULES = {
  winRounds: 2,
  /** Void rounds (a dead-centre ribbon at the time limit) don't score; stop after this many. */
  maxRounds: 5,
  /** "Ready… PULL!" before rounds 2 and on (round 1 starts on the app's own 3 2 1 GO). */
  ready: 1.4,
  result: 2.4,
  /** Each player's line, as a fraction of the way from the middle to their edge's mark. */
  line: 1,
  /** At assist 3 the assisted player's own line sits this close (they pull less far). */
  lineAt3: 0.8,
  /** Pull strength per head-start star (assist 0..3, in between is interpolated). Tug of War
   *  is a tap-rate race, so a gain only wins once it closes the gap in taps a second (easy
   *  4.3, normal 5.7, hard 7.2): a straight line to 1.5 did nothing at one star, and three
   *  stars never caught hard (F353). */
  gainByStar: [1, 1.3, 1.45, 1.75],
  /** Extra grip per head-start star while that player keeps tapping (a tap in the last
   *  assistHold seconds). A slow, uneven tapper (a small kid) gets most from it: a gain only
   *  multiplies a grip they barely have, so kid+3 never beat easy. 0.2 at three stars: kid+3 v
   *  easy 0% -> 54% (n=160; 0.17 read 20%, 0.22 78%), the easy bot's ladder unchanged (F363). */
  assistGrip: [0, 0, 0.05, 0.2],
  assistHold: 0.8,
  /** Grip added per counted tap, and how fast it fades (seconds). Steady grip ≈ taps/s × tau. */
  tapPull: 1,
  tau: 0.35,
  /** Grip cap: a steady 10 taps a second. */
  maxForce: 3.5,
  /** Shortest gap between two counted taps of one player (spam and multi-touch guard). */
  minTapGap: 0.06,
  /** Rope response: acceleration per unit of grip difference, and drag. */
  accel: 0.7,
  drag: 4,
  /** From this long into a round the lines slide in, over closeLen seconds, to closeTo of the way.
   *  Tap-war reviews complain of sore fingers in long pulls: even bots' rounds ran p90 27-28 s at
   *  8 / 14 / 30 s; now every level's p90 round is under 20 s of tapping (F364). */
  closeAt: 5,
  closeLen: 8,
  closeTo: 0.1,
  /** A round ends here: the ribbon's side wins it. */
  roundTime: 20,
  /** Energy per counted tap, for winning and for losing a round. A full bar: ~20 s of pulling. */
  energyTap: 0.007,
  energyWin: 0.12,
  energyLose: 0.35,
  // Powers
  /** Mighty Heave: your pulls count this much more. */
  heaveGain: 1.6,
  /** Butter Rope: the other player's pulls count this much. */
  butterGain: 0.5,
  /** Big Yank: wind-up seconds, then the ribbon jumps this far toward you. */
  yankWindup: 0.6,
  yankJump: 0.45,
  /** Each tap the other player makes during the wind-up shrinks the yank by this... */
  yankResist: 0.1,
  /** ...down to this fraction of it. */
  yankMin: 0.25,
};

export type Phase = 'ready' | 'pull' | 'result';

export type RoundReason = 'line' | 'time' | 'void';

export type RoundResult = { winner: PlayerIndex | null; reason: RoundReason; round: number };

export type Event =
  | { type: 'ready'; round: number }
  | { type: 'go'; round: number }
  | { type: 'pull'; p: PlayerIndex }
  | { type: 'power'; p: PlayerIndex; id: string }
  | { type: 'yank'; p: PlayerIndex; jump: number }
  /** A long round: the lines start sliding in. */
  | { type: 'closing' }
  | { type: 'round'; result: RoundResult }
  | { type: 'win'; p: PlayerIndex | null };

/** `tap`: a new touch landed in the player's half this step (any number of fingers = one). */
export type Intent = { tap: boolean; power: boolean };

/** Toward-you sign: player 0 (bottom) pulls the ribbon down, to +1; player 1 up, to -1. */
export const toward = (p: PlayerIndex): 1 | -1 => (p === 0 ? 1 : -1);

export class TugOfWar {
  score: [number, number] = [0, 0];
  energy: [Energy, Energy];
  phase: Phase = 'pull';
  phaseT = 0;
  round = 1;
  /** Ribbon position: 0 is the middle, +1 is player 0's mark, -1 player 1's. */
  pos = 0;
  /** Ribbon speed (units a second, + toward player 0). */
  vel = 0;
  /** Each player's grip (see the file comment). */
  force: [number, number] = [0, 0];
  /** Where each player's own winning line is (they win when the ribbon passes it). */
  readonly line: [number, number];
  /** Pull strength from the handicap. */
  readonly gain: [number, number];
  /** Extra grip from the handicap while tapping (RULES.assistGrip). */
  readonly bonus: [number, number];
  /** Counted taps this round (the result card's "taps" line, and the bot sim's rate check). */
  taps: [number, number] = [0, 0];
  /** Seconds since each player's last counted tap. */
  private since: [number, number] = [Infinity, Infinity];
  /** Big Yank winding up: seconds left, and how much of it is still on. */
  yank: [{ t: number; left: number } | null, { t: number; left: number } | null] = [null, null];
  /** How far the lines had closed when the round ended. */
  private closedTo = 1;
  last: RoundResult | null = null;
  history: RoundResult[] = [];
  winner: PlayerIndex | null = null;
  done = false;
  events: Event[] = [];
  t = 0;

  constructor(
    readonly players: [PlayerInfo, PlayerInfo],
    readonly powersOn: boolean,
    // Kept for the contract (every game takes one); the rules use no randomness.
    _rng: Rng,
  ) {
    this.energy = [new Energy(players[0].assist), new Energy(players[1].assist)];
    this.line = [lerpAssist(players[0].assist, RULES.line, RULES.lineAt3), lerpAssist(players[1].assist, RULES.line, RULES.lineAt3)];
    this.gain = [gainFor(players[0].assist), gainFor(players[1].assist)];
    this.bonus = [lerpTable(RULES.assistGrip, players[0].assist), lerpTable(RULES.assistGrip, players[1].assist)];
  }

  /** Power p's effect is running (Heave, Anchor, Steady Grip, or the Butter it put on the other player). */
  active(p: PlayerIndex, id: string): boolean {
    return this.players[p].power?.id === id && this.energy[p].active > 0;
  }

  /** How hard a tap of p pulls right now (handicap and powers). */
  pullGain(p: PlayerIndex): number {
    let g = this.gain[p];
    if (this.active(p, 'heave')) g *= RULES.heaveGain;
    if (this.active(other(p), 'butter')) g *= RULES.butterGain;
    // Anchor: the rope is tied off at the other end, so p's pulls hold nothing for a moment.
    if (this.active(other(p), 'anchor')) g = 0;
    return g;
  }

  /** p's grip on the rope: their tapping grip, plus the head start's while they keep tapping. */
  grip(p: PlayerIndex): number {
    return this.force[p] + (this.since[p] < RULES.assistHold ? this.bonus[p] : 0);
  }

  /** How far in the lines have closed, 1 (where they start) down to RULES.closeTo. */
  closing(): number {
    if (this.phase === 'result') return this.closedTo;
    if (this.phase !== 'pull') return 1;
    const k = Math.min(1, Math.max(0, this.phaseT - RULES.closeAt) / RULES.closeLen);
    return 1 - (1 - RULES.closeTo) * k;
  }

  /** Where p's winning line is right now (it slides in during a long round). */
  lineNow(p: PlayerIndex): number {
    return this.line[p] * this.closing();
  }

  /** Strain on the rope, 0..1 (both grips together): the view's sway, shake and lean. */
  strain(): number {
    return Math.min(1, (this.force[0] + this.force[1]) / (2 * RULES.maxForce));
  }

  /** How far the ribbon is toward p's line, 0 (middle) to 1 (on it); negative = toward theirs. */
  progress(p: PlayerIndex): number {
    return (this.pos * toward(p)) / this.lineNow(p);
  }

  step(dt: number, intents: [Intent, Intent]): void {
    this.events = [];
    if (this.done) return;
    this.t += dt;
    this.phaseT += dt;
    for (const p of [0, 1] as PlayerIndex[]) {
      this.energy[p].tick(dt);
      this.since[p] += dt;
    }
    if (this.phase === 'ready') {
      // Grips relax between rounds; taps before PULL! don't count.
      this.relax(dt);
      if (this.phaseT >= RULES.ready) {
        this.phase = 'pull';
        this.phaseT = 0;
        this.events.push({ type: 'go', round: this.round });
      }
      return;
    }
    if (this.phase === 'result') {
      this.relax(dt);
      if (this.phaseT >= RULES.result) this.startRound();
      return;
    }
    if (this.phaseT >= RULES.closeAt && this.phaseT - dt < RULES.closeAt) this.events.push({ type: 'closing' });
    for (const p of [0, 1] as PlayerIndex[]) if (this.powersOn && intents[p].power) this.firePower(p);
    const decay = Math.exp(-dt / RULES.tau);
    for (const p of [0, 1] as PlayerIndex[]) {
      // Steady Grip: p's grip doesn't fade while it runs.
      if (!this.active(p, 'grip')) this.force[p] *= decay;
      if (!intents[p].tap || this.since[p] < RULES.minTapGap) continue;
      this.since[p] = 0;
      this.taps[p]++;
      this.force[p] = Math.min(RULES.maxForce, this.force[p] + RULES.tapPull);
      this.events.push({ type: 'pull', p });
      const losing = this.pos * toward(p) < 0 || this.score[p] < this.score[other(p)];
      this.energy[p].charge(RULES.energyTap, losing);
      // A tap during the other player's Big Yank wind-up braces against it.
      const y = this.yank[other(p)];
      if (y) y.left = Math.max(RULES.yankMin, y.left - RULES.yankResist);
    }
    const net = this.grip(0) * this.pullGain(0) - this.grip(1) * this.pullGain(1);
    this.vel += (net * RULES.accel - this.vel * RULES.drag) * dt;
    // Anchor: the ribbon can't slide toward the other player's line (a Big Yank still jolts it).
    for (const p of [0, 1] as PlayerIndex[]) if (this.active(p, 'anchor') && this.vel * toward(p) < 0) this.vel = 0;
    this.pos += this.vel * dt;
    for (const p of [0, 1] as PlayerIndex[]) {
      const y = this.yank[p];
      if (!y) continue;
      y.t -= dt;
      if (y.t <= 0) {
        const jump = RULES.yankJump * y.left;
        this.yank[p] = null;
        this.pos += jump * toward(p);
        // The jolt carries a little: the rope keeps sliding toward the yanker for a moment.
        this.vel += jump * toward(p) * 2;
        this.events.push({ type: 'yank', p, jump });
      }
    }
    for (const p of [0, 1] as PlayerIndex[]) {
      if (this.progress(p) >= 1) {
        this.finishRound(p, 'line');
        return;
      }
    }
    if (this.phaseT >= RULES.roundTime) {
      if (Math.abs(this.pos) < 1e-6) this.finishRound(null, 'void');
      else this.finishRound(this.pos > 0 ? 0 : 1, 'time');
    }
  }

  private relax(dt: number): void {
    const decay = Math.exp(-dt / RULES.tau);
    this.force[0] *= decay;
    this.force[1] *= decay;
    this.vel *= decay;
  }

  private firePower(p: PlayerIndex): void {
    const power = this.players[p].power;
    if (!power || !this.energy[p].ready) return;
    if (power.id === 'heave' || power.id === 'butter' || power.id === 'anchor' || power.id === 'grip') {
      this.energy[p].spend(power.duration ?? 3);
    } else if (power.id === 'yank') {
      if (this.yank[p]) return;
      this.energy[p].spend(RULES.yankWindup);
      this.yank[p] = { t: RULES.yankWindup, left: 1 };
    } else return;
    this.events.push({ type: 'power', p, id: power.id });
  }

  private finishRound(winner: PlayerIndex | null, reason: RoundReason): void {
    const result: RoundResult = { winner, reason, round: this.round };
    this.last = result;
    this.history.push(result);
    // The lines stay where they had closed to, for the result card.
    this.closedTo = this.closing();
    this.phase = 'result';
    this.phaseT = 0;
    this.yank = [null, null];
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

  private startRound(): void {
    this.round++;
    this.phase = 'ready';
    this.phaseT = 0;
    this.pos = 0;
    this.vel = 0;
    this.taps = [0, 0];
    this.events.push({ type: 'ready', round: this.round });
  }
}

/** Pull strength for a head start of `assist` stars (0..3), from RULES.gainByStar. */
export function gainFor(assist: number): number {
  return lerpTable(RULES.gainByStar, assist);
}

// ---------- Honest bot ----------
// It taps the same "tap" a person does, at a person's speeds: easy is a small kid, hard a
// quick adult, and every level stays under HUMAN.tapGap (about 8 taps a second; a person
// mashing with two thumbs can beat that). It starts pulling a reaction time after PULL!,
// slows for a breath now and then like a person, and digs in a little harder when the
// ribbon nears its own losing line (it sees the rope, as a person does). It never knows
// anything a person can't see.
export const BOT = {
  easy: { rate: 4.3, jitter: 0.3, breath: 0.06, react: 0.45 },
  normal: { rate: 5.7, jitter: 0.18, breath: 0.035, react: 0.32 },
  hard: { rate: 7.2, jitter: 0.08, breath: 0.015, react: 0.24 },
} satisfies Record<BotLevel, { rate: number; jitter: number; breath: number; react: number }>;

/** F422: how late the bot sees the ribbon (where it is, which way it slides), like a person. */
export const TUG_REACT = HUMAN.reaction;

export class TugOfWarBot {
  private next = Infinity;
  private phase: Phase | null = null;
  private round = -1;
  private clock = 0;
  /** What it saw each frame this round: the ribbon toward its own side, and its slide. */
  private seen: { t: number; progress: number; vel: number }[] = [];

  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  private gap(game: TugOfWar): number {
    const cfg = BOT[this.level];
    // Digging in: up to 10% faster as the ribbon nears its own losing line.
    const danger = Math.max(0, Math.min(1, -this.view(game).progress - 0.4) / 0.6);
    const rate = cfg.rate * (1 + 0.1 * danger);
    let gap = (1 / rate) * (1 + (this.rng.next() * 2 - 1) * cfg.jitter);
    if (this.rng.chance(cfg.breath)) gap += this.rng.range(0.25, 0.55);
    return Math.max(HUMAN.tapGap, gap);
  }

  think(game: TugOfWar, dt: number): Intent {
    const cfg = BOT[this.level];
    if (game.phase !== this.phase || game.round !== this.round) {
      this.phase = game.phase;
      this.round = game.round;
      this.next = game.phase === 'pull' ? Math.max(HUMAN.reaction, cfg.react + this.rng.range(0, 0.1)) : Infinity;
      this.seen = [];
    }
    this.clock += dt;
    this.seen.push({ t: this.clock, progress: game.progress(this.p), vel: game.vel * toward(this.p) });
    while (this.seen.length > 1 && this.seen[1].t <= this.clock - TUG_REACT + 1e-9) this.seen.shift();
    let tap = false;
    this.next -= dt;
    if (this.next <= 0) {
      tap = true;
      this.next = this.gap(game);
    }
    return { tap, power: game.powersOn && game.phase === 'pull' && game.energy[this.p].ready && this.wantsPower(game) };
  }

  /** The ribbon as it looked a reaction time ago (as it was at PULL! before then). */
  private view(game: TugOfWar): { progress: number; vel: number } {
    const old = this.seen[0];
    if (old && old.t <= this.clock - TUG_REACT + 1e-9) return old;
    return { progress: old?.progress ?? game.progress(this.p), vel: 0 };
  }

  private wantsPower(game: TugOfWar): boolean {
    const id = game.players[this.p].power?.id;
    if (id === 'yank') {
      if (game.yank[this.p]) return false;
      // Once the round has got going, like Heave and Butter (waiting for either line came too late).
      return game.phaseT > 1 && this.rng.chance(0.03);
    }
    if (id === 'anchor') {
      // Tie off while the ribbon is sliding the wrong way.
      return game.phaseT > 1 && this.view(game).vel < 0 && this.rng.chance(0.05);
    }
    // Heave, Butter and Steady Grip: once the round has got going.
    return game.phaseT > 1 && this.rng.chance(0.03);
  }
}

/** A per-star table read at `assist` stars (0..3), in between interpolated. */
function lerpTable(t: readonly number[], assist: number): number {
  const a = Math.max(0, Math.min(t.length - 1, assist));
  const i = Math.min(t.length - 2, Math.floor(a));
  return t[i] + (t[i + 1] - t[i]) * (a - i);
}
