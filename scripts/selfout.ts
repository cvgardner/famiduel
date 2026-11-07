// Self-outs (`npm run sim -- --selfout`): points a player lost on their own, with the other
// player nowhere near: Snake into a wall or their own trail, Sumo off the ring without being
// touched for a second. A game where most lost points are self-outs feels unfair to a small
// kid ("I didn't do anything!"), even when the win rates look fine. Air Hockey isn't counted:
// a goal off your own paddle is nearly always a deflected shot, not a self-out (hard bots
// "own-touch" 85% of goals that way).
import type { PlayerIndex } from '../src/core/types';

/** Seconds a wrestler must have gone untouched for a ring-out to count as walking off. */
export const SUMO_FREE = 1;

export type Tally = { lost: [number, number]; self: [number, number] };

type Ev = { type: string; p?: PlayerIndex; wall?: boolean; x?: number; y?: number; scorer?: PlayerIndex };

/** Counts lost points and self-outs per seat for one game; feed it every step's events. */
export function selfOutCounter(game: string): { tally: Tally; observe(g: never, events: readonly Ev[]): void } | null {
  const tally: Tally = { lost: [0, 0], self: [0, 0] };
  const add = (p: PlayerIndex, self: boolean) => {
    tally.lost[p]++;
    if (self) tally.self[p]++;
  };
  if (game === 'snake')
    return {
      tally,
      observe(g, events) {
        const s = g as unknown as { grid: Uint8Array; idx(x: number, y: number): number };
        for (const e of events) if (e.type === 'crash' && e.p !== undefined) add(e.p, !!e.wall || s.grid[s.idx(e.x!, e.y!)] === e.p + 1);
      },
    };
  if (game === 'sumo')
    return {
      tally,
      observe(g, events) {
        const s = g as unknown as { wrestlers: { freeT: number }[] };
        for (const e of events) if (e.type === 'out' && e.p !== undefined) add(e.p, s.wrestlers[e.p].freeT > SUMO_FREE);
      },
    };
  return null;
}
