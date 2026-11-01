// Shared contracts between the app shell and every minigame.

export type PlayerIndex = 0 | 1;
export const PLAYERS: readonly PlayerIndex[] = [0, 1];
export const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

/** How hard an honest bot plays: reaction time and aim noise only, never extra speed or rules. */
export type BotLevel = 'easy' | 'normal' | 'hard';

export type PowerDef = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** Seconds the effect lasts, when it lasts. */
  duration?: number;
};

export type PlayerInfo = {
  name: string;
  color: string;
  /** Effective handicap help, 0 (none) to 3 (most). Each game maps it to its own knob. */
  assist: number;
  /** The power picked for this match, or null in classic mode / games without powers. */
  power: PowerDef | null;
  bot: BotLevel | null;
  /** Left-handed: games with two thumb controls (Tank Duel) swap them for this seat. */
  lefty?: boolean;
};

export type GameResult = {
  /** null is a draw. */
  winner: PlayerIndex | null;
  score: [number, number];
  /** Short line for the result screen, e.g. "5 – 3". */
  summary?: string;
};
