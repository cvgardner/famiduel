// Rock Paper Scissors rules: pure and deterministic. Both players pick in
// secret; once both have picked, the round resolves. First to 3 round wins;
// ties replay. After 30 rounds whoever leads wins (or it is a draw).
import type { Rng } from '../../core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../../core/types';

export const RULES = { winRounds: 3, maxRounds: 30 };

export const CHOICES = ['rock', 'paper', 'scissors'] as const;
export type Choice = (typeof CHOICES)[number];
export const ICONS: Record<Choice, string> = { rock: '✊', paper: '✋', scissors: '✌️' };

/** Does a beat b? */
export const beats = (a: Choice, b: Choice) =>
  (a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper');

export type Event =
  | { type: 'picked'; p: PlayerIndex }
  | { type: 'round'; picks: [Choice, Choice]; winner: PlayerIndex | null }
  | { type: 'win'; p: PlayerIndex | null };

export class Rps {
  picks: [Choice | null, Choice | null] = [null, null];
  /** The last resolved round, kept for the reveal until next() is called. */
  last: { picks: [Choice, Choice]; winner: PlayerIndex | null } | null = null;
  score: [number, number] = [0, 0];
  rounds = 0;
  winner: PlayerIndex | null = null;
  done = false;
  events: Event[] = [];

  constructor(readonly players: [PlayerInfo, PlayerInfo]) {}

  /** True while the last round is being revealed (no picks accepted). */
  get revealing(): boolean {
    return this.last !== null;
  }

  pick(p: PlayerIndex, c: Choice): boolean {
    this.events = [];
    if (this.done || this.revealing || this.picks[p] !== null) return false;
    this.picks[p] = c;
    this.events.push({ type: 'picked', p });
    const [a, b] = this.picks;
    if (a && b) {
      const winner: PlayerIndex | null = beats(a, b) ? 0 : beats(b, a) ? 1 : null;
      if (winner !== null) this.score[winner]++;
      this.rounds++;
      this.last = { picks: [a, b], winner };
      this.events.push({ type: 'round', picks: [a, b], winner });
      const [s0, s1] = this.score;
      if (s0 >= RULES.winRounds || s1 >= RULES.winRounds || this.rounds >= RULES.maxRounds) {
        this.done = true;
        this.winner = s0 > s1 ? 0 : s1 > s0 ? 1 : null;
        this.events.push({ type: 'win', p: this.winner });
      }
    }
    return true;
  }

  /** Clear the reveal and start the next round. */
  next(): void {
    if (this.done) return;
    this.last = null;
    this.picks = [null, null];
  }
}

// ---------- Bot ----------
// Pure random from the seeded rng, at a human-ish pace. It never looks at the
// other pick (there is nothing to be good at), so skill only changes the pace.
const PACE = { easy: [0.9, 2.0], normal: [0.6, 1.6], hard: [0.4, 1.2] } satisfies Record<BotLevel, number[]>;

export class RpsBot {
  constructor(
    readonly p: PlayerIndex,
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  /** Seconds to wait before picking this round. */
  delay(): number {
    const [a, b] = PACE[this.level];
    return this.rng.range(a, b);
  }

  choose(): Choice {
    return this.rng.pick(CHOICES);
  }
}
