// What a person's thumbs can do. Honest bots press buttons through the same
// intents as people, and must stay inside these limits too (tests/bot-limits.test.ts
// plays every action game bot-vs-bot at every level and checks them).

export const HUMAN = {
  /**
   * A fast adult's reaction to something they see change (a DRAW! signal, a gun
   * finishing its reload), in seconds. Typical adults are nearer 0.25.
   */
  reaction: 0.2,
  /**
   * Delay a person pays on a phone and a bot reading the game state doesn't: the
   * frame reaching the screen plus the touch reaching the game. Count it when a
   * bot's reaction is compared with a person's measured one (Quick Draw's timer).
   */
  touchLag: 0.05,
  /** Shortest gap between two presses of the same button: about 8 taps a second. */
  tapGap: 0.12,
} as const;
