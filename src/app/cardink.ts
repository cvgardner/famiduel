import { inkOn, parseColor } from '../core/contrast';

/**
 * Where a home game card's name sits, its gradient (style.css `.game-card`) has darkened the
 * card colour to about this much of itself: the gradient runs from the colour at 38% of the
 * card's height to 62% of it at the bottom, and the name sits near 65%.
 */
export const NAME_SHADE = 0.83;

/** White or dark ink for a game card's name, judged on the shade actually behind it. */
export function cardInk(hex: string): string {
  const c = parseColor(hex);
  if (!c) return '#ffffff';
  const h = (v: number) => Math.round(v * NAME_SHADE).toString(16).padStart(2, '0');
  return inkOn(`#${h(c[0])}${h(c[1])}${h(c[2])}`);
}
