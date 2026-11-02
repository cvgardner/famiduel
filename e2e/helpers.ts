import { expect, type Page } from '@playwright/test';

type Hook = {
  store: { data: { profiles: { bot: string | null }[]; settings: { powers: boolean } }; save(): void };
  showHome(): void;
  openGame(id: string): void;
  runner: { fastForward(s: number): void; result: unknown } | null;
};

/**
 * A fresh install. Super powers are off by default (classic rules); most checks turn them on
 * so the power cards stay covered. Pass powers = false to see what a new family sees.
 */
export async function boot(page: Page, seed = 'E2E', powers = true) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?seed=${seed}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.logo')).toContainText('Fami');
  if (powers) {
    await page.evaluate(() => {
      const app = (window as unknown as { __famiduel: Hook }).__famiduel;
      app.store.data.settings.powers = true;
      app.store.save();
      app.showHome();
    });
  }
  return errors;
}

/** Make both players bots, open a game and fast-forward it to the result screen. */
export async function botMatch(page: Page, id: string, maxSeconds = 900) {
  await page.evaluate((gameId) => {
    const app = (window as unknown as { __famiduel: Hook }).__famiduel;
    app.store.data.profiles[0].bot = 'normal';
    app.store.data.profiles[1].bot = 'normal';
    app.store.save();
    app.showHome();
    app.openGame(gameId);
  }, id);
  await expect(page.locator('#play')).toBeVisible();
  await page.evaluate((max) => {
    const app = (window as unknown as { __famiduel: Hook }).__famiduel;
    app.runner!.fastForward(max);
  }, maxSeconds);
  await expect(page.locator('#result')).toBeVisible();
}

/** Press and hold the pause button like a person (it ignores quick taps). */
export async function holdPause(page: Page, ms = 800) {
  const b = (await page.locator('#pauseBtn').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await expect(page.locator('#resumeBtn')).toBeVisible();
}
