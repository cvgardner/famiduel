import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// docs/app-store/listing.md is pasted into App Store Connect, which refuses text over
// its limits. This keeps edits to the listing inside them.
const md = readFileSync(join(import.meta.dirname, '../docs/app-store/listing.md'), 'utf8');

const row = (field: string) => md.match(new RegExp(`^\\| ${field} \\| (.+?) \\|`, 'm'))![1].trim();
/** The text under a `### Heading` up to the next heading. */
const section = (heading: string) => {
  const start = md.indexOf(`### ${heading}`);
  const body = md.slice(md.indexOf('\n', start) + 1);
  return body.slice(0, body.search(/^#{2,3} /m)).trim();
};

describe('App Store listing text', () => {
  it('name and subtitle fit in 30 characters', () => {
    expect(row('Name').length).toBeLessThanOrEqual(30);
    expect(row('Subtitle').length).toBeLessThanOrEqual(30);
  });

  it('promotional text fits in 170 and the description in 4000', () => {
    expect(section('Promotional text').length).toBeLessThanOrEqual(170);
    const desc = section('Description');
    expect(desc.length).toBeGreaterThan(500);
    expect(desc.length).toBeLessThanOrEqual(4000);
  });

  it("What's New fits in 4000", () => {
    const news = section("What's New in This Version (4000)");
    expect(news.length).toBeGreaterThan(50);
    expect(news.length).toBeLessThanOrEqual(4000);
  });

  it('keywords fit in 100, with no spaces after commas and no repeats of the name', () => {
    const kw = section('Keywords').split('\n').pop()!.trim();
    expect(kw.length).toBeLessThanOrEqual(100);
    expect(kw).not.toMatch(/, /);
    const named = new Set(`${row('Name')} ${row('Subtitle')}`.toLowerCase().split(/[^a-z0-9]+/));
    for (const k of kw.split(',')) expect(named.has(k), `"${k}" is already in the name or subtitle`).toBe(false);
  });

  it('names only games that are shown on the home screen', () => {
    const games = JSON.parse(readFileSync(join(import.meta.dirname, '../content/games.json'), 'utf8')).games as {
      name: string;
      hidden?: boolean;
    }[];
    const desc = section('Description');
    for (const g of games) {
      if (g.hidden) expect(desc, `${g.name} is hidden`).not.toContain(g.name);
      else expect(desc, `${g.name} is missing`).toContain(g.name);
    }
    expect(desc).toContain(`${games.filter((g) => !g.hidden).length} GAMES`);
  });
});
