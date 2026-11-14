import { expect, test } from '@playwright/test';
import games from '../content/games.json' with { type: 'json' };
import { boot, botMatch, holdPause } from './helpers';

test('home shows the games and both players', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator('.game-card')).toHaveCount(games.games.filter((g) => !g.hidden).length);
  // Hidden games (board games families already own) have no card.
  for (const g of games.games.filter((x) => x.hidden)) await expect(page.locator(`.game-card[data-id="${g.id}"]`)).toHaveCount(0);
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

test('a fresh install plays classic: powers and auto handicap off, no power cards', async ({ page }) => {
  const errors = await boot(page, 'E2E', false);
  // Settings live on their own screen behind the gear on home.
  await page.click('#settingsBtn');
  await expect(page.locator('#settings')).toBeVisible();
  await expect(page.locator('#home')).toBeHidden();
  await expect(page.locator('.settings input[data-k="powers"]')).not.toBeChecked();
  await expect(page.locator('.settings input[data-k="autoHandicap"]')).not.toBeChecked();
  await page.click('#settingsBack');
  await expect(page.locator('#home')).toBeVisible();
  await page.locator('.game-card[data-id="airhockey"]').click();
  await expect(page.locator('#intro')).toBeVisible();
  await expect(page.locator('.power-card')).toHaveCount(0);
  await expect(page.locator('#ready0')).toBeEnabled();
  await page.click('#ready0');
  await page.click('#ready1');
  await expect(page.locator('#play')).toBeVisible();
  // Turning powers on from home brings the power cards back.
  await holdPause(page);
  await page.click('#quitBtn');
  await page.click('#settingsBtn');
  await page.locator('.settings input[data-k="powers"]').check();
  await page.click('#settingsBack');
  await page.locator('.game-card[data-id="airhockey"]').click();
  await expect(page.locator('.power-card[data-p="0"]').first()).toBeVisible();
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
    // Hidden games have no card but stay built and playable, so they keep this check.
    if (!g.hidden) {
      const ready = await page.locator(`.game-card[data-id="${g.id}"]`).getAttribute('data-ready');
      test.skip(ready !== '1', 'not built yet');
    }
    await botMatch(page, g.id);
    await expect(page.locator('.res-title').first()).toBeVisible();
    await expect(page.locator('.night-score, .res-night').first()).toContainText(/1|0/);
    // F218: both halves say what the score counts, and Minigolf says fewer strokes win.
    await expect(page.locator('#result .res-unit')).toHaveCount(2);
    if (g.id === 'minigolf') await expect(page.locator('#result .res-unit').first()).toContainText('fewest wins');
    await page.click('#rematchBtn');
    await expect(page.locator('#intro')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

// F149: words popped on the same hit or point take different lanes. Ping Pong printed
// "Rally x5!" right over SMASH!/Curve! (~30 times in 9 bot matches) and "What a rally!" over
// "Match point!"; Air Hockey's power name sat inside GOAL! (F148). The probe in fx.ts lists
// any two pops born in the same step whose words overlap in the same seat. F150: pops born
// together now stack like lines of text in every game, so every action game is checked.
for (const id of ['pingpong', 'airhockey', 'sumo', 'penalty', 'snacksnatch', 'snake', 'quickdraw', 'tanks', 'chopchop', 'minigolf', 'seabattle']) {
  test(`pops born together never overlap: ${id}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await boot(page, `POPS-${id}`);
    const hits: string[] = [];
    for (const level of ['easy', 'normal', 'hard']) {
      await page.evaluate(([gameId, lvl]) => {
        const app = (window as unknown as { __famiduel: { store: { data: { profiles: { bot: string | null }[] }; save(): void }; showHome(): void; openGame(id: string): void } }).__famiduel;
        app.store.data.profiles[0].bot = lvl;
        app.store.data.profiles[1].bot = lvl;
        app.store.save();
        app.showHome();
        app.openGame(gameId);
      }, [id, level]);
      await expect(page.locator('#play')).toBeVisible();
      hits.push(...(await page.evaluate(() => {
        const w = window as unknown as { __famiduel: { runner: { fastForward(s: number): void } }; __pops: { on: boolean; hits: string[] } };
        w.__pops.hits = [];
        w.__pops.on = true;
        w.__famiduel.runner.fastForward(900);
        w.__pops.on = false;
        return w.__pops.hits;
      })));
      await expect(page.locator('#result')).toBeVisible();
    }
    expect(hits).toEqual([]);
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

test('7-game tournament: bots play it through to a champion, and a quit game waits', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __famiduel: { store: { data: { profiles: { bot: string | null }[] }; save(): void }; showHome(): void } }).__famiduel;
    app.store.data.profiles[0].bot = 'normal';
    app.store.data.profiles[1].bot = 'normal';
    app.store.save();
    app.showHome();
  });
  await page.click('#tourneyBtn');
  await expect(page.locator('#tourney')).toBeVisible();
  await expect(page.locator('.lineup .slot')).toHaveCount(7);
  await expect(page.locator('.slot.next')).toHaveCount(1);
  // F113: before game 1, tapping a game swaps it for one not in the lineup (3 swaps).
  await expect(page.locator('.slot-swap')).toHaveCount(7);
  await expect(page.locator('.tourney-swaps')).toContainText('3 swaps left');
  const before = (await page.locator('.lineup .sname').allTextContents());
  await page.locator('.slot-swap').first().click();
  const after = await page.locator('.lineup .sname').allTextContents();
  const swappedIn = after[0];
  expect(swappedIn).not.toBe(before[0]);
  expect(before).not.toContain(swappedIn);
  expect(after.slice(1)).toEqual(before.slice(1));
  expect(new Set(after).size).toBe(7);
  await expect(page.locator('.tourney-swaps')).toContainText('2 swaps left');
  await expect(page.locator('#tourneyPlay')).toContainText(swappedIn);
  // Quitting the first game leaves it next in line.
  const first = await page.locator('#tourneyPlay').textContent();
  await page.click('#tourneyPlay');
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('.tourney-tag')).toHaveCount(1);
  await holdPause(page);
  await page.click('#quitBtn');
  await expect(page.locator('#tourney')).toBeVisible();
  await expect(page.locator('#tourneyPlay')).toHaveText(first!);
  await expect(page.locator('.slot-swap')).toHaveCount(7); // a quit game isn't game 1 played
  for (let i = 0; i < 20; i++) {
    if (!(await page.locator('#tourneyPlay').count())) break;
    await page.click('#tourneyPlay');
    await expect(page.locator('#play')).toBeVisible();
    // Game 1 is the swapped-in game.
    if (i === 0) await expect(page.locator('.intro-title').first()).toContainText(swappedIn);
    await page.evaluate(() => (window as unknown as { __famiduel: { runner: { fastForward(s: number): void } } }).__famiduel.runner.fastForward(900));
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('.res-night').first()).toContainText('Tournament');
    await page.click('#tourneyNextBtn');
    await expect(page.locator('#tourney')).toBeVisible();
    // Swapping ends once game 1 is played.
    if (i === 0) await expect(page.locator('.slot-swap')).toHaveCount(0);
  }
  await expect(page.locator('.tourney-title')).toContainText('wins the tournament');
  await expect(page.locator('#tourneyAgain')).toBeVisible();
  // The finished lineup still shows the swapped-in game first.
  await expect(page.locator('.lineup .sname').first()).toHaveText(swappedIn);
  // Home offers a fresh tournament again.
  await page.click('#tourneyHome');
  await expect(page.locator('#tourneyBtn')).toContainText('7-game tournament');
  expect(errors).toEqual([]);
});
