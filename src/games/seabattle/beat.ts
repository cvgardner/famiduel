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

/**
 * Seconds a person's own result stays on screen, counted from when their last
 * shell lands (not from the shot: the shell flies 0.38 s, so a clock started at
 * the shot showed a miss for a blink). `volley` is the shot that ended the turn
 * (with hit-again that is usually a miss after some hits). When two people pass
 * the phone, the shooter also needs to read "Now pass the phone".
 */
export function shooterBeat(volley: TurnLog, passing: boolean): number {
  const base = volley.sunk ? 1.6 : volley.hits ? 1.2 : 0.6;
  return base + (passing ? 0.6 : 0);
}

/**
 * The header for a person's own result. The title names the shot that ended the
 * turn (a turn ends on a miss after hits, so "Direct hit!" would be wrong); the
 * turn's earlier hits go on the second line. `inFlight`: the shell hasn't landed,
 * so the result isn't given away yet.
 */
export function shooterResult(volley: TurnLog, turn: TurnLog, passing: boolean, inFlight: boolean): { title: string; sub: string } {
  const pass = passing ? 'Now pass the phone' : '';
  if (inFlight) return { title: 'Fire!', sub: '' };
  const title = volley.sunk ? 'You sank a ship!' : volley.hits ? 'Direct hit!' : 'Missed…';
  const earlier = turn.hits - volley.hits;
  const tally = !volley.hits && earlier > 0 ? `${earlier} hit${earlier > 1 ? 's' : ''} this turn` : '';
  return { title, sub: [tally, pass].filter(Boolean).join(' · ') };
}
