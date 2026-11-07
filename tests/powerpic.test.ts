import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import games from '../content/games.json';
import { hasPowerPic, powerPicHtml } from '../src/app/powerpic';
import { howToHalfHtml } from '../src/app/demo';

const FREE = ['minigolf', 'airhockey', 'sumo', 'pingpong', 'penalty', 'snacksnatch'];
const table = (powers as { games: Record<string, { id: string; name: string; icon: string; desc: string }[]> }).games;

describe('power pictures', () => {
  it('every power of the pictured games has a looping picture', () => {
    for (const g of FREE) {
      expect(table[g]?.length, g).toBe(3);
      for (const p of table[g]) {
        expect(hasPowerPic(g, p.id), `${g}/${p.id}`).toBe(true);
        const svg = powerPicHtml(g, p.id);
        expect(svg).toMatch(/^<svg class="power-pic" data-power="[a-z]+" viewBox="0 0 64 44"/);
        expect(svg).toContain('repeatCount="indefinite"');
        expect(svg).toContain('dur="2s"');
        // "You" are drawn in the seat colour.
        expect(svg, `${g}/${p.id} shows you`).toContain('var(--c');
        // Every animation's key times and values line up (a mismatch silently draws nothing).
        for (const m of svg.matchAll(/values="([^"]*)" keyTimes="([^"]*)"/g)) {
          const kt = m[2].split(';').map(Number);
          expect(m[1].split(';').length, `${g}/${p.id}: ${m[0]}`).toBe(kt.length);
          expect(kt[0]).toBe(0);
          expect(kt[kt.length - 1]).toBe(1);
          for (let i = 1; i < kt.length; i++) expect(kt[i]).toBeGreaterThanOrEqual(kt[i - 1]);
        }
      }
    }
  });

  it('an unknown power has none, and How to play leaves it out', () => {
    expect(powerPicHtml('tanks', 'nope')).toBe('');
    const tanks = games.games.find((g) => g.id === 'tanks')!;
    const html = howToHalfHtml({ p: 0, name: 'Mia', color: '#3fa9ff', bot: false, power: { id: 'nope', icon: '⚡', name: 'X', desc: 'y' } }, tanks);
    expect(html).not.toContain('power-pic');
  });

  it("How to play shows a person's picked power picture, never a bot's", () => {
    const sumo = games.games.find((g) => g.id === 'sumo')!;
    const power = table.sumo[0];
    const mine = howToHalfHtml({ p: 1, name: 'Mia', color: '#3fa9ff', bot: false, power }, sumo);
    expect(mine).toContain(`class="power-pic" data-power="${power.id}"`);
    const bot = howToHalfHtml({ p: 1, name: 'Bot', color: '#3fa9ff', bot: true, power }, sumo);
    expect(bot).not.toContain('power-pic');
  });
});
