// How long the screen stays on your fleet after the bot's shots land, before it
// hands the phone back. A kid needs time to find where the shot went; a hit or a
// sinking is the moment they most want to see, so it stays longest.

export type TurnLog = { hits: number; misses: number; sunk: number };

/** Seconds the bot's result stays on screen, counted from when its last shell lands. */
export function botBeat(log: TurnLog): number {
  if (log.sunk) return 2.2;
  if (log.hits) return 1.6;
  return 0.9;
}

/** The header line naming what the bot just did (to your fleet, if `yours`). */
export function botResultTitle(name: string, log: TurnLog, yours = true): string {
  if (log.sunk) return `${name} sank a ship!`;
  if (log.hits > 1) return `${name} hit ${log.hits} times!`;
  if (log.hits) return yours ? `${name} hit your ship!` : `${name} hit a ship!`;
  return `${name} missed!`;
}
