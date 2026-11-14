/** A box in seat-local world units. */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** The same box seen from the top seat (the board turned half a turn about its centre). */
export function turned(b: Box, W: number, H: number): Box {
  return { x0: W - b.x1, x1: W - b.x0, y0: H - b.y1, y1: H - b.y0 };
}

/**
 * F259: room between a card's band (centre line y, half height `half`, spanning x0..x1) and
 * the nearest box beside it; negative when they overlap. Boxes outside x0..x1 don't count.
 */
export function room(y: number, half: number, x0: number, x1: number, boxes: Box[]): number {
  let best = Infinity;
  for (const b of boxes) {
    if (b.x1 < x0 || b.x0 > x1) continue;
    const gap = Math.max(b.y0 - (y + half), y - half - b.y1);
    best = Math.min(best, gap);
  }
  return best;
}

/**
 * F259: the first candidate line whose card leaves `pad` units round every box (the ball,
 * the cup and its flag), else the one with the most room. The first candidate is the card's
 * usual place, so it only moves when something a player is looking at sits under it.
 */
export function clearLine(cands: number[], half: number, x0: number, x1: number, boxes: Box[], pad = 4): number {
  let pick = cands[0];
  let most = -Infinity;
  for (const y of cands) {
    const r = room(y, half, x0, x1, boxes);
    if (r >= pad) return y;
    if (r > most) {
      most = r;
      pick = y;
    }
  }
  return pick;
}
