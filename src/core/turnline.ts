// What the waiting seat reads in a turn game while the other seat moves.
//
// Four in a Row used to show "<name>'s turn" in small grey text (a long read for a small
// kid, and the same words whichever seat was moving), while Checkers and Tic-Tac-Toe said
// "Waiting…" even while a bot was thinking, so a kid sat through the bot's pause with
// nothing saying why. Every board game now uses this one line.

/** A name cut to fit a turn pill (12 characters, then an ellipsis). */
export function shortName(n: string): string {
  return n.length > 12 ? `${n.slice(0, 11)}…` : n;
}

/**
 * The waiting seat's line: "<bot> is thinking…" while a bot picks its move (so the pause
 * reads as the bot's, not a stuck game), otherwise "Waiting…".
 */
export function waitingLine(mover: { name: string; bot?: unknown }): string {
  return mover.bot ? `🤖 ${shortName(mover.name)} is thinking…` : 'Waiting…';
}
