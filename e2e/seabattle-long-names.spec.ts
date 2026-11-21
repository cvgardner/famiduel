import { expect, test } from '@playwright/test';
import { boot } from './helpers';

// F321: Sea Battle between two people with 12-letter names on a 320 px phone with Bigger text.
// The header ("WWWWWWWWWWWW, hide your fleet", "..., you go first!") was drawn at a fixed size
// (the Radar / Mine notices are checked in tests/seabattle-long-names.test.ts); through placement, the hand-overs and the first shot's screen no word may
// run off or crowd the screen's edge (the edge probe).
type Hook = {
  store: { data: { profiles: { name: string; bot: string | null }[]; settings: { bigText: boolean } }; save(): void };
  showHome(): void;
  applyBigText(): void;
  openGame(id: string): void;
};
type Edges = { on: boolean; over: Map<string, number>; near: Map<string, number> };

test.use({ viewport: { width: 320, height: 568 }, hasTouch: true });

test('sea battle header and notices fit 12-letter names (320x568, Bigger text)', async ({ page }) => {
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
    app.openGame('seabattle');
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
  const tap = async (x: number, y: number) => {
    await page.touchscreen.tap(box.x + (box.width * x) / 360, box.y + (box.height * y) / 640);
    await page.waitForTimeout(700);
  };
  // Bottom seat: cover, Ready with the fleet as dealt; top seat (turned): cover, Ready; then the
  // first shooter's cover, and the firing screen.
  await tap(180, 445);
  await tap(274, 433);
  await tap(180, 445);
  await tap(86, 207);
  await tap(180, 445);
  await tap(180, 195);
  await page.waitForTimeout(500);
  const [over, near] = await page.evaluate(() => {
    const e = (window as unknown as { __edges: Edges }).__edges;
    e.on = false;
    return [[...e.over].map(([s]) => s), [...e.near].map(([s]) => s)];
  });
  expect(over, 'words off the screen').toEqual([]);
  expect(near, 'words crowding the edge').toEqual([]);
  expect(errors).toEqual([]);
});
