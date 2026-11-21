import { describe, expect, it } from 'vitest';
import games from '../content/games.json';
import { cardPicHtml, hasCardPic } from '../src/app/cardpic';

describe('home card pictures', () => {
  it('every game, hidden board games included, has a still picture of itself', () => {
    expect(games.games.length).toBe(16);
    for (const g of games.games) {
      expect(hasCardPic(g.id), g.id).toBe(true);
      const svg = cardPicHtml(g.id);
      expect(svg).toMatch(new RegExp(`^<svg class="card-pic" data-game="${g.id}" viewBox="1 1 62 42"`));
      // Both players are in it, in their seat colours (bottom = seat 1, top = seat 2).
      expect(svg, `${g.id} shows the bottom player`).toContain('var(--y');
      expect(svg, `${g.id} shows the top player`).toContain('var(--t');
      // A still: nothing on the home screen moves (and reduce motion has nothing to stop).
      expect(svg).not.toContain('<animate');
      // No stray NaN or undefined from a helper.
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it('an unknown game has none, so its card keeps the emoji', () => {
    expect(hasCardPic('nope')).toBe(false);
    expect(cardPicHtml('nope')).toBe('');
  });
});
