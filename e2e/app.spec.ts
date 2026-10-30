import { expect, test } from '@playwright/test';
import games from '../content/games.json' with { type: 'json' };
import { boot, botMatch } from './helpers';

test('home shows the games and both players', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator('.game-card')).toHaveCount(games.games.length);
  await expect(page.locator('.player-chip')).toHaveCount(2);
  await expect(page.locator('.game-card[data-ready="1"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('edit a player: name and head start', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('.player-chip').first().click();
  await page.fill('#pName', 'Maya');
  await page.locator('#pHead button[data-v="2"]').click();
  await page.click('#pDone');
  await expect(page.locator('.player-chip').first()).toContainText('Maya');
  await expect(page.locator('.player-chip').first()).toContainText('★★');
  expect(errors).toEqual([]);
});

test('two people pick powers, play air hockey, and see the result', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('.game-card[data-id="airhockey"]').click();
  await expect(page.locator('#intro')).toBeVisible();
  await expect(page.locator('#ready0')).toBeDisabled();
  await page.locator('.power-card[data-p="0"]').first().click();
  await page.locator('.power-card[data-p="1"]').nth(1).click();
  await page.click('#ready0');
  await page.click('#ready1');
  await expect(page.locator('#play')).toBeVisible();
  // A finger drag on the bottom half moves player 0's paddle without errors.
  const box = (await page.locator('#stage').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up();
  await page.click('#pauseBtn');
  await page.click('#quitBtn');
  await expect(page.locator('#home')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const g of games.games) {
  test(`bot vs bot: ${g.id} plays to a result`, async ({ page }) => {
    const errors = await boot(page);
    const ready = await page.locator(`.game-card[data-id="${g.id}"]`).getAttribute('data-ready');
    test.skip(ready !== '1', 'not built yet');
    await botMatch(page, g.id);
    await expect(page.locator('.res-title').first()).toBeVisible();
    await expect(page.locator('.night-score, .res-night').first()).toContainText(/1|0/);
    await page.click('#rematchBtn');
    await expect(page.locator('#intro')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
