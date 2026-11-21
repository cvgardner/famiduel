import { expect, test, type Page } from '@playwright/test';

// Fair ads in the store build, walked in a browser with `?fakeads` stand-ins (engine/ads.ts):
// an ad only when a result screen is left, never during a match; Remove ads (no in-app
// question: Apple's purchase sheet confirms) makes them stop; a plain browser has no ads
// and no purchase row.

type Hook = {
  store: { data: { profiles: { bot: string | null }[]; ads?: { removed: boolean; launches: number } }; save(): void };
  showHome(): void;
  openGame(id: string): void;
  runner: { fastForward(s: number): void } | null;
};

async function open(page: Page, query: string) {
  await page.goto(`/?seed=ADS${query}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.logo')).toContainText('Fami');
}

async function botMatch(page: Page) {
  await page.evaluate(() => {
    const app = (window as unknown as { __famiduel: Hook }).__famiduel;
    app.store.data.profiles[0].bot = 'normal';
    app.store.data.profiles[1].bot = 'normal';
    app.store.save();
    app.showHome();
    app.openGame('airhockey');
  });
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('#fakeAd')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(900));
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#fakeAd'), 'no ad on the result screen itself').toHaveCount(0);
}

test('a plain browser: no ads, no Remove ads row, footer still says no ads', async ({ page }) => {
  await open(page, '');
  await page.click('#settingsBtn');
  await expect(page.locator('#removeAds')).toHaveCount(0);
  await expect(page.locator('.foot')).toContainText('no ads');
  await page.click('#settingsBack');
  await botMatch(page);
  await page.click('#rematchBtn');
  await expect(page.locator('#intro')).toBeVisible();
  await expect(page.locator('#fakeAd')).toHaveCount(0);
});

test('an ad only shows after a result, and Rematch goes on once it is closed', async ({ page }) => {
  await open(page, '&fakeads=now');
  await botMatch(page);
  await page.click('#rematchBtn');
  await expect(page.locator('#fakeAd')).toBeVisible();
  await expect(page.locator('#intro')).toBeHidden();
  await page.click('#fakeAdClose');
  await expect(page.locator('#intro')).toBeVisible();
});

test('the first launch is ad-free with the real rules', async ({ page }) => {
  await open(page, '&fakeads');
  for (let i = 0; i < 3; i++) {
    await botMatch(page);
    await page.click('#rematchBtn');
    await expect(page.locator('#intro')).toBeVisible();
    await expect(page.locator('#fakeAd')).toHaveCount(0);
  }
  const launches = await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.store.data.ads?.launches);
  expect(launches).toBe(1);
});

test('Remove ads: buys straight from Settings, then no more ads, and it survives a reload', async ({ page }) => {
  await open(page, '&fakeads=now');
  await page.click('#settingsBtn');
  await expect(page.locator('#removeAds')).toContainText('$4.99');
  await expect(page.locator('#restoreAds')).toBeVisible();
  await page.click('#removeAds');
  await expect(page.locator('#gateQ'), 'no grown-ups question first').toHaveCount(0);
  await expect(page.locator('#adsGone')).toContainText('Ads removed');
  await page.click('#settingsBack');
  await botMatch(page);
  await page.click('#rematchBtn');
  await expect(page.locator('#intro')).toBeVisible();
  await expect(page.locator('#fakeAd')).toHaveCount(0);
  await page.reload();
  await page.click('#settingsBtn');
  await expect(page.locator('#adsGone')).toBeVisible();
});

// F391: rival apps' reviews complain of ads after restoring a purchase. A reinstall or a new
// phone gets Remove ads back with Restore, or with no tap when the store answers at launch.
async function noAdAfterMatch(page: Page) {
  await botMatch(page);
  await page.click('#rematchBtn');
  await expect(page.locator('#intro')).toBeVisible();
  await expect(page.locator('#fakeAd'), 'no ad once Remove ads is back').toHaveCount(0);
}

test('Restore purchase on a fresh install removes ads, and it survives a reload', async ({ page }) => {
  await open(page, '&fakeads=now&fakeowned');
  await page.click('#settingsBtn');
  await expect(page.locator('#removeAds')).toBeVisible();
  await page.click('#restoreAds');
  await expect(page.locator('#adsGone')).toContainText('Ads removed');
  await page.click('#settingsBack');
  await noAdAfterMatch(page);
  await page.reload();
  await page.click('#settingsBtn');
  await expect(page.locator('#adsGone')).toBeVisible();
  await page.click('#settingsBack');
  await noAdAfterMatch(page);
});

test('the store saying it is owned at launch removes ads with no tap', async ({ page }) => {
  await open(page, '&fakeads=now&fakeowned&fakestore');
  await page.click('#settingsBtn');
  await expect(page.locator('#adsGone')).toBeVisible();
  await page.click('#settingsBack');
  await noAdAfterMatch(page);
});

test('Restore with nothing bought says so, and ads go on', async ({ page }) => {
  await open(page, '&fakeads=now');
  await page.click('#settingsBtn');
  await page.click('#restoreAds');
  await expect(page.locator('#restoreAds')).toContainText('Nothing to restore');
  await expect(page.locator('#adsGone')).toHaveCount(0);
  await page.click('#settingsBack');
  await botMatch(page);
  await page.click('#rematchBtn');
  await expect(page.locator('#fakeAd')).toBeVisible();
});

test('a refund (the store says not owned at launch) brings ads back', async ({ page }) => {
  await open(page, '&fakeads=now&fakestore');
  await page.evaluate(() => {
    const app = (window as unknown as { __famiduel: Hook }).__famiduel;
    app.store.data.ads = { removed: true, launches: 5 };
    app.store.save();
  });
  await page.reload();
  await expect(page.locator('.logo')).toContainText('Fami');
  await page.click('#settingsBtn');
  await expect(page.locator('#removeAds')).toBeVisible();
  await expect(page.locator('#adsGone')).toHaveCount(0);
  await page.click('#settingsBack');
  await botMatch(page);
  await page.click('#rematchBtn');
  await expect(page.locator('#fakeAd')).toBeVisible();
});
