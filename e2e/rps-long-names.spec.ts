import { expect, test } from '@playwright/test';
import { boot } from './helpers';

// F319: Rock Paper Scissors between two people with 12-letter names on a 320 px phone with
// Bigger text. The pass-and-play lines naming a player ("<name>, pick in secret", "<name> has
// picked ✓", "<me> 0 – 0 <them>") ran off the screen; through two picks no word may run off
// or crowd the screen's edge (the edge probe).
type Hook = {
  store: { data: { profiles: { name: string; bot: string | null }[]; settings: { bigText: boolean } }; save(): void };
  showHome(): void;
  applyBigText(): void;
  openGame(id: string): void;
};
type Edges = { on: boolean; over: Map<string, number>; near: Map<string, number> };

test.use({ viewport: { width: 320, height: 568 }, hasTouch: true });

test('rps pick screens fit 12-letter names (320x568, Bigger text)', async ({ page }) => {
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
    app.openGame('rps');
  });
  await page.locator('#ready0').tap();
  await page.locator('#ready1').tap();
  await expect(page.locator('#play')).toBeVisible();
  await page.waitForTimeout(3800); // countdown
  await page.evaluate(() => {
    const e = (window as unknown as { __edges: Edges }).__edges;
    e.over.clear();
    e.near.clear();
    e.on = true;
  });
  const box = (await page.locator('canvas').boundingBox())!;
  for (let i = 0; i < 2; i++) {
    // The cover's "Tap when only you are looking" button, then the middle card (Paper).
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.69);
    await page.waitForTimeout(500);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.66);
    await page.waitForTimeout(500);
  }
  const [over, near] = await page.evaluate(() => {
    const e = (window as unknown as { __edges: Edges }).__edges;
    e.on = false;
    return [[...e.over].map(([s]) => s), [...e.near].map(([s]) => s)];
  });
  expect(over, 'words off the screen').toEqual([]);
  expect(near, 'words crowding the edge').toEqual([]);
  expect(errors).toEqual([]);
});
