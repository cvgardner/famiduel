import { expect, test } from '@playwright/test';
import games from '../content/games.json' with { type: 'json' };
import { boot, botMatch, holdPause } from './helpers';

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
  await holdPause(page);
  await page.click('#quitBtn');
  await expect(page.locator('#home')).toBeVisible();
  expect(errors).toEqual([]);
});

test('pause needs a press and hold: a quick tap only shows a hint', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __famiduel: { store: { data: { profiles: { bot: string | null }[] }; save(): void }; openGame(id: string): void } }).__famiduel;
    app.store.data.profiles[0].bot = 'normal';
    app.store.data.profiles[1].bot = 'normal';
    app.store.save();
    app.openGame('airhockey');
  });
  await expect(page.locator('#play')).toBeVisible();
  // A quick tap (a resting hand, a missed paddle swipe) keeps the game going.
  await page.click('#pauseBtn');
  await expect(page.locator('#pauseHint')).toBeVisible();
  await expect(page.locator('#pauseHint span')).toHaveText(['Hold to pause', 'Hold to pause']);
  await page.waitForTimeout(300);
  await expect(page.locator('#modal')).toBeHidden();
  // Sliding off the button before the ring fills cancels too.
  const b = (await page.locator('#pauseBtn').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('#pauseBtn')!.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('#modal')).toBeHidden();
  // Holding fills the ring and pauses; Resume carries on.
  await holdPause(page);
  await page.click('#resumeBtn');
  await expect(page.locator('#modal')).toBeHidden();
  // Escape (keyboard) pauses at once.
  await page.keyboard.press('Escape');
  await expect(page.locator('#resumeBtn')).toBeVisible();
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

test.describe('a flat phone that flips to landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  test('keeps the table portrait and taps land where the finger is', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(screen, 'orientation', {
        configurable: true,
        value: Object.assign(new EventTarget(), { angle: 90, type: 'landscape-primary' }),
      });
    });
    const errors = await boot(page);
    await expect(page.locator('#app')).toHaveAttribute('data-turn', '-90');
    await page.locator('.game-card[data-id="minigolf"]').click();
    await page.locator('.power-card[data-p="0"]').first().click();
    await page.locator('.power-card[data-p="1"]').first().click();
    await page.click('#ready0');
    await page.click('#ready1');
    await expect(page.locator('#play')).toBeVisible();
    const r = await page.evaluate(() => {
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const st = (window as unknown as { __famiduel: { stage: { toWorld(x: number, y: number): { x: number; y: number } } } }).__famiduel.stage;
      // rotate(-90deg): the world's bottom (player 0) is on the screen's right, its top on the left.
      return { w: c.clientWidth, h: c.clientHeight, mid: st.toWorld(422, 195), right: st.toWorld(800, 195), left: st.toWorld(44, 195) };
    });
    expect(r.h).toBeGreaterThan(r.w); // laid out portrait
    expect(r.mid.x).toBeCloseTo(180, 0);
    expect(r.mid.y).toBeCloseTo(320, 0);
    expect(r.right.y).toBeGreaterThan(560);
    expect(r.left.y).toBeLessThan(80);
    expect(errors).toEqual([]);
  });
});
