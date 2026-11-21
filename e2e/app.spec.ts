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
  await expect(page.locator('.sheet .why')).toHaveCount(0); // F323: only a pause nobody pressed says why
  await page.click('#quitBtn');
  await expect(page.locator('#home')).toBeVisible();
  expect(errors).toEqual([]);
});

// F322: Ping Pong between two still paddles rallied forever (a 900 s run ended 1-1, "Rally 879").
test('two people who both walk away from a real-time game find it paused', async ({ page }) => {
  const errors = await boot(page);
  type R = { __famiduel: { runner: { fastForward(s: number): void; result: unknown; paused: boolean } } };
  for (const id of ['pingpong', 'airhockey']) {
    await page.evaluate(() => (window as unknown as { __famiduel: { showHome(): void } }).__famiduel.showHome());
    await page.locator(`.game-card[data-id="${id}"]`).click();
    await page.locator('.power-card[data-p="0"]').first().click();
    await page.locator('.power-card[data-p="1"]').first().click();
    await page.click('#ready0');
    await page.click('#ready1');
    await expect(page.locator('#play')).toBeVisible();
    await page.evaluate(() => (window as unknown as R).__famiduel.runner.fastForward(900));
    await expect(page.locator('#resumeBtn')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as R).__famiduel.runner.result)).toBeNull();
    // F323: the sheet says why it paused, so nobody wonders who pressed pause.
    await expect(page.locator('.sheet .why')).toHaveText('Nobody was playing, so we paused.');
    await page.click('#quitBtn');
    await expect(page.locator('#home')).toBeVisible();
  }
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

test('a screen reader or switch press (a click with no pointer) pauses at once', async ({ page }) => {
  // F393: VoiceOver and TalkBack activate a focused button with a click that has no pointer
  // press before it (detail 0), as Enter and Space do. The hold-to-pause ring only guards
  // fingers, so those presses must pause straight away; a finger's quick tap still doesn't.
  const errors = await boot(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __famiduel: { store: { data: { profiles: { bot: string | null }[] }; save(): void }; openGame(id: string): void } }).__famiduel;
    app.store.data.profiles[0].bot = 'normal';
    app.store.data.profiles[1].bot = 'normal';
    app.store.save();
    app.openGame('airhockey');
  });
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('#pauseBtn')).toHaveAttribute('aria-label', /Pause/);
  await page.evaluate(() => (document.querySelector('#pauseBtn') as HTMLButtonElement).click());
  await expect(page.locator('#resumeBtn'), 'an assistive click (detail 0) pauses').toBeVisible();
  await page.click('#resumeBtn');
  await expect(page.locator('#modal')).toBeHidden();
  await page.focus('#pauseBtn');
  await page.keyboard.press('Enter');
  await expect(page.locator('#resumeBtn'), 'Enter on the focused button pauses').toBeVisible();
  await page.click('#resumeBtn');
  await expect(page.locator('#modal')).toBeHidden();
  await page.focus('#pauseBtn');
  await page.keyboard.press(' ');
  await expect(page.locator('#resumeBtn'), 'Space on the focused button pauses').toBeVisible();
  await page.click('#quitBtn');
  await expect(page.locator('#home')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Resume counts 3-2-1 before play goes on; hiding the page pauses the match', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __famiduel: { store: { data: { profiles: { bot: string | null }[] }; save(): void }; openGame(id: string): void } }).__famiduel;
    app.store.data.profiles[0].bot = 'normal';
    app.store.data.profiles[1].bot = 'normal';
    app.store.save();
    app.openGame('airhockey');
  });
  await expect(page.locator('#play')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __famiduel: { runner: { countdownLeft(): number } } }).__famiduel.runner.countdownLeft())).toBe(0);
  await holdPause(page);
  await page.click('#resumeBtn');
  await expect(page.locator('#modal')).toBeHidden();
  // Play waits for a fresh countdown (1.8 s), with no "You go first!" lines.
  expect(await page.evaluate(() => (window as unknown as { __famiduel: { runner: { countdownLeft(): number } } }).__famiduel.runner.countdownLeft())).toBeGreaterThan(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __famiduel: { runner: { countdownLeft(): number } } }).__famiduel.runner.countdownLeft()), { timeout: 4000 }).toBe(0);
  // The pause how-to's Resume counts too.
  await holdPause(page);
  await page.click('#howBtn');
  await page.click('#helpResume');
  await expect(page.locator('#modal')).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __famiduel: { runner: { countdownLeft(): number } } }).__famiduel.runner.countdownLeft())).toBeGreaterThan(1);
  // A call or app switch (page hidden) pauses at once.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#resumeBtn')).toBeVisible();
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
for (const id of ['pingpong', 'airhockey', 'sumo', 'penalty', 'snacksnatch', 'snake', 'quickdraw', 'tanks', 'chopchop', 'minigolf', 'seabattle', 'tugofwar', 'minipool']) {
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

// F255: on a 320 px phone "Match night · 0 games" broke with "games" alone on its own line.
test('home: the match-night count and its word stay on one line on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page);
  for (const solo of [false, true]) {
    if (solo) await page.locator('button', { hasText: 'Play the bot' }).click();
    const count = page.locator('.night-score span .nw');
    await expect(count).toHaveText(/^\d+ games?$/);
    expect(await count.evaluate((e) => e.getClientRects().length)).toBe(1);
  }
});

// F258: every setting a family sets is still there after the app is closed and opened again
// (Game Accessibility Guidelines, general basic: "ensure that all settings are saved").
test('settings and player cards are remembered after a reload', async ({ page }) => {
  const errors = await boot(page, 'E2E', false);
  await page.click('#settingsBtn');
  const keys = await page.locator('.settings input[data-k]').evaluateAll((els) => els.map((e) => [(e as HTMLInputElement).dataset.k!, (e as HTMLInputElement).checked] as const));
  // Text size moved from a switch to Usual / Bigger / Largest (F311), so one fewer switch.
  expect(keys.length, 'every toggle row is covered').toBeGreaterThanOrEqual(4);
  // Flip every toggle away from where a fresh install has it, and pick the dark look and Largest text.
  for (const [k] of keys) await page.locator('label.toggle', { has: page.locator(`input[data-k="${k}"]`) }).click();
  await page.locator('#themeSeg button[data-v="dark"]').click();
  await page.locator('#textSeg button[data-v="largest"]').click();
  await page.click('#settingsBack');
  // A player card: name, colour, head start, left hand.
  await page.locator('.player-chip').first().click();
  await page.fill('#pName', 'Maya');
  const colour = (await page.locator('.swatch:not(.on):not(.taken)').first().getAttribute('data-c'))!;
  await page.locator(`.swatch[data-c="${colour}"]`).click();
  await page.locator('#pHead button[data-v="3"]').click();
  await page.locator('#pHand button[data-v="left"]').click();
  await page.click('#pDone');

  await page.reload();
  await expect(page.locator('.logo')).toContainText('Fami');
  await page.click('#settingsBtn');
  for (const [k, was] of keys) {
    const input = page.locator(`.settings input[data-k="${k}"]`);
    if (was) await expect(input, `${k} stays off`).not.toBeChecked();
    else await expect(input, `${k} stays on`).toBeChecked();
  }
  await expect(page.locator('#themeSeg button.on')).toHaveAttribute('data-v', 'dark');
  await expect(page.locator('#textSeg button.on')).toHaveAttribute('data-v', 'largest');
  await expect(page.locator('html')).toHaveAttribute('data-largesttext', '1');
  await page.click('#settingsBack');
  await expect(page.locator('.player-chip').first()).toContainText('Maya');
  await expect(page.locator('.player-chip').first()).toContainText('★★★');
  await page.locator('.player-chip').first().click();
  await expect(page.locator(`.swatch[data-c="${colour}"]`)).toHaveClass(/\bon\b/);
  await expect(page.locator('#pHand button.on')).toHaveAttribute('data-v', 'left');
  expect(errors).toEqual([]);
});

// F311: a bare "2 – 3" didn't say whose number was whose. Each half names both numbers,
// own first, and long names stay inside the half on a small phone with Bigger text.
test('result: each score number names its player, also with long names at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const errors = await boot(page, 'E2E', false);
  await page.evaluate(() => {
    const app = (window as unknown as { __famiduel: { store: { data: { profiles: { name: string; bot: string | null }[]; settings: { bigText?: boolean } }; save(): void }; applyBigText(): void; showHome(): void; openGame(id: string): void } }).__famiduel;
    app.store.data.profiles[0].name = 'Maximiliana';
    app.store.data.profiles[1].name = 'Bartholomew';
    app.store.data.profiles[0].bot = null;
    app.store.data.profiles[1].bot = null;
    app.store.data.settings.bigText = true;
    app.store.save();
    app.applyBigText();
    app.showHome();
    app.openGame('airhockey');
  });
  for (const b of await page.locator('#intro .btn.ready').all()) await b.click();
  await expect(page.locator('#play')).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __famiduel: { runner: { result: unknown } } }).__famiduel.runner.result = { winner: 1, score: [2, 3] };
  });
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-bigtext', '1');
  await expect(page.locator('#result .half.p0 .rs-n')).toHaveText(['2', '3']);
  await expect(page.locator('#result .half.p0 .rs-who')).toHaveText(['You', 'Bartholomew']);
  await expect(page.locator('#result .half.p1 .rs-n')).toHaveText(['3', '2']);
  await expect(page.locator('#result .half.p1 .rs-who')).toHaveText(['You', 'Maximiliana']);
  for (const sel of ['#result .half.p0 .res-score', '#result .half.p1 .res-score']) {
    const box = (await page.locator(sel).boundingBox())!;
    expect(box.x, sel).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, sel).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: 'test-results/result-score-labels.png' });
  expect(errors).toEqual([]);
});
