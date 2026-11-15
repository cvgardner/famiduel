import { expect, test } from '@playwright/test';
import games from '../content/games.json' with { type: 'json' };
import { boot } from './helpers';

// F318: with a 12-letter name on a 320 px phone with Bigger text, the countdown's
// "<name> goes first" pill in a turn game ran ~35 units off both screen edges. Every shown
// game's countdown words must stay on screen and clear of its edges (the edge probe).
type Hook = {
  store: { data: { profiles: { name: string; bot: string | null }[]; settings: { bigText: boolean } }; save(): void };
  showHome(): void;
  applyBigText(): void;
  openGame(id: string): void;
  runner: { starterLines(): [string | null, string | null] } | null;
};
type Edges = { on: boolean; over: Map<string, number>; near: Map<string, number> };

test.setTimeout(120_000);
test.use({ viewport: { width: 320, height: 568 }, hasTouch: true });

test('countdown words fit with 12-letter names (320x568, Bigger text)', async ({ page }) => {
  const errors = await boot(page, 'E2E', false);
  const checked: string[] = [];
  for (const id of games.games.filter((g) => !g.hidden).map((g) => g.id)) {
    // Both seats get the long name: the seeded coin toss picks either seat to start.
    for (const names of [['WWWWWWWWWWWW', 'WWWWWWWWWWWW']]) {
      await page.evaluate(([gameId, n]) => {
        const app = (window as unknown as { __famiduel: Hook }).__famiduel;
        app.store.data.settings.bigText = true;
        (n as string[]).forEach((v, i) => {
          app.store.data.profiles[i].name = v;
          app.store.data.profiles[i].bot = null;
        });
        app.store.save();
        app.applyBigText();
        app.showHome();
        app.openGame(gameId as string);
      }, [id, names] as const);
      await page.locator('#ready0').tap();
      await page.locator('#ready1').tap();
      await expect(page.locator('#play')).toBeVisible();
      const lines = await page.evaluate(() => {
        const e = (window as unknown as { __edges: Edges }).__edges;
        e.over.clear();
        e.near.clear();
        e.on = true;
        return (window as unknown as { __famiduel: Hook }).__famiduel.runner!.starterLines();
      });
      await page.waitForTimeout(700);
      const [over, near] = await page.evaluate(() => {
        const e = (window as unknown as { __edges: Edges }).__edges;
        e.on = false;
        return [[...e.over].map(([s]) => s), [...e.near].map(([s]) => s)];
      });
      const mine = lines.filter((l): l is string => !!l);
      checked.push(...mine);
      expect(over.filter((s) => mine.includes(s)), `${id}: starter words off the screen`).toEqual([]);
      expect(near.filter((s) => mine.includes(s)), `${id}: starter words crowding the edge`).toEqual([]);
      await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showHome());
    }
  }
  expect(checked.some((l) => l.startsWith('WWWWWWWWWWWW')), 'a long name was checked').toBe(true);
  expect(errors).toEqual([]);
});
