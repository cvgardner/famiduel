import { describe, expect, it } from 'vitest';
import games from '../content/games.json';
import { DEMO_MATCHES, demoHelpHtml, demoHtml, GESTURES, HelpMemory, howToHalfHtml, isGesture, showsDemo } from '../src/app/demo';

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

  it('remembers a "?" tap for that game, seat and person until a match is played', () => {
    const m = new HelpMemory();
    expect(m.wants('sumo', 0, 'Mia')).toBe(false);
    m.mark('sumo', 0, 'Mia');
    expect(m.wants('sumo', 0, 'Mia')).toBe(true);
    // Only that game, that seat, that person.
    expect(m.wants('minigolf', 0, 'Mia')).toBe(false);
    expect(m.wants('sumo', 1, 'Mia')).toBe(false);
    expect(m.wants('sumo', 0, 'Dad')).toBe(false);
    // Still wanted until a match of it is finished (backing out of the intro keeps it).
    expect(m.wants('sumo', 0, 'Mia')).toBe(true);
    m.played('sumo', 0, 'Mia');
    expect(m.wants('sumo', 0, 'Mia')).toBe(false);
    // Tapping "?" again brings it back again.
    m.mark('sumo', 0, 'Mia');
    expect(m.wants('sumo', 0, 'Mia')).toBe(true);
  });
});

describe('how to play, from the pause menu', () => {
  const tanks = games.games.find((g) => g.id === 'tanks')!;
  const person = { p: 0, name: 'Mia', color: '#3fa9ff', bot: false };

  it("shows a person the finger, the how-to line and their power, in their seat's half", () => {
    const power = { icon: '⚡', name: 'Turbo', desc: 'Drive twice as fast for 3 s.' };
    const html = howToHalfHtml({ ...person, p: 1, power }, tanks);
    expect(html).toContain('class="half p1"');
    expect(html).toContain('data-gesture="stick"');
    expect(html).toContain(tanks.howTo);
    expect(html).toContain('Your power: Turbo');
    expect(html).toContain(power.desc);
  });

  it('mirrors the stick finger for a left-handed seat, and leaves out a power not picked', () => {
    const html = howToHalfHtml({ ...person, lefty: true, power: null }, tanks);
    expect(html).toContain('demo lefty g-stick');
    expect(html).not.toContain('my-power');
  });

  it("gives a bot's half no finger and no how-to", () => {
    const html = howToHalfHtml({ ...person, bot: true }, tanks);
    expect(html).toContain('half p0 bot');
    expect(html).not.toContain('class="demo');
    expect(html).not.toContain(tanks.howTo);
  });

  it('escapes the player name', () => {
    expect(howToHalfHtml({ ...person, name: '<b>Al' }, tanks)).toContain('&#60;b&#62;Al');
  });

  it('has a finger for every game', () => {
    for (const g of games.games) expect(howToHalfHtml(person, g), g.id).toContain('class="demo');
  });
});
