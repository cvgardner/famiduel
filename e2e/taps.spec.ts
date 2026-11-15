import { expect, test, type Locator, type Page } from '@playwright/test';
import { boot, botMatch } from './helpers';

// F305: a rival two-player minigame app's top store complaint is a hard-to-navigate UI. The
// common paths stay a few taps long, and every button on them shows without scrolling, also
// on a small phone with Bigger text. Counts (per docs/verification.md):
//   home -> playing: the game's card, then each person's Ready (1 + 1 each)
//   result -> rematch: Rematch, then each person's Ready (1 + 1 each)
//   result -> another game: Games, the card, then each person's Ready (2 + 1 each)
type Hook = { store: { data: { profiles: { bot: string | null }[]; settings: { bigText: boolean } }; save(): void }; showHome(): void; applyBigText(): void };

/** A button or the first game card must show whole (F307: also after a match, on a small phone). */
async function tap(target: Locator, taps: { n: number }) {
  await expect(target).toBeVisible();
  await expect(target, 'on screen without scrolling').toBeInViewport({ ratio: 1 });
  await target.click();
  taps.n++;
}

async function people(page: Page, bigText: boolean) {
  await page.evaluate((big) => {
    const app = (window as unknown as { __famiduel: Hook }).__famiduel;
    for (const p of app.store.data.profiles) p.bot = null;
    app.store.data.settings.bigText = big;
    app.store.save();
    // F307: menus only take Bigger text once it's applied (as the Settings switch does).
    app.applyBigText();
  }, bigText);
  if (bigText) await expect(page.locator('html')).toHaveAttribute('data-bigtext', '1');
}

async function readyUp(page: Page, taps: { n: number }) {
  await expect(page.locator('#intro')).toBeVisible();
  await tap(page.locator('#ready0'), taps);
  await tap(page.locator('#ready1'), taps);
  await expect(page.locator('#play')).toBeVisible();
}

for (const [label, size, big] of [
  ['390x844', { width: 390, height: 844 }, false],
  ['320x568 with Bigger text', { width: 320, height: 568 }, true],
] as const) {
  test.describe(`fewest taps to play (${label})`, () => {
    test.use({ viewport: size, hasTouch: true });
    test('home -> playing takes the card and each Ready', async ({ page }) => {
      const errors = await boot(page, 'E2E', false);
      await people(page, big);
      await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showHome());
      const taps = { n: 0 };
      // The first card shows whole without scrolling (others are a scroll down the list).
      await tap(page.locator('.game-card[data-ready="1"]').first(), taps);
      await readyUp(page, taps);
      expect(taps.n).toBe(3);
      expect(errors).toEqual([]);
    });
    test('result -> rematch, and result -> another game', async ({ page }) => {
      const errors = await boot(page, 'E2E', false);
      await botMatch(page, 'airhockey');
      await people(page, big);
      // The result screen ignores taps for a moment (a tap meant for the game).
      const rematch = { n: 0 };
      await expect(page.locator('#rematchBtn')).toBeEnabled();
      await page.waitForTimeout(1200);
      await tap(page.locator('#rematchBtn'), rematch);
      await readyUp(page, rematch);
      expect(rematch.n).toBe(3);

      await botMatch(page, 'airhockey');
      await people(page, big);
      await page.waitForTimeout(1200);
      const other = { n: 0 };
      await tap(page.locator('#homeBtn'), other);
      await expect(page.locator('#home')).toBeVisible();
      await tap(page.locator('.game-card[data-ready="1"]').first(), other);
      await readyUp(page, other);
      expect(other.n).toBe(4);
      expect(errors).toEqual([]);
    });
  });
}
