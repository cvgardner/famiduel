import { expect, type Page } from '@playwright/test';

type Hook = {
  store: { data: { profiles: { bot: string | null }[]; settings: { powers: boolean } }; save(): void };
  showHome(): void;
  openGame(id: string): void;
  runner: { fastForward(s: number): void; result: unknown } | null;
};

export async function boot(page: Page, seed = 'E2E') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?seed=${seed}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.logo')).toContainText('Fami');
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
