import { expect, test } from '@playwright/test';
import { boot } from './helpers';

// F320: Minigolf between two people with 12-letter names on a 320 px phone with Bigger text.
// The hole card's "<name> tees off first", the scorecard's column header and "<name> leads by 2"
// were drawn at fixed sizes; no word may run off or crowd the screen's edge (the edge probe).
type Hook = {
  store: { data: { profiles: { name: string; bot: string | null }[]; settings: { bigText: boolean } }; save(): void };
  showHome(): void;
  applyBigText(): void;
  openGame(id: string): void;
  runner: { game: { game: { phase: string; card: unknown[]; score: number[] } } } | null;
};
type Edges = { on: boolean; over: Map<string, number>; near: Map<string, number> };

test.use({ viewport: { width: 320, height: 568 }, hasTouch: true });

test('minigolf hole card and scorecard fit 12-letter names (320x568, Bigger text)', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await boot(page, 'E2E', false);
  await page.evaluate(() => {
    const app = (window as unknown as { __famiduel: Hook }).__famiduel;
    app.store.data.settings.bigText = true;
    for (const p of app.store.data.profiles) {
      p.name = 'WWWWWWWWWWWW';
      p.bot = null;
    }
    app.store.save();
    app.applyBigText();
    app.showHome();
    app.openGame('minigolf');
  });
  await page.locator('#ready0').tap();
  await page.locator('#ready1').tap();
  await expect(page.locator('#play')).toBeVisible();
  await page.evaluate(() => {
    const e = (window as unknown as { __edges: Edges }).__edges;
    e.over.clear();
    e.near.clear();
    e.on = true;
  });
  await page.waitForTimeout(600); // the hole card
  // Jump to the scorecard after hole 1, seat 1 two strokes ahead.
  await page.evaluate(() => {
    const g = (window as unknown as { __famiduel: Hook }).__famiduel.runner!.game.game;
    g.phase = 'card';
    g.card.push({ net: [5, 3], bonus: [0, 0] });
    g.score[0] = 5;
    g.score[1] = 3;
  });
  await page.waitForTimeout(400);
  const [over, near] = await page.evaluate(() => {
    const e = (window as unknown as { __edges: Edges }).__edges;
    e.on = false;
    return [[...e.over].map(([s]) => s), [...e.near].map(([s]) => s)];
  });
  expect(over, 'words off the screen').toEqual([]);
  expect(near, 'words crowding the edge').toEqual([]);
  expect(errors).toEqual([]);
});
