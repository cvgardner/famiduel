/**
 * The losing half's headline on the result screen (F223). "So close!" only when it was close:
 * one apart, or within a fifth of the winner's score (Snack Snatch 12 – 15). A 3 – 10 Minigolf
 * or 0 – 5 Air Hockey loss reads "Good game!" instead, so the word stays honest.
 */
export function loserTitle(mine: number, theirs: number): string {
  const gap = Math.abs(mine - theirs);
  const top = Math.max(Math.abs(mine), Math.abs(theirs));
  return gap <= 1 || gap <= top * 0.2 ? 'So close!' : 'Good game!';
}
