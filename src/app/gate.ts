// Parental gate: a question a grown-up answers in a second and a pre-reader can't, used
// before anything meant for parents (tips today; sharing and the unlock screen later).
// The sum is written in words ("seven times six") so a kid can't just copy digits, and a
// wrong answer brings a new question instead of letting them guess the same one again.
import type { Rng } from '../core/rng';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

export type GateQuestion = { a: number; b: number; text: string };

/** A times-table question with both numbers from 3 to 9, never the same as `last`. */
export function gateQuestion(rng: Rng, last?: GateQuestion): GateQuestion {
  for (;;) {
    const a = rng.int(3, 9);
    const b = rng.int(3, 9);
    if (last && last.a === a && last.b === b) continue;
    return { a, b, text: `What is ${WORDS[a]} times ${WORDS[b]}?` };
  }
}

/** True when what was typed is the right answer (spaces ignored, digits only). */
export function gateOpens(q: GateQuestion, typed: string): boolean {
  const t = typed.trim();
  return /^\d{1,3}$/.test(t) && Number(t) === q.a * q.b;
}
