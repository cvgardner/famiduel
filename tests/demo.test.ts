import { describe, expect, it } from 'vitest';
import games from '../content/games.json';
import { DEMO_MATCHES, demoHelpHtml, demoHtml, GESTURES, isGesture, showsDemo } from '../src/app/demo';

describe('ghost finger demo', () => {
  it('every game names a known gesture', () => {
    for (const g of games.games) expect(isGesture((g as { gesture?: string }).gesture), g.id).toBe(true);
    expect(isGesture('wiggle')).toBe(false);
  });

  it('shows for the first matches of a game only, counted per game', () => {
    const rec = (game: string) => ({ game });
    const some = Array.from({ length: DEMO_MATCHES - 1 }, () => rec('sumo'));
    expect(showsDemo([], 'sumo')).toBe(true);
    expect(showsDemo(some, 'sumo')).toBe(true);
    expect(showsDemo([...some, rec('sumo')], 'sumo')).toBe(false);
    expect(showsDemo([...some, rec('sumo')], 'minigolf')).toBe(true);
  });

  it('renders a finger for every gesture, hidden from screen readers', () => {
    for (const g of GESTURES) {
      const html = demoHtml(g);
      expect(html).toContain(`g-${g}`);
      expect(html).toContain('class="f"');
      expect(html).toContain('aria-hidden="true"');
    }
  });

  it('mirrors only the stick for a left-handed player', () => {
    expect(demoHtml('stick', true)).toContain('class="demo lefty g-stick"');
    expect(demoHtml('tap', true)).not.toContain('lefty');
    expect(demoHtml('stick')).not.toContain('lefty');
  });

  it('the "?" that brings the finger back is a labelled button for its seat', () => {
    const html = demoHelpHtml(1);
    expect(html).toMatch(/^<button class="demo-help"/);
    expect(html).toContain('data-p="1"');
    expect(html).toContain('aria-label="Show me how to play"');
  });
});
