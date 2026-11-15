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

/**
 * F311: who each number on a result half's score belongs to. The half's own number comes
 * first and reads "You" (a bot's own half, in a bot-vs-bot match, keeps the bot's name);
 * the other number names the other side: "Bot" when a person played the bot, else that
 * player's name. A bare "2 – 3" left a kid asking which one was theirs.
 */
export function scoreLabels(names: readonly [string, string], bots: readonly [boolean, boolean], p: 0 | 1): [string, string] {
  const o = p === 0 ? 1 : 0;
  const mine = bots[p] ? names[p] : 'You';
  const theirs = bots[o] && !bots[p] ? 'Bot' : names[o];
  return [mine, theirs];
}
