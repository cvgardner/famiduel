// "Play it like a person" pass. For every built game it opens the real UI,
// picks a power by tapping, plays with real-time touch gestures (one human vs
// a bot, then two humans at once), and records screenshots, frame rate, errors
// and layout problems into playtest-report/. Hard failures: page errors,
// console errors, an intro screen that doesn't fit a small phone, and a match
// that can't be finished. Everything else is a warning in the report.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import games from '../content/games.json' with { type: 'json' };
import { PLAYER_COLORS } from '../src/core/colors';
import { installFingers, monkey, worldBox } from './monkey';
import { checkersPerson, fourInARowPerson, rpsPerson, seaBattlePerson, ticTacToePerson, type Person } from './person';

const OUT = path.resolve('playtest-report');
const SECONDS = Number(process.env.PLAYTEST_SECONDS ?? 8);

type Row = { id: string; name: string; shots: string[]; fps: number; gestures: number; /** Moves the playtest person made per seat (turn-based games). */ moves: number[]; haptics: number; pauseTaps: number; /** Canvas labels below their WCAG contrast, best seen. */ faint: string[]; warnings: string[]; errors: string[]; finished: boolean };
const rows: Row[] = [];

type Hook = {
  store: { data: { profiles: { bot: string | null; headStart: number }[]; settings: Record<string, boolean> }; save(): void };
  showHome(): void;
  openGame(id: string): void;
  runner: { fastForward(s: number): void; result: unknown } | null;
};

async function boot(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  // Count vibrations instead of sending them (desktop Chromium has the API but no motor).
  await page.addInitScript(() => {
    const w = window as unknown as { __buzzes: (number | number[])[] };
    w.__buzzes = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p: number | number[]) => (w.__buzzes.push(p), true) });
  });
  await page.goto('/?seed=playtest');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await installFingers(page);
}

async function setPlayers(page: Page, bots: [string | null, string | null]) {
  await page.evaluate((b) => {
    const app = (window as unknown as { __famiduel: Hook }).__famiduel;
    app.store.data.profiles[0].bot = b[0];
    app.store.data.profiles[1].bot = b[1];
    app.store.save();
    app.showHome();
  }, bots);
}

/**
 * Back to the game list from a match, whether it is still running (pause, then
 * quit) or already over (a fast bot can win inside the real-time window, which
 * leaves the result screen up and the pause button hidden).
 */
async function leaveMatch(page: Page): Promise<'quit' | 'finished'> {
  if (await page.locator('#result').isVisible()) {
    await page.click('#homeBtn');
    return 'finished';
  }
  // The monkey may have paused it already (a long hold on the pause button).
  if (!(await page.locator('#quitBtn').isVisible())) await holdPause(page);
  await page.click('#quitBtn');
  return 'quit';
}

/** Press and hold the pause button like a person (quick taps only show a hint). */
async function holdPause(page: Page) {
  const b = (await page.locator('#pauseBtn').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(page.locator('#resumeBtn')).toBeVisible();
}

/** Quick taps on the pause button that would have paused before press-and-hold. */
async function pauseTaps(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __famiduel: { pauseTaps: number } }).__famiduel.pauseTaps);
}

/** Vibrations sent since the page loaded. */
async function buzzes(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __buzzes: unknown[] }).__buzzes.length);
}

/** Frames per second over a short real-time window. */
async function fps(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((res) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
          else res(Math.round((n * 1000) / (performance.now() - t0)));
        };
        requestAnimationFrame(tick);
      }),
  );
}

/**
 * On a tall phone the world is letterboxed. The bars should carry the game's
 * own edge (stretched, softened, darkened to at most 55% toward the screen
 * edge) instead of a flat black band. Returns how far, per colour channel, the
 * outermost bar pixel is from that expected colour, top and bottom.
 */
async function barMismatch(page: Page): Promise<{ top: number; bottom: number; bars: boolean }> {
  return page.evaluate(() => {
    const c = document.getElementById('stage') as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const px = (x: number, y: number) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3));
    const sc = Math.min(c.width / 360, c.height / 640);
    const oy = (c.height - 640 * sc) / 2;
    const y0 = Math.ceil(oy);
    const y1 = Math.floor(oy + 640 * sc);
    const x = c.width >> 1;
    const backdrop = [11, 9, 24];
    const expected = (edge: number[]) => edge.map((v, i) => v * 0.45 + backdrop[i] * 0.55);
    const dist = (a: number[], b: number[]) => Math.round(Math.max(...a.map((v, i) => Math.abs(v - b[i]))));
    return {
      bars: y0 >= 2,
      top: dist(px(x, 0), expected(px(x, y0 + 1))),
      bottom: dist(px(x, c.height - 1), expected(px(x, y1 - 2))),
    };
  });
}

/** Tap through the intro like a person: pick a power if offered, then Ready. */
async function introAsPeople(page: Page, players: (0 | 1)[]) {
  await expect(page.locator('#intro')).toBeVisible();
  for (const p of players) {
    const cards = page.locator(`.power-card[data-p="${p}"]`);
    if (await cards.count()) await cards.nth(p).tap();
    await page.locator(`#ready${p}`).tap();
  }
  await expect(page.locator('#play')).toBeVisible();
}

const built: string[] = [];

test.describe.configure({ mode: 'serial' });

test('layout: home and every intro fit a small phone', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow, 'home scrolls sideways at 320px').toBe(false);
  for (const card of await page.locator('.game-card[data-ready="1"]').all()) built.push((await card.getAttribute('data-id'))!);
  const clipped: string[] = [];
  // A common Android size, and the smallest iPhone still in families' drawers (SE 1st gen).
  for (const [w, h] of [[360, 640], [320, 568]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const id of built) {
      await page.evaluate((g) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(g), id);
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll('#intro .half')].some((h) => {
          const inner = h.querySelector('.half-inner') as HTMLElement;
          return inner.getBoundingClientRect().height > (h as HTMLElement).getBoundingClientRect().height + 1;
        }),
      );
      // The ghost finger sits beside the title: both halves show it, and it must not
      // push the title off the side of a narrow phone.
      const demo = await page.evaluate(() =>
        [...document.querySelectorAll('#intro .half')].map((h) => {
          const head = h.querySelector('.intro-head') as HTMLElement;
          const d = h.querySelector('.demo') as HTMLElement | null;
          const hr = (h as HTMLElement).getBoundingClientRect();
          const dr = d?.getBoundingClientRect();
          return { shown: !!d, fits: head.scrollWidth <= head.clientWidth + 1 && (!dr || (dr.left >= hr.left && dr.right <= hr.right)) };
        }),
      );
      if (demo.some((d) => !d.shown)) clipped.push(`${id} at ${w}x${h}: no ghost finger on a first match`);
      if (demo.some((d) => !d.fits)) clipped.push(`${id} at ${w}x${h}: ghost finger pushes the title off the phone`);
      if (bad || demo.some((d) => !d.shown || !d.fits)) {
        if (bad) clipped.push(`${id} at ${w}x${h}`);
        await page.screenshot({ path: path.join(OUT, `${id}-intro-clipped-${w}x${h}.png`) });
      }
      await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showHome());
    }
  }
  expect(clipped, 'intro content cut off on a small phone').toEqual([]);
  expect(errors).toEqual([]);
});

/**
 * Every visible tap target (buttons, toggle labels) on the current screen that is
 * smaller than MIN_TARGET CSS px in either direction. 44 is Apple's and WCAG 2.5.5's
 * minimum; small children miss small targets more, so nothing goes below it.
 */
const MIN_TARGET = 44;

/**
 * Text on menus must be at least MIN_FONT CSS px (Apple's minimum is 11 pt; early
 * readers need more). Canvas text has its own floor, MIN_TEXT world units, checked
 * while each game is played (`__smallText`).
 */
const MIN_FONT = 12;
async function smallFonts(page: Page, screen: string): Promise<string[]> {
  const bad = await page.evaluate((min) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const str = (n.textContent ?? '').trim();
      if ((str.match(/[\p{L}\p{N}]/gu) ?? []).length < 2) continue;
      const el = n.parentElement;
      if (!el || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      if (el.getBoundingClientRect().width === 0) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < min - 0.01) out.push(`${el.className || el.tagName} "${str.slice(0, 20)}" ${px}px`);
    }
    return out;
  }, MIN_FONT);
  return bad.map((b) => `${screen}: ${b}`);
}
async function smallTargets(page: Page, screen: string): Promise<string[]> {
  const bad = await page.evaluate((min) => {
    const els = [...document.querySelectorAll<HTMLElement>('button, label.toggle, [role="button"]')];
    return els
      .filter((e) => e.checkVisibility({ visibilityProperty: true, opacityProperty: false }))
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.width < min - 0.5 || r.height < min - 0.5))
      .map(({ e, r }) => `${e.id ? '#' + e.id : e.className || e.tagName} "${(e.textContent ?? '').trim().slice(0, 16)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  }, MIN_TARGET);
  return bad.map((b) => `${screen}: ${b}`);
}

test('ghost finger: shows on a game\'s first matches, then gets out of the way', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  type H = { openGame(id: string): void; showHome(): void; store: { data: { history: { game: string }[] } } };
  const demos = async (id: string) =>
    page.evaluate((g) => {
      const a = (window as unknown as { __famiduel: H }).__famiduel;
      a.openGame(g);
      const n = document.querySelectorAll('#intro .demo').length;
      a.showHome();
      return n;
    }, id);
  expect(await demos('sumo')).toBe(2);
  await page.evaluate(() => {
    const h = (window as unknown as { __famiduel: H }).__famiduel.store.data.history;
    for (let i = 0; i < 3; i++) h.push({ game: 'sumo' });
  });
  expect(await demos('sumo'), 'still shown after 3 matches').toBe(0);
  expect(await demos('minigolf'), 'other games keep theirs').toBe(2);
  expect(errors).toEqual([]);
});

test('layout: every tap target is at least 44px on a small phone', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  const small: string[] = [];
  const fonts: string[] = [];
  // A night in progress, so the "New night" link shows on home.
  await page.evaluate(() => {
    const a = (window as unknown as { __famiduel: Hook & { store: { data: { night: { wins: number[] } } } } }).__famiduel;
    a.store.data.night.wins = [1, 0];
    a.store.save();
    a.showHome();
  });
  small.push(...(await smallTargets(page, 'home')));
  fonts.push(...(await smallFonts(page, 'home')));
  await page.locator('.player-chip[data-p="0"]').tap();
  small.push(...(await smallTargets(page, 'profile')));
  fonts.push(...(await smallFonts(page, 'profile')));
  await page.locator('#pDone').tap();
  // One intro with powers, one without (Checkers has none), then play, pause, result.
  for (const id of ['airhockey', 'checkers']) {
    await setPlayers(page, [null, null]);
    await page.evaluate((g) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(g), id);
    small.push(...(await smallTargets(page, `${id} intro`)));
    fonts.push(...(await smallFonts(page, `${id} intro`)));
    await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showHome());
  }
  await setPlayers(page, [null, 'normal']);
  await page.locator('.game-card[data-id="airhockey"]').tap();
  await introAsPeople(page, [0]);
  small.push(...(await smallTargets(page, 'play')));
  fonts.push(...(await smallFonts(page, 'play')));
  await holdPause(page);
  small.push(...(await smallTargets(page, 'pause')));
  fonts.push(...(await smallFonts(page, 'pause')));
  await page.click('#quitBtn');
  await setPlayers(page, ['normal', 'hard']);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('airhockey'));
  await expect(page.locator('#play')).toBeVisible();
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(900));
  await expect(page.locator('#result')).toBeVisible();
  small.push(...(await smallTargets(page, 'result')));
  fonts.push(...(await smallFonts(page, 'result')));
  if (small.length) await page.screenshot({ path: path.join(OUT, 'small-targets.png') });
  expect(small, `tap targets under ${MIN_TARGET}px on a 320x568 phone`).toEqual([]);
  expect(fonts, `menu text under ${MIN_FONT}px on a 320x568 phone`).toEqual([]);
  expect(errors).toEqual([]);
});

test('bot level: picked on the intro, kept per game, fits a small phone', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  type H = Hook & { runner: { players: { bot: string | null }[] } | null };
  // Every intro with a bot on top: the level row replaces Ready, so nothing grows.
  await setPlayers(page, [null, 'normal']);
  const problems: string[] = [];
  for (const g of games.games) {
    const ok = await page.evaluate((id) => {
      const a = (window as unknown as { __famiduel: H }).__famiduel;
      a.openGame(id);
      const half = document.querySelector('#intro .half.p1') as HTMLElement | null;
      if (!half) return 'not built';
      const inner = half.querySelector('.half-inner') as HTMLElement;
      const row = half.querySelectorAll('.botlvl button');
      const on = half.querySelector('.botlvl button.on') as HTMLElement | null;
      if (row.length !== 3) return 'no bot level row';
      if (on?.dataset.v !== 'normal') return `level shown is ${on?.dataset.v}`;
      if (inner.getBoundingClientRect().height > half.getBoundingClientRect().height + 1) return 'intro does not fit';
      return '';
    }, g.id);
    if (ok && ok !== 'not built') problems.push(`${g.id}: ${ok}`);
    else if (!ok) {
      problems.push(...(await smallTargets(page, `${g.id} intro with a bot`)));
      problems.push(...(await smallFonts(page, `${g.id} intro with a bot`)));
    }
  }
  expect(problems).toEqual([]);
  // A parent turns the Checkers bot down to Easy right on the intro.
  await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.showHome());
  await page.locator('.game-card[data-id="checkers"]').tap();
  await page.locator('.botlvl[data-p="1"] button[data-v="easy"]').tap();
  await expect(page.locator('.botlvl[data-p="1"] button[data-v="easy"]')).toHaveClass(/on/);
  await page.screenshot({ path: path.join(OUT, 'bot-level-intro.png') });
  await introAsPeople(page, [0]);
  expect(await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.players[1].bot), 'the match uses the picked level').toBe('easy');
  await leaveMatch(page);
  // Remembered for Checkers after a reload; other games keep the sheet's level.
  await page.reload();
  await page.locator('.game-card[data-id="checkers"]').tap();
  await expect(page.locator('.botlvl[data-p="1"] button.on')).toHaveAttribute('data-v', 'easy');
  await page.locator('#introBack').tap();
  await page.locator('.game-card[data-id="airhockey"]').tap();
  await expect(page.locator('.botlvl[data-p="1"] button.on')).toHaveAttribute('data-v', 'normal');
  await introAsPeople(page, [0]);
  expect(await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.players[1].bot)).toBe('normal');
  await leaveMatch(page);
  expect(errors).toEqual([]);
});

test('make the bot easier: offered after losing twice in a row to a bot', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  type H = Hook & { runner: { fastForward(s: number): void; result: { winner: number | null } | null; players: { bot: string | null }[] } | null };
  await setPlayers(page, [null, 'hard']);
  // A small kid who can't steer yet: their snake runs into the wall and the bot wins.
  const loseOne = async () => {
    await page.locator('.game-card[data-id="snake"]').tap();
    await introAsPeople(page, [0]);
    const winner = await page.evaluate(() => {
      const a = (window as unknown as { __famiduel: H }).__famiduel;
      const r = a.runner!;
      r.fastForward(900);
      return r.result?.winner ?? null;
    });
    expect(winner, 'the hard bot beats a snake that never turns').toBe(1);
    await expect(page.locator('#result')).toBeVisible();
  };
  await loseOne();
  await expect(page.locator('#easierBtn'), 'no offer after one loss').toHaveCount(0);
  await page.click('#homeBtn');
  await loseOne();
  const btn = page.locator('#result .half.p0 #easierBtn');
  await expect(btn, 'offered on the person\'s half after two losses').toBeVisible();
  await expect(btn).toHaveText(/easier/);
  await expect(btn).toHaveAttribute('aria-label', /Hard to Normal/);
  await expect(page.locator('#result .half.p1 #easierBtn')).toHaveCount(0);
  const fit = await page.evaluate(() => {
    const half = document.querySelector('#result .half.p0') as HTMLElement;
    const inner = half.querySelector('.half-inner') as HTMLElement;
    return inner.getBoundingClientRect().height <= half.getBoundingClientRect().height + 1;
  });
  expect(fit, 'the result half still fits a 320x568 phone').toBe(true);
  expect(await smallTargets(page, 'result with easier offer')).toEqual([]);
  await page.screenshot({ path: path.join(OUT, 'easier-offer.png') });
  await btn.tap();
  await expect(btn).toHaveText(/Normal now/);
  await expect(btn).toBeDisabled();
  await page.screenshot({ path: path.join(OUT, 'easier-offer-done.png') });
  // Rematch: the intro shows the new level, and the match uses it.
  await page.click('#rematchBtn');
  await expect(page.locator('.botlvl[data-p="1"] button.on')).toHaveAttribute('data-v', 'normal');
  await introAsPeople(page, [0]);
  expect(await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.players[1].bot)).toBe('normal');
  await leaveMatch(page);
  // Other games keep the hard bot.
  await page.locator('.game-card[data-id="airhockey"]').tap();
  await expect(page.locator('.botlvl[data-p="1"] button.on')).toHaveAttribute('data-v', 'hard');
  expect(errors).toEqual([]);
});

test('air hockey: a person who walks away gets a nudge, and the match still ends', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  type H = Hook & { runner: { fastForward(s: number): void; result: { winner: number | null } | null; game: { game: { held: { p: number; t: number } | null; pucks: { y: number }[] } } } | null };
  await setPlayers(page, [null, 'normal']);
  await page.locator('.game-card[data-id="airhockey"]').tap();
  await introAsPeople(page, [0]);
  // Past the countdown, the puck comes to rest on the person's side, out of the bot's reach; nobody touches it.
  type G = { held: unknown; serve: number; pucks: { x: number; y: number; vx: number; vy: number; alive: boolean }[] };
  const held = await page.evaluate(() => {
    const r = (window as unknown as { __famiduel: H }).__famiduel.runner!;
    r.fastForward(4);
    const g = r.game.game as unknown as G;
    g.serve = 0;
    g.held = null;
    g.pucks = [{ x: 180, y: 470, vx: 0, vy: 0, alive: true }];
    r.fastForward(4.6);
    return r.game.game.held;
  });
  expect(held, 'the puck has rested on the person\'s side past the nudge').toMatchObject({ p: 0 });
  await page.screenshot({ path: path.join(OUT, 'airhockey-nudge.png') });
  const crossed = await page.evaluate(() => {
    const r = (window as unknown as { __famiduel: H }).__famiduel.runner!;
    for (let i = 0; i < 60; i++) {
      r.fastForward(0.1);
      const pk = r.game.game.pucks[0];
      if (!pk || pk.y < 320) return true;
    }
    return false;
  });
  expect(crossed, 'the table blew the puck over to the bot').toBe(true);
  const winner = await page.evaluate(() => {
    const r = (window as unknown as { __famiduel: H }).__famiduel.runner!;
    r.fastForward(600);
    return r.result?.winner ?? null;
  });
  expect(winner, 'an idle person vs a bot still reaches a result').not.toBeNull();
  await expect(page.locator('#result')).toBeVisible();
  expect(errors).toEqual([]);
});

test('haptics: hits buzz the phone, and the Vibration toggle turns it off', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  const toggle = page.locator('.settings input[data-k="haptics"]');
  await expect(toggle).toBeChecked();
  const play = async () => {
    await setPlayers(page, ['normal', 'hard']);
    const before = await buzzes(page);
    await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('airhockey'));
    await expect(page.locator('#play')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(900));
    await expect(page.locator('#result')).toBeVisible();
    const n = (await buzzes(page)) - before;
    await page.click('#homeBtn');
    return n;
  };
  expect(await play(), 'a bot-vs-bot air hockey match vibrates').toBeGreaterThan(0);
  await page.locator('label.toggle', { has: page.locator('input[data-k="haptics"]') }).tap();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(page.locator('.settings input[data-k="haptics"]'), 'the setting is saved').not.toBeChecked();
  expect(await play(), 'no vibration with the toggle off').toBe(0);
  expect(errors).toEqual([]);
});

test('colours: the picker only offers colours that stay apart for colour-blind eyes', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  // Player 2's editor: Player 1's colour is taken; every other swatch is named and pickable.
  await page.locator('.player-chip').nth(1).tap();
  const swatches = page.locator('.swatch');
  await expect(swatches).toHaveCount(PLAYER_COLORS.length);
  const p1 = await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.store.data.profiles[0]);
  for (const [i, c] of PLAYER_COLORS.entries()) {
    const label = await swatches.nth(i).getAttribute('aria-label');
    if (c.hex === (p1 as unknown as { color: string }).color) {
      await expect(swatches.nth(i), `${c.name} is Player 1's`).toBeDisabled();
      expect(label).toContain('taken');
    } else {
      await expect(swatches.nth(i)).toBeEnabled();
      expect(label).toBe(c.name);
    }
  }
  await page.screenshot({ path: path.join(OUT, 'colours-picker.png') });
  // Pick Mint (the old palette's green clashed with pink for red-green colour blindness).
  await page.locator('.swatch[aria-label="Mint"]').tap();
  await page.locator('#pDone').tap();
  await expect(page.locator('.player-chip').nth(1)).toHaveAttribute('style', /#15e5b4/);
  // A match as colour-blind players would see it, for a human to look at.
  await setPlayers(page, ['normal', 'normal']);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('airhockey'));
  await expect(page.locator('#play')).toBeVisible();
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(3));
  const SIM: Record<string, number[]> = {
    protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
    tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  };
  for (const [kind, m] of Object.entries(SIM)) {
    // feColorMatrix rows are r g b a offset; linearRGB matches the simulation's colour space.
    const values = [0, 3, 6].map((r) => `${m.slice(r, r + 3).join(' ')} 0 0`).join(' ') + ' 0 0 0 1 0';
    await page.evaluate(([k, v]) => {
      document.getElementById('cvd')?.remove();
      document.body.insertAdjacentHTML('beforeend', `<svg id="cvd" width="0" height="0" style="position:absolute"><filter id="cvd-${k}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${v}"/></filter></svg>`);
      document.documentElement.style.filter = `url(#cvd-${k})`;
    }, [kind, values] as const);
    await page.screenshot({ path: path.join(OUT, `colours-airhockey-${kind}.png`) });
  }
  expect(errors).toEqual([]);
});

test('sumo: a small kid with a full head start gets two rows of rope saves', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await page.evaluate(() => {
    const a = (window as unknown as { __famiduel: Hook }).__famiduel;
    a.store.data.profiles[0].headStart = 3;
    a.store.save();
  });
  await setPlayers(page, [null, 'easy']);
  await page.locator('.game-card[data-id="sumo"]').tap();
  await introAsPeople(page, [0]);
  await page.waitForTimeout(2200); // countdown
  type SumoHook = { runner: null | { game: { game: { wrestlers: { saves: number }[]; score: number[] } } } };
  const saves = () =>
    page.evaluate(() => (window as unknown as { __famiduel: SumoHook }).__famiduel.runner!.game.game.wrestlers.map((w) => w.saves));
  expect(await saves(), 'full head start: 16 rope saves vs the bot\'s 3').toEqual([16, 3]);
  // The knots under the bottom player's pips wrap into a second row, still on screen.
  const knotColors = await page.evaluate(() => {
    const c = document.getElementById('stage') as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const sc = Math.min(c.width / 360, c.height / 640);
    const ox = (c.width - 360 * sc) / 2;
    const oy = (c.height - 640 * sc) / 2;
    const px = (wx: number, wy: number) => Array.from(g.getImageData(Math.round(ox + wx * sc), Math.round(oy + wy * sc), 1, 1).data.slice(0, 3));
    // Row 1 at y = 640 - 42 + 24, row 2 eight units lower; 8 knots 9 units apart around x = 298.
    return [0, 1].flatMap((row) => [0, 7].map((col) => px(298 + (col - 3.5) * 9, 622 + row * 8)));
  });
  const rope = [0xb8, 0x89, 0x3e];
  for (const c of knotColors) expect(Math.max(...c.map((v, i) => Math.abs(v - rope[i]))), `rope knot colour, got ${c}`).toBeLessThan(40);
  await page.screenshot({ path: path.join(OUT, 'sumo-head-start.png') });
  // A mashing kid uses some saves but is still in the match after the real-time window.
  await monkey(page, 0, SECONDS * 1000, 7);
  const after = await page.evaluate(() => {
    const g = (window as unknown as { __famiduel: SumoHook }).__famiduel.runner?.game.game;
    return g ? { saves: g.wrestlers[0].saves, rounds: g.score[0] + g.score[1] } : null;
  });
  // Saves refill each round, so a finished round also counts as play having happened.
  expect(after, 'the match is still on after the real-time window').not.toBeNull();
  expect(after!.saves < 16 || after!.rounds > 0, 'the rope caught the mashing kid, or a round was played out').toBe(true);
  await page.screenshot({ path: path.join(OUT, 'sumo-head-start-later.png') });
  expect(errors).toEqual([]);
});

test('tanks: a left-handed player gets FIRE on the left and the stick on the right', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  // Set it the way a parent would: the player sheet's Hand row.
  await page.locator('.player-chip[data-p="0"]').tap();
  await page.locator('#pHand button[data-v="left"]').tap();
  await page.locator('#pDone').tap();
  const saved = await page.evaluate(() => (JSON.parse(localStorage.getItem('famiduel.v1')!) as { profiles: { lefty?: boolean }[] }).profiles.map((p) => !!p.lefty));
  expect(saved, 'only Player 1 is left-handed, and it is saved').toEqual([true, false]);
  await setPlayers(page, [null, 'easy']);
  await page.locator('.game-card[data-id="tanks"]').tap();
  await expect(page.locator('.half.p0 .demo.lefty'), 'the ghost finger is mirrored for the lefty').toHaveCount(1);
  await expect(page.locator('.half.p1 .demo.lefty')).toHaveCount(0);
  await introAsPeople(page, [0]);
  type TankHook = { runner: null | { game: { controls: { stickX: number; fireX: number }[]; game: { phase: string; tanks: { x: number; y: number; a: number }[]; shellsOf(p: number): number } } } };
  const view = () =>
    page.evaluate(() => {
      const v = (window as unknown as { __famiduel: TankHook }).__famiduel.runner!.game;
      return { controls: v.controls, phase: v.game.phase, shells: v.game.shellsOf(0), tank: { ...v.game.tanks[0] } };
    });
  expect((await view()).controls.map((c) => [c.stickX, c.fireX]), 'lefty seat mirrored, bot seat unchanged').toEqual([
    [282, 72],
    [78, 288],
  ]);
  await page.waitForTimeout(2200); // countdown
  await expect.poll(async () => (await view()).phase, { timeout: 5000 }).toBe('play');
  const box = await worldBox(page);
  const at = (wx: number, wy: number) => ({ x: box.x + (wx / 360) * box.width, y: box.y + (wy / 640) * box.height });
  const finger = (id: number, type: string, p: { x: number; y: number }) =>
    page.evaluate(([i, t, x, y]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(i, t, x, y), [id, type, p.x, p.y] as const);
  // A tap where right-handed players steer (bottom right) must not fire for the lefty...
  const before = await view();
  await finger(901, 'pointerdown', at(288, 584));
  await finger(901, 'pointermove', at(288, 556));
  await page.waitForTimeout(500);
  await finger(901, 'pointerup', at(288, 556));
  const steered = await view();
  expect(steered.shells, 'no shell from the stick side').toBe(0);
  const moved = Math.hypot(steered.tank.x - before.tank.x, steered.tank.y - before.tank.y) + Math.abs(steered.tank.a - before.tank.a);
  expect(moved, 'the stick on the right drove the tank').toBeGreaterThan(1);
  // ...and FIRE on the left fires.
  await finger(902, 'pointerdown', at(72, 584));
  await page.waitForTimeout(60);
  await finger(902, 'pointerup', at(72, 584));
  await expect.poll(async () => (await view()).shells, { timeout: 1000 }).toBeGreaterThan(0);
  await page.screenshot({ path: path.join(OUT, 'tanks-left-handed.png') });
  expect(errors).toEqual([]);
});

test('sea battle: where the bot hit your fleet stays on screen long enough to find', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, 'hard']);
  await page.locator('.game-card[data-id="seabattle"]').tap();
  await introAsPeople(page, [0]);
  await page.waitForTimeout(2200); // countdown
  type SeaHook = { runner: null | { game: { mode: { kind: string; p: number; t: number }; shells: unknown[]; turnLog: { hits: number; sunk: number }[]; game: { turn: number; phase: string } } } };
  const look = () =>
    page.evaluate(() => {
      const v = (window as unknown as { __famiduel: SeaHook }).__famiduel.runner?.game;
      if (!v) return null;
      const m = v.mode;
      const landed = m.kind === 'bot' && v.game.turn !== m.p && v.shells.length === 0;
      return { landed, t: m.t, kind: m.kind, log: m.kind === 'bot' ? { ...v.turnLog[m.p] } : null, phase: v.game.phase };
    });
  // The person plays; meanwhile watch every bot turn's result beat from the moment its shots land.
  const turns: { hits: number; sunk: number; shown: number }[] = [];
  let cur: { hits: number; sunk: number; shown: number } | null = null;
  let hitShot = false;
  const playing = seaBattlePerson(page, 30_000, 5);
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    const s = await look().catch(() => null);
    if (s?.landed && s.log) {
      cur ??= { hits: s.log.hits, sunk: s.log.sunk, shown: 0 };
      cur.shown = Math.max(cur.shown, s.t);
      if (cur.hits && !hitShot && s.t > 0.4) {
        hitShot = true;
        await page.screenshot({ path: path.join(OUT, 'seabattle-bot-hit.png') });
      }
    } else if (cur) {
      turns.push(cur);
      cur = null;
    }
    if (s && s.phase === 'over') break;
    await page.waitForTimeout(60);
  }
  await playing;
  expect(turns.length, 'the bot took turns against the person').toBeGreaterThanOrEqual(2);
  for (const tr of turns) {
    const need = tr.sunk ? 1.9 : tr.hits ? 1.3 : 0.7;
    expect(tr.shown, `bot ${tr.sunk ? 'sinking' : tr.hits ? 'hit' : 'miss'} stays on screen after it lands`).toBeGreaterThan(need);
  }
  if (!hitShot) await page.screenshot({ path: path.join(OUT, 'seabattle-bot-hit.png') });
  expect(errors).toEqual([]);
});

test("four in a row: the bot's newest disc keeps a ring until you move", async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, 'normal']);
  await page.locator('.game-card[data-id="fourinarow"]').tap();
  await introAsPeople(page, [0]);
  await page.waitForTimeout(2200); // countdown
  type FourHook = {
    runner: null | { game: { ringCell(): number | null; busy: boolean; busyDiscs(): boolean; game: { turn: number; moves: number; last: { p: number; cell: number } | null; roundOver: unknown } } };
  };
  const look = () =>
    page.evaluate(() => {
      const v = (window as unknown as { __famiduel: FourHook }).__famiduel.runner!.game;
      return { ring: v.ringCell(), last: v.game.last, turn: v.game.turn, moves: v.game.moves, still: !v.busy && !v.busyDiscs(), over: !!v.game.roundOver };
    });
  const box = await worldBox(page);
  const drop = async (col: number) => {
    const c = { x: box.x + ((48 + col * 43 + 21.5) / 360) * box.width, y: box.y + (520 / 640) * box.height };
    for (const t of ['pointerdown', 'pointerup'])
      await page.evaluate(([tt, cx, cy]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(88, tt, cx, cy), [t, c.x, c.y] as const);
  };
  // Nothing is ringed before the first disc.
  let s = await look();
  expect(s.last).toBeNull();
  expect(s.ring).toBeNull();
  // If the person starts, drop once and check their own disc gets the ring after it lands.
  if (s.turn === 0) {
    await drop(3);
    await expect.poll(async () => (await look()).ring, { timeout: 2000 }).toBe(3 * 6); // idx(col 3, row 0), 6 rows a column
  }
  // Two bot turns: each newest bot disc is ringed once it lands and stays ringed while the
  // person thinks (3 s here), then the ring moves to the person's disc when they drop.
  for (const col of [0, 6]) {
    await expect.poll(async () => { s = await look(); return s.turn === 0 && s.still && s.last?.p === 1; }, { timeout: 5000 }).toBe(true);
    const botCell = s.last!.cell;
    await expect.poll(async () => (await look()).ring, { timeout: 2000 }).toBe(botCell);
    if (col === 0) await page.screenshot({ path: path.join(OUT, 'fourinarow-last-disc.png') });
    await page.waitForTimeout(3000);
    s = await look();
    expect(s.ring, "the bot's disc is still ringed after 3 s").toBe(botCell);
    expect(s.over).toBe(false);
    // A column the person may play (the bot's Block power can close one).
    const open = await page.evaluate(() => (window as unknown as { __famiduel: { runner: { game: { game: { legalCols(p: number): number[] } } } } }).__famiduel.runner.game.game.legalCols(0));
    await drop(open.includes(col) ? col : open[0]);
    await expect.poll(async () => (await look()).last?.p, { timeout: 1000 }).toBe(0);
    s = await look();
    expect(s.ring, 'the ring leaves the bot disc as soon as the person drops').not.toBe(botCell);
    await expect.poll(async () => { const x = await look(); return x.ring !== null && x.ring === x.last?.cell && x.last?.p === 0; }, { timeout: 2000 }).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('rock paper scissors: two people pick behind a look-away cover, one at a time', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, null]);
  await page.locator('.game-card[data-id="rps"]').tap();
  await introAsPeople(page, [0, 1]);
  await page.waitForTimeout(2200); // countdown
  type RpsHook = {
    runner: null | { game: { secret: { step: { kind: string; p: number; t: number } | null }; game: { picks: (string | null)[]; revealing: boolean } } };
  };
  const look = () =>
    page.evaluate(() => {
      const v = (window as unknown as { __famiduel: RpsHook }).__famiduel.runner!.game;
      return { step: v.secret.step, picks: [...v.game.picks], revealing: v.game.revealing };
    });
  const box = await worldBox(page);
  const tap = async (x: number, y: number) => {
    const c = { x: box.x + (x / 360) * box.width, y: box.y + (y / 640) * box.height };
    for (const t of ['pointerdown', 'pointerup'])
      await page.evaluate(([tt, cx, cy]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(77, tt, cx, cy), [t, c.x, c.y] as const);
  };
  const flip = (p: number, x: number, y: number) => (p === 1 ? [360 - x, 640 - y] : [x, y]) as [number, number];
  // Round 1: player 1 (bottom) is first. Nothing is on screen but the cover.
  let s = await look();
  expect(s.step, 'the round opens on a cover facing the first picker').toMatchObject({ kind: 'cover', p: 0 });
  await page.screenshot({ path: path.join(OUT, 'rps-secret-cover.png') });
  await page.waitForTimeout(700);
  await tap(...flip(0, 180, 445));
  await page.waitForTimeout(250);
  expect((await look()).step).toMatchObject({ kind: 'secret', p: 0 });
  await page.screenshot({ path: path.join(OUT, 'rps-secret-pick.png') });
  await tap(...flip(0, 70, 424)); // rock
  await page.waitForTimeout(200);
  s = await look();
  expect(s.picks[0], 'the pick is in').toBe('rock');
  expect(s.revealing).toBe(false);
  expect(s.step?.kind, 'right after picking, only "Locked in" shows').toBe('locked');
  await page.screenshot({ path: path.join(OUT, 'rps-secret-locked.png') });
  await page.waitForTimeout(1000);
  expect((await look()).step, 'then the screen turns to the other player, behind a cover').toMatchObject({ kind: 'cover', p: 1 });
  await page.screenshot({ path: path.join(OUT, 'rps-secret-cover-top.png') });
  await page.waitForTimeout(600);
  await tap(...flip(1, 180, 445));
  await page.waitForTimeout(250);
  expect((await look()).step).toMatchObject({ kind: 'secret', p: 1 });
  await page.screenshot({ path: path.join(OUT, 'rps-secret-pick-top.png') });
  await tap(...flip(1, 290, 424)); // scissors
  await page.waitForTimeout(1300);
  s = await look();
  expect(s.revealing, 'both in: the reveal plays face to face').toBe(true);
  await page.screenshot({ path: path.join(OUT, 'rps-secret-reveal.png') });
  await page.waitForTimeout(2000);
  // Round 2: the other player picks first.
  expect((await look()).step).toMatchObject({ kind: 'cover', p: 1 });
  expect(errors).toEqual([]);
});

/**
 * Turn-based games whose steps random touches can't reach (Sea Battle needs Ready,
 * then the same square tapped twice; Checkers needs a piece, then where it lands)
 * are played by a person who reads the screen and makes legal moves. Board games
 * face both players, so one person plays every human seat when it is theirs.
 */
const PEOPLE: Record<string, Person> = {
  seabattle: seaBattlePerson,
  rps: rpsPerson,
  checkers: checkersPerson,
  fourinarow: fourInARowPerson,
  tictactoe: ticTacToePerson,
};

for (const g of games.games) {
  test(`play like a person: ${g.id}`, async ({ page }) => {
    test.skip(built.length > 0 && !built.includes(g.id), 'not built yet');
    const errors: string[] = [];
    const row: Row = { id: g.id, name: g.name, shots: [], fps: 0, gestures: 0, moves: [0, 0], haptics: 0, pauseTaps: 0, faint: [], warnings: [], errors, finished: false };
    rows.push(row);
    await boot(page, errors);
    await page.evaluate(() => ((window as unknown as { __contrast: { on: boolean } }).__contrast.on = true));
    const ready = await page.locator(`.game-card[data-id="${g.id}"]`).getAttribute('data-ready');
    test.skip(ready !== '1', 'not built yet');
    const shot = async (label: string) => {
      const file = `${g.id}-${label}.png`;
      await page.screenshot({ path: path.join(OUT, file) });
      row.shots.push(file);
      return fs.readFileSync(path.join(OUT, file));
    };

    // 1. One person (bottom) against a normal bot (top), in real time.
    await setPlayers(page, [null, 'normal']);
    await page.locator(`.game-card[data-id="${g.id}"]`).tap();
    await shot('intro');
    await introAsPeople(page, [0]);
    await page.waitForTimeout(2200); // countdown
    const a = await shot('vs-bot-start');
    // 390×844 is taller than the world: the bars must show the game, not black.
    const bars = await barMismatch(page);
    expect(bars.bars, 'a tall phone letterboxes the world').toBe(true);
    expect(Math.max(bars.top, bars.bottom), 'letterbox bars carry the game edge').toBeLessThan(24);
    const person = PEOPLE[g.id];
    if (person) {
      const r = await person(page, SECONDS * 1000, 1);
      row.gestures += r.gestures;
      row.moves = r.moves;
      expect(r.moves[0], 'the person made moves against the bot in real time').toBeGreaterThan(0);
    } else row.gestures += await monkey(page, 0, SECONDS * 1000, 1);
    if (await page.locator('#resumeBtn').isVisible()) row.warnings.push('a playing hand paused the game (one-player match)');
    row.fps = await fps(page);
    const b = await shot('vs-bot-later');
    if (a.equals(b)) row.warnings.push('screen did not change during play');
    if (row.fps < 40) row.warnings.push(`low frame rate: ${row.fps} fps`);

    // 2. Two people at once, both halves touched simultaneously.
    if ((await leaveMatch(page)) === 'finished') row.warnings.push(`bot beat a mashing player within ${SECONDS}s`);
    await setPlayers(page, [null, null]);
    await page.locator(`.game-card[data-id="${g.id}"]`).tap();
    await introAsPeople(page, [0, 1]);
    await page.waitForTimeout(2200);
    if (person) {
      const r = await person(page, SECONDS * 1000, 2);
      row.gestures += r.gestures;
      row.moves = row.moves.map((m, i) => m + r.moves[i]);
      expect(r.moves[0], 'the bottom player made moves in a two-player match').toBeGreaterThan(0);
      expect(r.moves[1], 'the top player made moves in a two-player match').toBeGreaterThan(0);
    } else {
      const counts = await Promise.all([monkey(page, 0, SECONDS * 1000, 2), monkey(page, 1, SECONDS * 1000, 3)]);
      row.gestures += counts[0] + counts[1];
    }
    if (await page.locator('#resumeBtn').isVisible()) row.warnings.push('a playing hand paused the game (two-player match)');
    row.pauseTaps = await pauseTaps(page);
    await shot('two-people');
    row.haptics = await buzzes(page);
    if (row.haptics === 0) row.warnings.push('no vibration during real-time play');

    // 3. The match must be finishable: hand both seats to bots and fast-forward.
    if ((await leaveMatch(page)) === 'finished') row.warnings.push(`two-player match ended within ${SECONDS}s`);
    await setPlayers(page, ['normal', 'hard']);
    await page.evaluate((id) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(id), g.id);
    await expect(page.locator('#play')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(900));
    row.finished = await page.locator('#result').isVisible();
    if (row.finished) await shot('result');
    expect(row.finished, 'bot vs bot reaches the result screen').toBe(true);
    // Every word drawn on the canvas during all three matches, at a readable size.
    const tiny = await page.evaluate(() => [...(window as unknown as { __smallText: Map<string, number> }).__smallText]);
    expect(tiny.map(([str, size]) => `"${str}" at ${size}`), 'canvas text below the minimum size').toEqual([]);
    // Every label drawn while playing, against the pixels behind it (WCAG 1.4.3).
    const seen = await page.evaluate(() => [...(window as unknown as { __contrast: { seen: Map<string, { best: number; need: number; size: number }> } }).__contrast.seen]);
    row.faint = seen.filter(([, c]) => c.best < c.need).map(([str, c]) => `"${str}" ${c.best.toFixed(1)}:1 (needs ${c.need}:1 at ${c.size})`);
    expect(row.faint, 'canvas labels below WCAG contrast against what is behind them').toEqual([]);
    expect(errors).toEqual([]);
  });
}

test.afterAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(rows, null, 2));
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);
  const cards = rows
    .map(
      (r) => `<section><h2>${esc(r.name)} <small>${r.fps} fps · ${r.gestures} gestures · ${r.moves[0] + r.moves[1] ? `${r.moves[0]}+${r.moves[1]} moves · ` : ''}${r.haptics} buzzes · ${r.pauseTaps} pause taps ignored · ${r.finished ? 'finished' : 'NOT finished'}</small></h2>
      ${[...r.errors.map((e) => `<p class="err">${esc(e)}</p>`), ...r.warnings.map((w) => `<p class="warn">${esc(w)}</p>`)].join('')}
      <div class="shots">${r.shots.map((s) => `<figure><img src="${s}" loading="lazy"><figcaption>${s.replace(`${r.id}-`, '').replace('.png', '')}</figcaption></figure>`).join('')}</div></section>`,
    )
    .join('');
  fs.writeFileSync(
    path.join(OUT, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>FamiDuel playtest</title><style>
    body{font:14px system-ui;background:#14112b;color:#fff;margin:0;padding:16px}h2{font-size:16px}small{color:#aaa;font-weight:400}
    .shots{display:flex;gap:8px;overflow-x:auto}figure{margin:0}img{width:180px;border-radius:8px}figcaption{font-size:11px;color:#aaa}
    .err{color:#ff7b8f}.warn{color:#ffd54a}</style><h1>FamiDuel playtest · ${new Date().toISOString()}</h1>${cards}`,
  );
});
