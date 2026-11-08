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
import holes from '../content/minigolf-holes.json' with { type: 'json' };
import { PLAYER_COLORS } from '../src/core/colors';
import { buildGrid, LAYOUTS } from '../src/games/tanks/mazes';
import { domContrast, faintLabels } from './domcontrast';
import { installFingers, monkey, tapWorld, worldBox } from './monkey';
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
  // Powers are off on a fresh install (classic rules); the playtest turns them on so every
  // power card, button and help line is still played. e2e checks the classic default.
  await page.evaluate(() => {
    const app = (window as unknown as { __famiduel: Hook }).__famiduel;
    app.store.data.settings.powers = true;
    app.store.save();
    app.showHome();
  });
  await installFingers(page);
}

/**
 * Open a game the way a player does: tap its home card. Hidden games (content/games.json
 * "hidden") have no card but stay built, so their checks open them directly instead.
 */
async function openFromHome(page: Page, id: string) {
  const card = page.locator(`.game-card[data-id="${id}"]`);
  if (await card.count()) await card.tap();
  else await page.evaluate((g) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(g), id);
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

/**
 * The brightest colour channel of the outermost bar pixel, top and bottom.
 * A near-black band peaks around 25; a bar carrying a player's colour is far
 * brighter.
 */
async function barPeak(page: Page): Promise<{ top: number; bottom: number }> {
  return page.evaluate(() => {
    const c = document.getElementById('stage') as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const peak = (y: number) => Math.max(...Array.from(g.getImageData(c.width >> 1, y, 1, 1).data.slice(0, 3)));
    return { top: peak(0), bottom: peak(c.height - 1) };
  });
}

/**
 * Wait (up to 2.5 s) until no label is still only seen mid-fade, so the contrast probe
 * gets to judge it fully shown.
 */
async function settleFades(page: Page) {
  const fading = () =>
    page.evaluate(() =>
      [...(window as unknown as { __contrast: { seen: Map<string, { best: number; need: number; rest: boolean }> } }).__contrast.seen.values()].some((c) => !c.rest && c.best < c.need),
    );
  const end = Date.now() + 2500;
  while (Date.now() < end && (await fading())) await page.waitForTimeout(100);
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
  // The home grid follows content/games.json (hidden games left out): action games first, slow turn games last.
  const shown = await page.locator('.game-card').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id));
  expect(shown, 'home grid order').toEqual(games.games.filter((g) => !g.hidden).map((g) => g.id));
  await page.screenshot({ path: path.join(OUT, 'home-small-phone.png') });
  // The grid is split into labelled groups so a parent can find a calm game: each heading
  // shows, sits right above its own cards, and the groups come in the list's order.
  const groups = await page.locator('.group').evaluateAll((els) =>
    els.map((g) => {
      const h = g.querySelector('.group-title') as HTMLElement;
      const first = g.querySelector('.game-card') as HTMLElement;
      const hr = h.getBoundingClientRect();
      const cr = first.getBoundingClientRect();
      return { id: (g as HTMLElement).dataset.group, title: h.textContent, h: hr.height, gap: cr.top - hr.bottom, cards: g.querySelectorAll('.game-card').length };
    }),
  );
  expect(groups.map((g) => g.id), 'home groups').toEqual(['action', 'turns']);
  for (const g of groups) {
    expect(g.h, `${g.id} heading visible`).toBeGreaterThan(10);
    expect(g.gap, `${g.id} heading sits above its cards`).toBeGreaterThanOrEqual(0);
    expect(g.gap, `${g.id} heading sits right above its cards`).toBeLessThan(16);
  }
  expect(groups.reduce((n, g) => n + g.cards, 0)).toBe(shown.length);
  await page.locator('.group[data-group="turns"] .group-title').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'home-groups.png') });
  await page.evaluate(() => document.getElementById('home')!.scrollTo(0, 0));
  const clipped: string[] = [];
  // A common Android size, the smallest iPhone still in families' drawers (SE 1st gen), and a
  // tall phone (390×844), which gets the bigger desktop-size intro text.
  // Then again with Settings > Bigger text on (menu words 1.2x).
  for (const big of [false, true]) {
    await page.evaluate((on) => {
      const app = (window as unknown as { __famiduel: Hook & { applyBigText(): void } }).__famiduel;
      app.store.data.settings.bigText = on;
      app.applyBigText();
    }, big);
    const tag = big ? ' (bigger text)' : '';
  for (const [w, h] of [[360, 640], [320, 568], [390, 844]]) {
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
      if (demo.some((d) => !d.shown)) clipped.push(`${id} at ${w}x${h}${tag}: no ghost finger on a first match`);
      if (demo.some((d) => !d.fits)) clipped.push(`${id} at ${w}x${h}${tag}: ghost finger pushes the title off the phone`);
      if (bad || demo.some((d) => !d.shown || !d.fits)) {
        if (bad) clipped.push(`${id} at ${w}x${h}${tag}`);
        await page.screenshot({ path: path.join(OUT, `${id}-intro-clipped-${w}x${h}${big ? '-big' : ''}.png`) });
      }
      if (big && (id === 'sumo' || id === 'tanks')) await page.screenshot({ path: path.join(OUT, `bigtext-intro-${id}-${w}x${h}.png`) });
      await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showHome());
    }
  }
    if (big) {
      // Home and settings with Bigger text on a small phone: nothing sideways, screenshots for the eye.
      await page.setViewportSize({ width: 320, height: 568 });
      // Home scrolls inside its own section (#home is the scroller), not the window.
      await page.evaluate(() => document.getElementById('home')!.scrollTo(0, 0));
      expect(await page.evaluate(() => document.getElementById('home')!.scrollTop), 'home shows its top for the screenshot').toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'home scrolls sideways at 320px with bigger text').toBe(false);
      // The "Play together / Play the bot" switch: each label stays inside its own button.
      const modeCut = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.seg.mode button')]
          .filter((b) => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > b.parentElement!.getBoundingClientRect().right - 3)
          .map((b) => b.textContent),
      );
      expect(modeCut, 'home mode labels cut off at 320px with bigger text').toEqual([]);
      await page.screenshot({ path: path.join(OUT, 'bigtext-home-320.png') });
      await page.click('#settingsBtn');
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'settings scroll sideways at 320px with bigger text').toBe(false);
      const cut = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('#settings .set-txt b')].filter((b) => b.scrollWidth > b.parentElement!.clientWidth + 1 || b.getBoundingClientRect().right > b.parentElement!.getBoundingClientRect().right + 1).map((b) => b.textContent),
      );
      expect(cut, 'settings labels cut off at 320px with bigger text').toEqual([]);
      await page.screenshot({ path: path.join(OUT, 'bigtext-settings-320.png') });
      await page.click('#settingsBack');
    }
  }
  await page.evaluate(() => {
    const app = (window as unknown as { __famiduel: Hook & { applyBigText(): void } }).__famiduel;
    app.store.data.settings.bigText = false;
    app.applyBigText();
  });
  expect(clipped, 'intro content cut off on a phone').toEqual([]);
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

test('ghost finger: the first match shows it in play over each person\'s half, then never again', async ({ page }) => {
  // Backlog 2026-10-31: the intro's finger is small and gone once the ball moves. At a game's
  // very first match on this phone it loops once more in play, over each person's own half
  // (the top copy turned to face them), and a seat's first touch clears its own copy.
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, null]);
  type H = { openGame(id: string): void; startMatch(): void; showHome(): void; store: { data: { history: { game: string }[] } } };
  const start = (id: string) =>
    page.evaluate((g) => {
      const a = (window as unknown as { __famiduel: H }).__famiduel;
      a.openGame(g);
      a.startMatch();
    }, id);
  const copies = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#play .play-demo')].map((el) => {
        const r = el.getBoundingClientRect();
        return { p: Number(el.dataset.p), y: r.top + r.height / 2, gone: el.classList.contains('gone'), rot: getComputedStyle(el).rotate };
      }),
    );
  await start('pingpong');
  await page.waitForTimeout(2600); // countdown, then the serve
  let c = await copies();
  expect(c.map((x) => x.p).sort(), 'one finger per person').toEqual([0, 1]);
  const vh = page.viewportSize()!.height;
  const bottom = c.find((x) => x.p === 0)!, top = c.find((x) => x.p === 1)!;
  expect(bottom.y, "seat 0's finger sits in the bottom half").toBeGreaterThan(vh / 2);
  expect(top.y, "seat 1's finger sits in the top half").toBeLessThan(vh / 2);
  expect(top.rot, "seat 1's finger faces them").toBe('180deg');
  await page.screenshot({ path: path.join(OUT, 'ghost-finger-in-play.png') });
  // The bottom player touches their half: only their copy goes.
  await page.evaluate((y) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(81, 'pointerdown', 195, y), Math.round(vh * 0.8));
  await page.evaluate((y) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(81, 'pointerup', 195, y), Math.round(vh * 0.8));
  c = await copies();
  expect(c.find((x) => x.p === 0)!.gone, 'a touch clears that seat\'s finger').toBe(true);
  expect(c.find((x) => x.p === 1)!.gone, 'the other seat keeps theirs').toBe(false);
  // It fades away by itself.
  await expect.poll(async () => (await copies()).length, { timeout: 8000 }).toBe(0);
  // Second match of the same game: none. A bot seat never gets one.
  await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.store.data.history.push({ game: 'pingpong' }));
  await start('pingpong');
  await page.waitForTimeout(300);
  expect(await copies(), 'not on a second match').toEqual([]);
  await setPlayers(page, [null, 'easy']);
  await start('airhockey');
  await page.waitForTimeout(300);
  expect((await copies()).map((x) => x.p), 'only the person gets one vs a bot').toEqual([0]);
  await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.showHome());
  expect(errors).toEqual([]);
});

test('ghost finger: a "?" brings it back after the first matches, on a small phone', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  type H = Hook & { store: { data: { history: { game: string }[] } } };
  // Every game has been played 3 times on this phone, so the finger is gone.
  await page.evaluate((ids) => {
    const h = (window as unknown as { __famiduel: H }).__famiduel.store.data.history;
    for (const g of ids) for (let i = 0; i < 3; i++) h.push({ game: g });
  }, built);
  const problems: string[] = [];
  for (const id of built) {
    await setPlayers(page, [null, null]);
    await page.evaluate((g) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(g), id);
    const halves = await page.evaluate(() =>
      [...document.querySelectorAll('#intro .half')].map((h) => {
        const head = h.querySelector('.intro-head') as HTMLElement;
        const inner = h.querySelector('.half-inner') as HTMLElement;
        const q = h.querySelector('.demo-help') as HTMLElement | null;
        const hr = (h as HTMLElement).getBoundingClientRect();
        const r = q?.getBoundingClientRect();
        return {
          help: !!q,
          demo: !!h.querySelector('.demo'),
          big: !!r && r.width >= 44 && r.height >= 44,
          fits: head.scrollWidth <= head.clientWidth + 1 && !!r && r.left >= hr.left && r.right <= hr.right && inner.getBoundingClientRect().height <= hr.height + 1,
        };
      }),
    );
    for (const [i, h] of halves.entries()) {
      if (!h.help || h.demo) problems.push(`${id} half ${i}: no "?" after 3 matches`);
      else if (!h.big) problems.push(`${id} half ${i}: "?" under 44 px`);
      else if (!h.fits) problems.push(`${id} half ${i}: "?" pushes the intro off a 320x568 phone`);
    }
    if (id === 'tanks') await page.screenshot({ path: path.join(OUT, 'demo-help.png') });
  }
  // Tapping the bottom player's "?" shows the finger in their half only.
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('sumo'));
  await page.locator('.half.p0 .demo-help').tap();
  expect(await page.locator('.half.p0 .demo').count(), 'finger back after "?"').toBe(1);
  expect(await page.locator('.half.p1 .demo-help').count(), 'other half keeps its "?"').toBe(1);
  await page.screenshot({ path: path.join(OUT, 'demo-help-tapped.png') });
  // A kid who needed it once gets it again: back out and reopen, and that half shows the
  // finger by itself (no "?"), the other half still has its "?"...
  await page.locator('#introBack').tap();
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('sumo'));
  expect(await page.locator('.half.p0 .demo').count(), 'finger again next time after a "?"').toBe(1);
  expect(await page.locator('.half.p0 .demo-help').count(), 'no "?" while it shows by itself').toBe(0);
  expect(await page.locator('.half.p1 .demo-help').count(), 'other half still has its "?"').toBe(1);
  await page.screenshot({ path: path.join(OUT, 'demo-help-remembered.png') });
  // ...until a match of it is played to the end; then the "?" is back.
  await introAsPeople(page, [0, 1]);
  await page.evaluate(() => {
    const r = (window as unknown as { __famiduel: Hook }).__famiduel.runner!;
    if (!r.result) r.result = { winner: null, score: [0, 0] };
  });
  await expect(page.locator('#result')).toBeVisible({ timeout: 5000 });
  await page.locator('#rematchBtn').tap();
  expect(await page.locator('.half.p0 .demo-help').count(), '"?" back after the match').toBe(1);
  expect(await page.locator('.half.p0 .demo').count(), 'finger gone again after the match').toBe(0);
  // A different person in that seat doesn't inherit it.
  await page.locator('.half.p0 .demo-help').tap();
  await page.locator('#introBack').tap();
  await page.evaluate(() => {
    const h = (window as unknown as { __famiduel: { store: { data: { profiles: { name: string }[] } } } }).__famiduel;
    h.store.data.profiles[0].name = 'Grandpa';
  });
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('sumo'));
  expect(await page.locator('.half.p0 .demo-help').count(), 'a new person in the seat gets the "?"').toBe(1);
  await page.evaluate((n) => {
    (window as unknown as { __famiduel: { store: { data: { profiles: { name: string }[] } } } }).__famiduel.store.data.profiles[0].name = n;
  }, 'Player 1');
  // A bot's half never gets a "?".
  await setPlayers(page, [null, 'easy']);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('sumo'));
  expect(await page.locator('.half.p1 .demo-help').count(), 'no "?" for a bot').toBe(0);
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});

const PICTURED = ['minigolf', 'airhockey', 'sumo', 'pingpong', 'penalty', 'snacksnatch', 'tanks', 'snake', 'chopchop', 'quickdraw', 'seabattle'];

test('how to play: the pause menu shows each player the finger, the rules and their power', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  type R = { paused: boolean };
  const paused = () => page.evaluate(() => ((window as unknown as { __famiduel: { runner: R | null } }).__famiduel.runner as R).paused);
  const problems: string[] = [];
  for (const id of built) {
    await setPlayers(page, [null, null]);
    await page.evaluate((g) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(g), id);
    const hasPowers = (await page.locator('.power-card').count()) > 0;
    await introAsPeople(page, [0, 1]);
    await holdPause(page);
    await page.locator('#howBtn').tap();
    await expect(page.locator('.pause-help')).toBeVisible();
    const halves = await page.evaluate(() =>
      [...document.querySelectorAll('.pause-help .half')].map((h) => {
        const inner = h.querySelector('.half-inner') as HTMLElement;
        const hr = (h as HTMLElement).getBoundingClientRect();
        const ir = inner.getBoundingClientRect();
        return {
          demo: !!h.querySelector('.demo'),
          howto: !!h.querySelector('.howto'),
          power: !!h.querySelector('.my-power'),
          charge: h.querySelector('.my-power .charge')?.textContent ?? null,
          fits: ir.height <= hr.height + 1 && ir.top >= hr.top - 1 && ir.bottom <= hr.bottom + 1,
          pic: !!h.querySelector('.my-power .power-pic'),
        };
      }),
    );
    // Every game's powers come with a looping picture (app/powerpic.ts) that really moves.
    if (PICTURED.includes(id)) {
      const pose = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('.pause-help .power-pic :is(circle, rect, line)')]
            .map((el) => {
              // Where each shape is right now (SMIL moves the anim values) and how it looks.
              const a = (k: string) => ((el as unknown as Record<string, { animVal: { value: number } } | undefined>)[k]?.animVal.value ?? '');
              const cs = getComputedStyle(el);
              return [a('cx'), a('cy'), a('r'), a('x'), a('y'), a('width'), a('x1'), a('x2'), a('y2'), cs.opacity, cs.fill].join(',');
            })
            .join(' '),
        );
      const a = await pose();
      await page.waitForTimeout(450);
      const b = await pose();
      for (const [i, h] of halves.entries()) if (!h.pic) problems.push(`${id} half ${i}: no picture of the picked power`);
      if (a === b) problems.push(`${id}: power pictures don't move`);
      await page.screenshot({ path: path.join(OUT, `pause-help-pic-${id}.png`) });
    }
    if (halves.length !== 2) problems.push(`${id}: ${halves.length} halves on how to play`);
    for (const [i, h] of halves.entries()) {
      if (!h.demo) problems.push(`${id} half ${i}: no ghost finger`);
      if (!h.howto) problems.push(`${id} half ${i}: no how-to line`);
      if (h.power !== hasPowers) problems.push(`${id} half ${i}: picked power ${h.power ? 'shown without powers' : 'missing'}`);
      if (hasPowers && !/Charging: \d+%|Ready!|On now!/.test(h.charge ?? '')) problems.push(`${id} half ${i}: no power meter state (${h.charge})`);
      if (!h.fits) problems.push(`${id} half ${i}: how to play doesn't fit a 320x568 phone`);
    }
    if (!(await paused())) problems.push(`${id}: match ran while how to play was up`);
    if (id === 'tanks') await page.screenshot({ path: path.join(OUT, 'pause-help.png') });
    await page.locator('#helpResume').tap();
    await expect(page.locator('#modal')).toBeHidden();
    if (await paused()) problems.push(`${id}: Resume left the match paused`);
    await leaveMatch(page);
  }
  // A left-handed seat sees the mirrored stick; a bot's half gets no finger and no rules.
  await page.evaluate(() => {
    const a = (window as unknown as { __famiduel: { store: { data: { profiles: { lefty?: boolean }[] } } } }).__famiduel;
    a.store.data.profiles[0].lefty = true;
  });
  await setPlayers(page, [null, 'easy']);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('tanks'));
  await introAsPeople(page, [0]);
  await holdPause(page);
  await page.locator('#howBtn').tap();
  expect(await page.locator('.pause-help .half.p0 .demo.lefty').count(), 'lefty finger mirrored').toBe(1);
  expect(await page.locator('.pause-help .half.p1 .demo').count(), 'no finger for a bot').toBe(0);
  expect(await page.locator('.pause-help .half.p1 .my-power').count(), 'no power card for a bot').toBe(0);
  await page.screenshot({ path: path.join(OUT, 'pause-help-bot.png') });
  // "← Menu" goes back to the pause menu, still paused.
  await page.locator('#helpBack').tap();
  await expect(page.locator('#resumeBtn')).toBeVisible();
  expect(await paused(), 'still paused on the menu').toBe(true);
  await page.click('#quitBtn');
  await page.evaluate(() => {
    (window as unknown as { __famiduel: { store: { data: { profiles: { lefty?: boolean }[] } } } }).__famiduel.store.data.profiles[0].lefty = false;
  });
  expect(problems).toEqual([]);
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
  await page.locator('#settingsBtn').tap();
  small.push(...(await smallTargets(page, 'settings')));
  fonts.push(...(await smallFonts(page, 'settings')));
  await page.screenshot({ path: path.join(OUT, 'settings-small-phone.png') });
  await page.locator('#settingsBack').tap();
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
  await page.locator('#howBtn').tap();
  small.push(...(await smallTargets(page, 'pause how to play')));
  fonts.push(...(await smallFonts(page, 'pause how to play')));
  await page.locator('#helpBack').tap();
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

// The canvas buttons in play (power buttons, Sumo's HOLD, Snack Snatch's critters, Penalty's
// dive buttons, RPS throws) aren't DOM, so the check above can't see them. Each one's touch
// area (drawn radius plus slop) must stay a little-hand-sized target on a 320x568 phone.
const MIN_CANVAS_TARGET = 56;
test('layout: every in-game canvas button is a 56px touch target on a small phone, also with Little hands', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  const small: string[] = [];
  const clash: string[] = [];
  let seen = 0;
  let grown = 0;
  const grownOther = new Set<string>();
  // Buttons that already sit partly past the edge at normal size (Ping Pong's corners).
  const offAtNormal = new Set<string>();
  // Settings > Little hands draws the power buttons bigger (same touch area); they must still
  // sit on the screen and clear every other canvas button.
  for (const big of [false, true]) {
    await page.evaluate((on) => {
      const app = (window as unknown as { __famiduel: Hook & { applyBigText(): void } }).__famiduel;
      app.store.data.settings.bigButtons = on;
      app.applyBigText();
    }, big);
    for (const id of built) {
      await setPlayers(page, [null, null]);
      await page.evaluate((g) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(g), id);
      await introAsPeople(page, [0, 1]);
      await page.waitForTimeout(300);
      const found = await page.evaluate(() => {
        const view = (window as unknown as { __famiduel: { runner: { game: unknown } } }).__famiduel.runner!.game;
        const c = document.getElementById('stage')!.getBoundingClientRect();
        const scale = Math.min(c.width / 360, c.height / 640);
        type B = { r: number; slop: number; owner: number; hit: unknown; x: number; y: number };
        const isButton = (o: unknown): o is B => !!o && typeof o === 'object' && typeof (o as B).hit === 'function' && typeof (o as B).r === 'number' && typeof (o as B).slop === 'number';
        const out: { where: string; css: number; x: number; y: number; r: number; power: boolean }[] = [];
        const seen = new Set<unknown>();
        const walk = (o: unknown, where: string, depth: number, power: boolean) => {
          if (!o || typeof o !== 'object' || seen.has(o) || depth > 4) return;
          seen.add(o);
          if (isButton(o)) return void out.push({ where, css: 2 * (o.r + o.slop) * scale, x: o.x, y: o.y, r: o.r, power });
          const isPower = !!(o as { power?: unknown }).power && 'button' in (o as object);
          for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (k !== 'ctx' && k !== 'game') walk(v, `${where}.${k}`, depth + 1, isPower);
        };
        walk(view, 'view', 0, false);
        return out;
      });
      seen += found.length;
      const tag = big ? ' (little hands)' : '';
      for (const f of found) if (f.css < MIN_CANVAS_TARGET - 0.5) small.push(`${id}${tag} ${f.where}: ${Math.round(f.css)}px`);
      for (const f of found.filter((b) => b.power)) {
        if (big && f.r > 22) grown++;
        // The drawn button with its dark backing and owner band (r + 6).
        const R = f.r + 6;
        if (f.x - R < 0 || f.x + R > 360 || f.y - R < 0 || f.y + R > 640) {
          if (!big) offAtNormal.add(`${id} ${f.where}`);
          else if (!offAtNormal.has(`${id} ${f.where}`)) clash.push(`${id}${tag} ${f.where} runs off the screen`);
        }
        // Sea Battle's two power buttons share a spot: only the shooter's shows (pass and play).
        for (const o of found) if (o !== f && (o.x !== f.x || o.y !== f.y) && Math.hypot(o.x - f.x, o.y - f.y) < R + o.r + (o.power ? 6 : 0)) clash.push(`${id}${tag} ${f.where} overlaps ${o.where}`);
      }
      // F92: Penalty's dive buttons and Tank Duel's FIRE grow too; drawn neighbours of one
      // seat (not just power buttons) must not touch.
      if (id === 'penalty') {
        const dives = found.filter((b) => b.where.includes('diveBtns'));
        if (big && dives.length && dives.every((b) => b.r > 28)) grownOther.add('penalty');
        for (const a of dives) for (const b of dives) if (a !== b && a.y === b.y && Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 4) clash.push(`penalty${tag} ${a.where} touches ${b.where}`);
      }
      if (id === 'tanks') {
        const fireR = await page.evaluate(() => (window as unknown as { __famiduel: { runner: { game: { fireR?: number } } } }).__famiduel.runner!.game.fireR ?? 0);
        if (big && fireR > 34) grownOther.add('tanks');
        if (584 + fireR + 5 + 4 > 640) clash.push(`tanks${tag} FIRE runs off the screen`);
      }
      if (big && ['snacksnatch', 'sumo', 'airhockey', 'penalty', 'tanks'].includes(id)) await page.screenshot({ path: path.join(OUT, `little-hands-${id}.png`) });
      await leaveMatch(page);
    }
  }
  expect(seen, 'canvas buttons found').toBeGreaterThan(built.length);
  expect(grown, 'power buttons drawn bigger with Little hands').toBeGreaterThan(built.length);
  expect([...grownOther].sort(), 'dive buttons and FIRE drawn bigger with Little hands').toEqual(['penalty', 'tanks'].filter((g) => built.includes(g)));
  expect(small, `canvas buttons whose touch area is under ${MIN_CANVAS_TARGET}px on a 320x568 phone`).toEqual([]);
  expect(clash, 'power buttons on screen and clear of other canvas buttons').toEqual([]);
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
  // The smallest phone, then a tall one (390×844), where the bigger desktop-size how-to text
  // and power cards show and the bot's level row has to fit beside them.
  for (const [vw, vh] of [[320, 568], [390, 844]]) {
    await page.setViewportSize({ width: vw, height: vh });
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
      if (ok && ok !== 'not built') {
        problems.push(`${g.id} at ${vw}x${vh}: ${ok}`);
        await page.screenshot({ path: path.join(OUT, `${g.id}-intro-bot-clipped-${vw}x${vh}.png`) });
      } else if (!ok) {
        problems.push(...(await smallTargets(page, `${g.id} intro with a bot at ${vw}x${vh}`)));
        problems.push(...(await smallFonts(page, `${g.id} intro with a bot at ${vw}x${vh}`)));
      }
    }
  }
  await page.screenshot({ path: path.join(OUT, 'bot-level-intro-tall.png') });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(problems).toEqual([]);
  // A parent turns the Sea Battle bot down to Easy right on the intro.
  await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.showHome());
  await page.locator('.game-card[data-id="seabattle"]').tap();
  await page.locator('.botlvl[data-p="1"] button[data-v="easy"]').tap();
  await expect(page.locator('.botlvl[data-p="1"] button[data-v="easy"]')).toHaveClass(/on/);
  // Each level wears its own face, on its button and on the seat's name line, which follows the pick.
  await expect(page.locator('.botlvl[data-p="1"] button[data-v="easy"]')).toHaveText('😴 Easy');
  await expect(page.locator('.botlvl[data-p="1"] button[data-v="hard"]')).toHaveText('😎 Hard');
  await expect(page.locator('#intro .half.p1 .who')).toContainText('🤖😴');
  // The person picks the bot's level right way up (F117).
  await expect(page.locator('#intro .half.p1')).toHaveCSS('transform', 'none');
  await page.screenshot({ path: path.join(OUT, 'bot-level-intro.png') });
  await introAsPeople(page, [0]);
  expect(await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.players[1].bot), 'the match uses the picked level').toBe('easy');
  await leaveMatch(page);
  // Remembered for Sea Battle after a reload; other games keep the sheet's level.
  await page.reload();
  await page.locator('.game-card[data-id="seabattle"]').tap();
  await expect(page.locator('.botlvl[data-p="1"] button.on')).toHaveAttribute('data-v', 'easy');
  await page.locator('#introBack').tap();
  // Home says so on that game's card (and only there), so the easier bot is no surprise.
  await expect(page.locator('.game-card[data-id="seabattle"] .gbot')).toHaveAttribute('data-v', 'easy');
  await expect(page.locator('.game-card[data-id="seabattle"]')).toContainText('Bot level here: easy');
  await expect(page.locator('.game-card .gbot')).toHaveCount(1);
  const badge = await page.locator('.game-card[data-id="seabattle"]').evaluate((card) => {
    const b = card.querySelector('.gbot')!.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    return { inside: b.left >= c.left && b.right <= c.right && b.top >= c.top, size: Math.round(b.width) };
  });
  expect(badge, 'the badge sits on the icon, inside the card').toEqual({ inside: true, size: 26 });
  await page.locator('.game-card[data-id="seabattle"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'bot-level-home-badge.png') });
  problems.push(...(await smallFonts(page, 'home with a game bot badge')));
  expect(problems).toEqual([]);
  await page.locator('.game-card[data-id="airhockey"]').tap();
  await expect(page.locator('.botlvl[data-p="1"] button.on')).toHaveAttribute('data-v', 'normal');
  await introAsPeople(page, [0]);
  expect(await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.players[1].bot)).toBe('normal');
  await leaveMatch(page);
  expect(errors).toEqual([]);
});

// Solo games whose next point waits for the person's own move (F122 can't play past it).
const WAITS_FOR_PERSON = ['seabattle', 'rps'];

test('play the bot: one tap on home makes every game a solo match, with its own tally', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  type H = Hook & { runner: { players: { bot: string | null }[]; result: unknown } | null };
  await expect(page.locator('#modeSeg button.on')).toHaveAttribute('data-v', 'together');
  // The top seat has a sibling's name; the bot must not borrow it.
  await page.locator('.player-chip[data-p="1"]').tap();
  await page.locator('#pName').fill('Mia');
  await page.locator('#pDone').tap();
  await expect(page.locator('.player-chip[data-p="1"] .pname')).toHaveText('Mia');
  await page.locator('#modeSeg button[data-v="solo"]').tap();
  await expect(page.locator('#modeSeg button.on')).toHaveAttribute('data-v', 'solo');
  await expect(page.locator('.player-chip[data-p="1"] .botlbl')).toContainText('😴 easy');
  await expect(page.locator('.player-chip[data-p="1"] .dot')).toHaveText('😴');
  await expect(page.locator('.player-chip[data-p="1"] .pname')).toHaveText('Bot');
  await expect(page.locator('.night-score span')).toContainText('You vs the bot · 0 games');
  expect(await smallTargets(page, 'home solo')).toEqual([]);
  await page.screenshot({ path: path.join(OUT, 'solo-home.png') });
  // Every built game from its home card: the top seat is the Easy bot.
  let n = 0;
  for (const id of built) {
    await page.locator(`.game-card[data-id="${id}"]`).tap();
    await expect(page.locator('#intro .half.p1.bot'), `${id}: bot half on the intro`).toBeVisible();
    await expect(page.locator('#intro .half.p1 .who'), id).toHaveText('Bot 🤖😴');
    // F117: nobody sits behind the bot, so its half reads upright for the one person.
    await expect(page.locator('#intro .half.p1'), `${id}: bot half faces the person`).toHaveCSS('transform', 'none');
    await page.evaluate(() => {
      const r = (window as unknown as { __reader: { on: boolean; turned: Set<string> } }).__reader;
      r.turned.clear();
      r.on = true;
      const e = (window as unknown as { __edges: { on: boolean; over: Map<string, number> } }).__edges;
      e.over.clear();
      e.on = true;
    });
    await introAsPeople(page, [0]);
    expect(await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.players.map((p) => p.bot)), id).toEqual([null, 'easy']);
    // F118: the bot seat's canvas words (countdown, score, pops) turn to face the person too,
    // and keep their place on screen (a flipped left/right label still fits).
    await page.waitForTimeout(2600);
    const [turned, over] = await page.evaluate(() => {
      const r = (window as unknown as { __reader: { on: boolean; turned: Set<string> } }).__reader;
      const e = (window as unknown as { __edges: { on: boolean; over: Map<string, number> } }).__edges;
      r.on = false;
      e.on = false;
      return [[...r.turned], [...e.over]];
    });
    expect(turned.length, `${id}: the bot seat's words were turned to face the person`).toBeGreaterThan(0);
    expect(over, `${id}: no turned word runs off the screen`).toEqual([]);
    // F120: the bot's half never says "you" (the person would read it as their own).
    expect(turned.filter((t) => /\b(you(r)?|them)\b/i.test(t)), `${id}: "you" words in the bot's half`).toEqual([]);
    // F119: no how-to words in the bot's half (nobody reads them).
    expect(turned.filter((t) => ['Tap ◀ ▶ to turn', '◀ chop', 'chop ▶', 'SERVE', 'Tap a button to dive!'].includes(t)), `${id}: how-to words in the bot's half`).toEqual([]);
    await page.screenshot({ path: path.join(OUT, `solo-play-${id}.png`) });
    // F122: the first 2.6 s never reach a round end, so play on to the first point (or the
    // match end) with the probe on, and let the banner draw for a moment in real time.
    const reached = await page.evaluate(async () => {
      const w = window as unknown as { __famiduel: H & { sfx: { play(n: string): void } }; __reader: { on: boolean; turned: Set<string> } };
      const app = w.__famiduel;
      const sfx = app.sfx;
      const play = sfx.play;
      let point = false;
      sfx.play = function (n: string) {
        if (n === 'score' || n === 'win') point = true;
        play.call(this, n);
      };
      w.__reader.turned.clear();
      w.__reader.on = true;
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
      try {
        for (let i = 0; i < 240 && !point && !app.runner!.result; i++) {
          (app.runner as unknown as { fastForward(s: number): void }).fastForward(0.25);
          await frame();
        }
      } finally {
        sfx.play = play;
      }
      return point || !!app.runner!.result;
    });
    await page.waitForTimeout(500);
    const roundWords = await page.evaluate(() => {
      const r = (window as unknown as { __reader: { on: boolean; turned: Set<string> } }).__reader;
      r.on = false;
      return [...r.turned];
    });
    // Turn games wait for the person's move, so only real-time games must reach a point.
    if (!WAITS_FOR_PERSON.includes(id)) expect(reached, `${id}: a point or the match end within 60 s of play`).toBe(true);
    else console.log(`solo round end: ${id} waits for the person (reached ${reached})`);
    expect(roundWords.filter((t) => /\b(you(r)?|them)\b/i.test(t)), `${id}: "you" words in the bot's half at the round end`).toEqual([]);
    await page.screenshot({ path: path.join(OUT, `solo-round-${id}.png`) });
    // The bot wins this one (ended by hand to keep the pass short).
    await page.evaluate(() => {
      (window as unknown as { __famiduel: H }).__famiduel.runner!.result = { winner: 1, score: [0, 1] };
    });
    await expect(page.locator('#result')).toBeVisible();
    n++;
    await expect(page.locator('#result .half.p1 .res-title'), id).toHaveText('Bot wins');
    await expect(page.locator('#result .half.p1 .who'), id).toHaveText('Bot 🤖😴 🏆');
    await expect(page.locator('#result .half.p0 .res-title'), id).toHaveText('So close!');
    await expect(page.locator('#result .half.p1'), `${id}: "Bot wins" reads upright`).toHaveCSS('transform', 'none');
    await expect(page.locator('#result .half.p0 .res-night'), id).toHaveText(`You vs the bot: 0 – ${n}`);
    if (id === 'airhockey') await page.screenshot({ path: path.join(OUT, 'solo-result.png') });
    await page.locator('#homeBtn').tap();
  }
  await expect(page.locator('.night-score span')).toContainText(`You vs the bot · ${n} games`);
  // The family's match night never saw those games, and solo survives a reload.
  await page.locator('#modeSeg button[data-v="together"]').tap();
  await expect(page.locator('.night-score span')).toContainText('Match night · 0 games');
  await expect(page.locator('.player-chip[data-p="1"] .pname')).toHaveText('Mia');
  expect(await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.store.data.profiles.map((p) => p.bot))).toEqual([null, null]);
  await page.locator('#modeSeg button[data-v="solo"]').tap();
  await page.reload();
  await expect(page.locator('#modeSeg button.on')).toHaveAttribute('data-v', 'solo');
  await expect(page.locator('.night-score span')).toContainText(`You vs the bot · ${n} games`);
  expect(errors).toEqual([]);
});

// F121: the person can sit at the top with the bot below (a seat's own bot level), so the
// bot's words and half turn to face the top instead.
test('play the bot from the top seat: the bottom bot\'s words face the person up top', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  type H = Hook & { runner: { players: { bot: string | null }[] } | null };
  await setPlayers(page, ['easy', null]);
  for (const id of ['airhockey', 'sumo', 'snake', 'minigolf'].filter((x) => built.includes(x))) {
    await page.locator(`.game-card[data-id="${id}"]`).tap();
    await expect(page.locator('#intro .half.p0'), `${id}: the bottom bot's half faces up`).toHaveCSS('transform', /^matrix\(-1, /);
    await page.evaluate(() => {
      const r = (window as unknown as { __reader: { on: boolean; turned: Set<string> } }).__reader;
      r.turned.clear();
      r.on = true;
      const e = (window as unknown as { __edges: { on: boolean; over: Map<string, number> } }).__edges;
      e.over.clear();
      e.on = true;
    });
    await introAsPeople(page, [1]);
    expect(await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.players.map((p) => p.bot)), id).toEqual(['easy', null]);
    await page.waitForTimeout(2600);
    const [turned, over] = await page.evaluate(() => {
      const r = (window as unknown as { __reader: { on: boolean; turned: Set<string> } }).__reader;
      const e = (window as unknown as { __edges: { on: boolean; over: Map<string, number> } }).__edges;
      r.on = false;
      e.on = false;
      return [[...r.turned], [...e.over]];
    });
    expect(turned.length, `${id}: the bottom bot's words were turned to face the top`).toBeGreaterThan(0);
    expect(over, `${id}: no turned word runs off the screen`).toEqual([]);
    // F120: the bot's half never says "you" (the person would read it as their own).
    expect(turned.filter((t) => /\b(you(r)?|them)\b/i.test(t)), `${id}: "you" words in the bot's half`).toEqual([]);
    await page.screenshot({ path: path.join(OUT, `solo-top-${id}.png`) });
    await leaveMatch(page);
  }
  expect(errors).toEqual([]);
});

test('seat cue: in games where both pieces roam, seats read apart in greyscale (solid vs dashed ring)', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, ['normal', 'hard']);
  for (const id of ['sumo', 'snake', 'tanks']) {
    await page.evaluate((g) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(g), id);
    await expect(page.locator('#play')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(3));
    await page.waitForTimeout(300);
    // What a kid with no colour vision sees: the rings must still say whose piece is whose.
    await page.evaluate(() => (document.body.style.filter = 'grayscale(1)'));
    await page.screenshot({ path: path.join(OUT, `seat-cue-${id}-grey.png`) });
    await page.evaluate(() => (document.body.style.filter = ''));
    await leaveMatch(page);
  }
  expect(errors).toEqual([]);
});

test('power buttons: each wears a band of its owner\'s colour, even with an empty meter', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, ['normal', 'hard']);
  for (const id of ['penalty', 'snacksnatch', 'airhockey']) {
    await page.evaluate((g) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(g), id);
    await expect(page.locator('#play')).toBeVisible();
    await page.waitForTimeout(400);
    type BtnHook = { runner: { game: { ctx: { players: { color: string }[] }; powerBtns: ({ button: { x: number; y: number; r: number } } | null)[] } } };
    // A button may be dimmed (countdown, not usable yet), so the band is judged by hue:
    // each sample on it must sit nearer its owner's colour than the other seat's.
    const verdicts = await page.evaluate(() => {
      const r = (window as unknown as { __famiduel: BtnHook }).__famiduel.runner.game;
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      const sc = Math.min(c.width / 360, c.height / 640);
      const ox = (c.width - 360 * sc) / 2;
      const oy = (c.height - 640 * sc) / 2;
      const px = (wx: number, wy: number) => Array.from(g.getImageData(Math.round(ox + wx * sc), Math.round(oy + wy * sc), 1, 1).data.slice(0, 3));
      const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
      // Distance to a colour's direction (its shade at any brightness), so dimming doesn't count.
      const hueOff = (a: number[], b: number[]) => {
        const k = Math.max(0.05, Math.min(1, a.reduce((s, v, i) => s + v * b[i], 0) / b.reduce((s, v) => s + v * v, 0)));
        return dist(a, b.map((v) => v * k));
      };
      return r.powerBtns.map((b, p) => {
        if (!b) return 'no button';
        const { x, y, r: rad } = b.button;
        const own = hex(r.ctx.players[p].color);
        const foe = hex(r.ctx.players[1 - p].color);
        const samples = [px(x - rad - 6, y), px(x + rad + 6, y)];
        const ok = samples.every((s) => hueOff(s, own) < hueOff(s, foe) && Math.max(...s) - Math.min(...s) > 25);
        return ok ? 'ok' : `seat ${p}: band ${JSON.stringify(samples)} vs own ${own}`;
      });
    });
    expect(verdicts, `${id}: each band in its owner's colour`).toEqual(['ok', 'ok']);
    await page.screenshot({ path: path.join(OUT, `power-band-${id}.png`) });
    await leaveMatch(page);
  }
  expect(errors).toEqual([]);
});

test('seat cue: the intro tells each person which ring is theirs (solid bottom, dashed top)', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  const ringGames = games.games.filter((g) => 'seatRing' in g && g.seatRing).map((g) => g.id);
  expect(ringGames.sort()).toEqual(['snake', 'sumo', 'tanks']);
  for (const id of ringGames) {
    await page.evaluate((g) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(g), id);
    await expect(page.locator('#intro')).toBeVisible();
    const cue = (p: number) => page.locator(`#intro .half.p${p} .seat-cue`);
    await expect(cue(0)).toHaveText(/solid ring/);
    await expect(cue(1)).toHaveText(/dashed ring/);
    await expect(cue(1).locator('circle').first()).toHaveAttribute('stroke-dasharray', '5 4');
    await page.screenshot({ path: path.join(OUT, `seat-cue-${id}-intro.png`) });
    await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showHome());
  }
  // Games without the ring say nothing about one, and a bot's half doesn't need it.
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('airhockey'));
  await expect(page.locator('#intro .seat-cue')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showHome());
  await setPlayers(page, [null, 'normal']);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('sumo'));
  await expect(page.locator('#intro .half.p0 .seat-cue')).toHaveCount(1);
  await expect(page.locator('#intro .half.p1 .seat-cue')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('result: a tap meant for the game right as the match ends does not skip the result', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, ['normal', 'hard']);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('airhockey'));
  await expect(page.locator('#play')).toBeVisible();
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(900));
  await expect(page.locator('#result')).toBeVisible();
  // A kid still swinging taps where "Games" and "Rematch" now sit: nothing happens.
  for (const id of ['#homeBtn', '#rematchBtn']) {
    const box = (await page.locator(id).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect(page.locator('#result'), 'result still up after an early tap').toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'result-settling.png') });
  // A moment later the buttons work.
  await expect(page.locator('#result.settling')).toHaveCount(0, { timeout: 2000 });
  await page.locator('#homeBtn').click();
  await expect(page.locator('#home')).toBeVisible();
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

test('head start offer: losing twice to an Easy bot offers a head start star instead', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  type H = Hook & { runner: { fastForward(s: number): void; result: { winner: number | null } | null; players: { assist: number }[] } | null };
  await setPlayers(page, [null, 'easy']);
  const loseOne = async () => {
    await page.locator('.game-card[data-id="snake"]').tap();
    await introAsPeople(page, [0]);
    const winner = await page.evaluate(() => {
      const r = (window as unknown as { __famiduel: H }).__famiduel.runner!;
      r.fastForward(900);
      return r.result?.winner ?? null;
    });
    expect(winner, 'the easy bot beats a snake that never turns').toBe(1);
    await expect(page.locator('#result')).toBeVisible();
  };
  await loseOne();
  await expect(page.locator('#easierBtn'), 'no offer after one loss').toHaveCount(0);
  await page.click('#homeBtn');
  await loseOne();
  const btn = page.locator('#result .half.p0 #easierBtn');
  await expect(btn, 'offered on the person\'s half after two losses').toBeVisible();
  await expect(btn).toHaveText(/head start/);
  await expect(btn).toHaveAttribute('aria-label', /1 of 3 stars/);
  expect(await smallTargets(page, 'result with head start offer')).toEqual([]);
  await page.screenshot({ path: path.join(OUT, 'headstart-offer.png') });
  await btn.tap();
  await expect(btn).toHaveText(/★ ✓/);
  await expect(btn).toBeDisabled();
  // Rematch: the person's half shows the help, and the match gives it.
  await page.click('#rematchBtn');
  await expect(page.locator('#intro .half.p0 .assist')).toContainText('★');
  await introAsPeople(page, [0]);
  expect(await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.players[0].assist)).toBeGreaterThanOrEqual(1);
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
  await page.click('#settingsBtn');
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
  await page.click('#settingsBtn');
  await page.locator('label.toggle', { has: page.locator('input[data-k="haptics"]') }).tap();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await page.click('#settingsBtn');
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

test('left-handed: corner power buttons move to the other corner and clear what sat there', async ({ page }) => {
  // Backlog 2026-11-01 (F38): a right-hander steers with the right hand and presses powers
  // with the left, so corner power buttons sit in each player's left corner. The Hand row's
  // "Left-handed" (already used by Tank Duel) mirrors them; the bottom seat is a lefty here,
  // the top seat is not. Minigolf's Hole / Total and Sumo's name and pips move out of the way.
  const errors: string[] = [];
  await boot(page, errors);
  await page.evaluate(() => {
    const a = (window as unknown as { __famiduel: Hook & { store: { data: { profiles: { lefty?: boolean }[]; settings: { powers: boolean } } } } }).__famiduel;
    a.store.data.profiles[0].lefty = true;
    a.store.data.settings.powers = true;
    a.store.save();
  });
  await setPlayers(page, [null, null]);
  const corner = ['minigolf', 'airhockey', 'sumo', 'pingpong', 'penalty', 'quickdraw'];
  for (const id of corner) {
    await openFromHome(page, id);
    for (const p of [0, 1]) await page.locator(`.power-card[data-p="${p}"]`).first().tap();
    for (const p of [0, 1]) await page.locator(`#ready${p}`).tap();
    await expect(page.locator('#play')).toBeVisible();
    // Every PowerButton the view holds: { owner, x, y } in world units.
    const spots = await page.evaluate(() => {
      const v = (window as unknown as { __famiduel: { runner: { game: Record<string, unknown> } } }).__famiduel.runner.game;
      const out: { owner: number; x: number; y: number }[] = [];
      for (const val of Object.values(v)) {
        const list = Array.isArray(val) ? val : [val];
        for (const b of list as { owner?: number; button?: { x: number; y: number } }[]) if (b && typeof b === 'object' && b.button && typeof b.owner === 'number') out.push({ owner: b.owner, x: b.button.x, y: b.button.y });
      }
      return out;
    });
    const mine = spots.find((b) => b.owner === 0)!, theirs = spots.find((b) => b.owner === 1)!;
    expect(mine && theirs, `${id}: both power buttons found`).toBeTruthy();
    expect(mine.x, `${id}: the lefty's button is in their right corner`).toBeGreaterThan(300);
    expect(mine.y, `${id}: ...at their own end`).toBeGreaterThan(560);
    expect(theirs.x, `${id}: the right-hander's button (turned 180°) stays in their left corner`).toBeGreaterThan(300);
    expect(theirs.y).toBeLessThan(80);
    await page.waitForTimeout(2400); // countdown
    await page.screenshot({ path: path.join(OUT, `lefty-${id}.png`) });
    await leaveMatch(page);
  }
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
  // Each FIRE button wears its owner's colour as a band (sampled just outside the dark gap,
  // left and right of the button so neither the reload ring nor the ammo pips are in the way).
  const rimCheck = () =>
    page.evaluate(() => {
      const r = (window as unknown as { __famiduel: { runner: { game: { ctx: { players: { color: string }[] } } } } }).__famiduel.runner.game;
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      const sc = Math.min(c.width / 360, c.height / 640);
      const ox = (c.width - 360 * sc) / 2;
      const oy = (c.height - 640 * sc) / 2;
      const px = (wx: number, wy: number) => Array.from(g.getImageData(Math.round(ox + wx * sc), Math.round(oy + wy * sc), 1, 1).data.slice(0, 3));
      const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      // Seat 0 (lefty) FIRE at (72, 584); seat 1's (bot, right-handed) turned 180° lands at (72, 56).
      const off = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
      return [
        [px(72 - 37.5, 584), px(72 + 37.5, 584)].map((p) => off(p, hex(r.ctx.players[0].color))),
        [px(72 - 37.5, 56), px(72 + 37.5, 56)].map((p) => off(p, hex(r.ctx.players[1].color))),
      ];
    });
  await expect.poll(async () => Math.max(...(await rimCheck()).flat()), { timeout: 3000, message: 'both FIRE buttons ringed in their owner\'s colour' }).toBeLessThan(40);
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

test('tanks: a loaded bouncy shell blinks the FIRE band gold, even for Mint', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  const mint = PLAYER_COLORS.find((c) => c.name === 'Mint')!.hex;
  await page.evaluate((m) => {
    (window as unknown as { __famiduel: { store: { data: { profiles: { color: string }[] } } } }).__famiduel.store.data.profiles[0].color = m;
  }, mint);
  await setPlayers(page, ['normal', 'hard']);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('tanks'));
  await expect(page.locator('#play')).toBeVisible();
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(3));
  type BouncyHook = { runner: { game: { game: { tanks: { bouncy: number }[] } } } };
  // Seat 0 (right-handed) FIRE sits at (288, 584): sample its band left and right.
  const band = () =>
    page.evaluate(() => {
      const r = (window as unknown as { __famiduel: BouncyHook }).__famiduel.runner.game;
      r.game.tanks[0].bouncy = 99; // keep one loaded however often the bot fires
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      const sc = Math.min(c.width / 360, c.height / 640);
      const ox = (c.width - 360 * sc) / 2;
      const oy = (c.height - 640 * sc) / 2;
      const px = (wx: number, wy: number) => Array.from(g.getImageData(Math.round(ox + wx * sc), Math.round(oy + wy * sc), 1, 1).data.slice(0, 3));
      return [px(288 - 37.5, 584), px(288 + 37.5, 584)];
    });
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const off = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  const seen = { gold: false, mint: false };
  for (let i = 0; i < 30 && !(seen.gold && seen.mint); i++) {
    const [a, b] = await band();
    if (off(a, hex('#ffd54a')) < 40 && off(b, hex('#ffd54a')) < 40) {
      if (!seen.gold) await page.screenshot({ path: path.join(OUT, 'tanks-bouncy-band.png') });
      seen.gold = true;
    }
    if (off(a, hex(mint)) < 40 && off(b, hex(mint)) < 40) seen.mint = true;
    await page.waitForTimeout(70);
  }
  expect(seen, 'the band blinks gold and back to the owner\'s Mint').toEqual({ gold: true, mint: true });
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

test('sea battle: two people see where their own shot landed before passing the phone', async ({ page }) => {
  // The shooter's beat used to start at the shot, so the result showed for ~0.9 s after the
  // 0.38 s flight, and after hit, hit, miss the header said "Direct hit!".
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, null]);
  await page.locator('.game-card[data-id="seabattle"]').tap();
  await introAsPeople(page, [0, 1]);
  await page.waitForTimeout(2200); // countdown
  type SeaHook = { runner: null | { game: { header: string; volley: { hits: number; sunk: number }; mode: { kind: string; t: number }; shells: unknown[] } } };
  const look = () =>
    page.evaluate(() => {
      const v = (window as unknown as { __famiduel: SeaHook }).__famiduel.runner?.game;
      if (!v) return null;
      return { kind: v.mode.kind, t: v.mode.t, flying: v.shells.length > 0, header: v.header, volley: { ...v.volley } };
    });
  type Turn = { shown: number; hits: number; sunk: number; early: string[]; header: string };
  const turns: Turn[] = [];
  let cur: Turn | null = null;
  let shot = false;
  const playing = seaBattlePerson(page, 30_000, 9);
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    const s = await look().catch(() => null);
    if (s?.kind === 'after') {
      cur ??= { shown: 0, hits: 0, sunk: 0, early: [], header: '' };
      if (s.flying) cur.early.push(s.header);
      else {
        cur.shown = Math.max(cur.shown, s.t);
        cur.hits = s.volley.hits;
        cur.sunk = s.volley.sunk;
        cur.header = s.header;
        if (!shot && s.t > 0.5) {
          shot = true;
          await page.screenshot({ path: path.join(OUT, 'seabattle-pass-beat.png') });
        }
      }
    } else if (cur) {
      turns.push(cur);
      cur = null;
    }
    await page.waitForTimeout(50);
  }
  await playing;
  expect(turns.length, 'both people took turns').toBeGreaterThanOrEqual(2);
  for (const tr of turns) {
    for (const h of tr.early) expect(h, 'no result in the header before the shell lands').not.toMatch(/Missed|hit|sank/i);
    const need = tr.sunk ? 2.0 : tr.hits ? 1.6 : 1.0; // shooterBeat with passing, less polling slack
    expect(tr.shown, 'the result stays up after it lands').toBeGreaterThan(need);
    expect(tr.header, 'the header names the shot that ended the turn').toBe(tr.sunk ? 'You sank a ship!' : tr.hits ? 'Direct hit!' : 'Missed…');
  }
  if (!shot) await page.screenshot({ path: path.join(OUT, 'seabattle-pass-beat.png') });
  expect(errors).toEqual([]);
});

test('sea battle: with two people, the first look-away cover says who goes first', async ({ page }) => {
  // Two people pass the phone, so the first shooter is told on the cover itself, before the
  // sea shows: "You go first!" above their name. Read off the canvas, not the code.
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, null]);
  await page.locator('.game-card[data-id="seabattle"]').tap();
  await introAsPeople(page, [0, 1]);
  await page.waitForTimeout(2200); // countdown
  type SeaHook = { runner: null | { game: { mode: { kind: string; next?: string; p: number }; game: { shotsFired: number[] } } } };
  const look = () =>
    page.evaluate(() => {
      const v = (window as unknown as { __famiduel: SeaHook }).__famiduel.runner?.game;
      return v ? { kind: v.mode.kind, next: v.mode.next ?? null, p: v.mode.p, shots: v.game.shotsFired[0] + v.game.shotsFired[1] } : null;
    });
  const seen = () => page.evaluate(() => [...(window as unknown as { __contrast: { seen: Map<string, unknown> } }).__contrast.seen.keys()]);
  await page.evaluate(() => {
    const c = (window as unknown as { __contrast: { on: boolean; seen: Map<string, unknown> } }).__contrast;
    c.seen.clear();
    c.on = true;
  });
  const playing = seaBattlePerson(page, 20_000, 3);
  let cover: Awaited<ReturnType<typeof look>> = null;
  let words: string[] = [];
  const end = Date.now() + 20_000;
  while (Date.now() < end && !cover) {
    const s = await look().catch(() => null);
    if (s?.kind === 'cover' && s.next === 'fire' && s.shots === 0) {
      await page.waitForTimeout(250); // one probe pass over the cover's words
      words = await seen();
      await page.screenshot({ path: path.join(OUT, 'seabattle-first-cover.png') });
      cover = s;
    } else await page.waitForTimeout(40);
  }
  await playing;
  expect(cover, 'the first fire turn opens on a look-away cover').not.toBeNull();
  const name = await page.evaluate((p) => (window as unknown as { __famiduel: { store: { data: { profiles: { name: string }[] } } } }).__famiduel.store.data.profiles[p].name, cover!.p);
  expect(words, 'the cover says who goes first').toContain('You go first!');
  expect(words, "and names them").toContain(name);
  expect(words.some((w) => /look away!$/.test(w)), 'and tells the other one to look away').toBe(true);
  await page.evaluate(() => ((window as unknown as { __contrast: { on: boolean } }).__contrast.on = false));
  expect(errors).toEqual([]);
});

test('sea battle: a hit fires again, a miss passes the turn', async ({ page }) => {
  // Chris, 2026-11-01: rules must match the ones kids know, like another shot after a hit.
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, 'easy']);
  await page.locator('.game-card[data-id="seabattle"]').tap();
  await introAsPeople(page, [0]);
  await page.waitForTimeout(2200); // countdown
  type SeaHook = {
    runner: null | { game: { header: string; again: number; mode: { kind: string; p: number; t: number }; shells: unknown[]; game: { turn: number; phase: string; seas: { occ: number[]; marks: number[] }[] } } };
  };
  const look = () =>
    page.evaluate(() => {
      const v = (window as unknown as { __famiduel: SeaHook }).__famiduel.runner!.game;
      const enemy = v.game.seas[1];
      const open = [...enemy.marks].map((k, i) => (k === 0 ? i : -1)).filter((i) => i >= 0);
      return {
        kind: v.mode.kind,
        p: v.mode.p,
        t: v.mode.t,
        still: v.shells.length === 0,
        turn: v.game.turn,
        header: v.header,
        again: v.again,
        ship: open.find((i) => enemy.occ[i] >= 0) ?? null,
        water: open.find((i) => enemy.occ[i] < 0) ?? null,
      };
    });
  const tap = (x: number, y: number) => tapWorld(page, 77, x, y);
  // Grid geometry from src/games/seabattle/index.ts (the person is seat 0, upright).
  const N = 10, C = 27, GX = (360 - N * C) / 2, GY = 82;
  const fire = async (cell: number) => {
    const x = GX + (cell % N) * C + C / 2, y = GY + Math.floor(cell / N) * C + C / 2;
    await tap(x, y);
    await page.waitForTimeout(300);
    await tap(x, y);
  };
  // Hide the fleet as dealt: Ready.
  await expect.poll(async () => (await look()).kind, { timeout: 5000 }).toBe('place');
  await page.waitForTimeout(700);
  await tap(204 + 70, 404 + 29);
  // Wait for the person's turn (the bot may go first), then hit a ship.
  const myTurn = async () => expect.poll(async () => { const s = await look(); return s.kind === 'fire' && s.p === 0 && s.still; }, { timeout: 20_000 }).toBe(true);
  await myTurn();
  for (let hit = 1; hit <= 2; hit++) {
    const s = await look();
    await fire(s.ship!);
    await expect.poll(async () => { const x = await look(); return x.still && x.again === hit; }, { timeout: 3000 }).toBe(true);
    await page.waitForTimeout(250);
    const after = await look();
    expect(after.turn, 'a hit keeps the turn').toBe(0);
    expect(after.kind).toBe('fire');
    expect(after.header, 'the header says to fire again').toContain('go again');
    if (hit === 1) await page.screenshot({ path: path.join(OUT, 'seabattle-hit-again.png') });
  }
  // Two hits this turn: each hit cell wears its number (1, 2) in a gold badge at its corner.
  const chain = await page.evaluate(() => (window as unknown as { __famiduel: { runner: { game: { turnHits: number[][] } } } }).__famiduel.runner.game.turnHits[0]);
  expect(chain.length, 'both hits are numbered').toBe(2);
  await page.waitForTimeout(400); // let the HIT! pop and bursts clear the corner
  const badgePx = await page.evaluate(([cells, n, cc, gx, gy]) => {
    const c = document.getElementById('stage') as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const sc = Math.min(c.width / 360, c.height / 640);
    const ox = (c.width - 360 * sc) / 2;
    const oy = (c.height - 640 * sc) / 2;
    // Badge centre: the cell's top-right corner, 4 units in; read just above the digit.
    return cells.map((cell) => Array.from(g.getImageData(Math.round(ox + (gx + (cell % n) * cc + cc - 4) * sc), Math.round(oy + (gy + Math.floor(cell / n) * cc + 4 - 6) * sc), 1, 1).data.slice(0, 3)));
  }, [chain, N, C, GX, GY] as const);
  // Judge by hue: gold is bright red and green over little blue (a flash or shake can dim it).
  for (const px of badgePx) expect(px[0] > 150 && px[1] > 0.7 * px[0] && px[0] - px[2] > 90, `gold hit badge, got ${px}`).toBe(true);
  await page.screenshot({ path: path.join(OUT, 'seabattle-hit-badges.png') });
  // A miss hands the turn to the bot, and the turn's two hits are summed up over the sea.
  await fire((await look()).water!);
  await expect.poll(async () => (await look()).turn, { timeout: 3000 }).toBe(1);
  const tally = () =>
    page.evaluate(() => {
      const fx = (window as unknown as { __famiduel: { runner: { fx: { floaters: { str: string; player: number }[] } } } }).__famiduel.runner.fx;
      return fx.floaters.filter((f) => /hits!$/.test(f.str)).map((f) => ({ str: f.str, player: f.player }));
    });
  await expect.poll(tally, { timeout: 3000 }).toEqual([{ str: '2 hits!', player: 0 }]);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, 'seabattle-turn-tally.png') });
  // The bot's turn ends with a miss too, and the next person turn starts plain.
  await myTurn();
  const back = await look();
  expect(back.again).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __famiduel: { runner: { game: { turnHits: number[][] } } } }).__famiduel.runner.game.turnHits[0]), 'a new turn starts without badges').toEqual([]);
  expect(back.header).not.toContain('go again');
  expect(errors).toEqual([]);
});

test('sea battle: on a small phone a cell is a fair target and a stray tap only aims', async ({ page }) => {
  // The 10x10 grid is the smallest canvas target in the shown games (27 world units). On a
  // 320 px phone a cell is ~24 CSS px, under the 44 px guideline, so a shot takes two taps:
  // the first only aims (a ring), a tap on another cell moves the aim, and only a second tap
  // on the aimed cell fires. This pins both: the cell size and that a stray tap is free.
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  await setPlayers(page, [null, 'easy']);
  await page.locator('.game-card[data-id="seabattle"]').tap();
  await introAsPeople(page, [0]);
  await page.waitForTimeout(2200); // countdown
  type SeaHook = { runner: null | { game: { aim: number | null; mode: { kind: string; p: number }; shells: unknown[]; game: { turn: number; seas: { marks: number[] }[] } } } };
  const look = () =>
    page.evaluate(() => {
      const v = (window as unknown as { __famiduel: SeaHook }).__famiduel.runner!.game;
      return { kind: v.mode.kind, p: v.mode.p, still: v.shells.length === 0, aim: v.aim, shots: v.game.seas[1].marks.filter((k) => k !== 0).length };
    });
  const box = await worldBox(page);
  const N = 10, C = 27, GX = (360 - N * C) / 2, GY = 82;
  const cellPx = (C / 360) * box.width;
  expect(cellPx, `a grid cell on a 320 px phone is ${cellPx.toFixed(1)} CSS px`).toBeGreaterThanOrEqual(23.5);
  const tap = (x: number, y: number) => tapWorld(page, 78, x, y);
  const at = (cell: number) => [GX + (cell % N) * C + C / 2, GY + Math.floor(cell / N) * C + C / 2] as const;
  await expect.poll(async () => (await look()).kind, { timeout: 5000 }).toBe('place');
  await page.waitForTimeout(700);
  await tap(204 + 70, 404 + 29); // Ready with the fleet as dealt
  await expect.poll(async () => { const s = await look(); return s.kind === 'fire' && s.p === 0 && s.still; }, { timeout: 20_000 }).toBe(true);
  const before = (await look()).shots;
  // A stray tap (cell 44) only aims; the neighbour the kid meant (45) moves the aim.
  await tap(...at(44));
  await page.waitForTimeout(200);
  let s = await look();
  expect(s.aim, 'the first tap aims').toBe(44);
  expect(s.shots, 'nothing fired on the first tap').toBe(before);
  await tap(...at(45));
  await page.waitForTimeout(200);
  s = await look();
  expect(s.aim, 'a tap on the next cell moves the aim').toBe(45);
  expect(s.shots, 'still nothing fired').toBe(before);
  await page.screenshot({ path: path.join(OUT, 'seabattle-small-aim.png') });
  await tap(...at(45));
  await expect.poll(async () => (await look()).shots, { timeout: 3000 }).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('sea battle: the first shot says who goes first, and the rematch swaps it', async ({ page }) => {
  // Sea Battle picks its first shooter after both fleets are hidden, so the countdown can't
  // say who starts. The first turn says it instead: "You go first!" for a person, "<bot> goes
  // first" while a bot opens. Two matches through the real Rematch button: both cases show.
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, 'easy']);
  await page.locator('.game-card[data-id="seabattle"]').tap();
  type SeaHook = {
    runner: null | { result: unknown; game: { header: string; announced: string | null; mode: { kind: string; p: number }; firstMover(): number | null; game: { phase: string } } };
  };
  const look = () =>
    page.evaluate(() => {
      const v = (window as unknown as { __famiduel: SeaHook }).__famiduel.runner!.game;
      return { kind: v.mode.kind, p: v.mode.p, phase: v.game.phase, header: v.header, announced: v.announced, first: v.firstMover() };
    });
  const tap = (x: number, y: number) => tapWorld(page, 78, x, y);
  const firsts: number[] = [];
  for (let m = 0; m < 2; m++) {
    await introAsPeople(page, [0]);
    await page.waitForTimeout(2200); // countdown
    await expect.poll(async () => (await look()).kind, { timeout: 8000 }).toBe('place');
    await page.waitForTimeout(700);
    await tap(204 + 70, 404 + 29); // Ready, fleet as dealt
    // Catch the opening turn's first frames (a bot fires within a second or so).
    let seen: Awaited<ReturnType<typeof look>> | null = null;
    await expect
      .poll(
        async () => {
          const s = await look();
          if (s.phase === 'fire' && (s.kind === 'fire' || s.kind === 'bot') && s.announced) seen = s;
          return !!seen;
        },
        { timeout: 8000, intervals: [40] },
      )
      .toBe(true);
    const s = seen!;
    firsts.push(s.first!);
    if (s.first === 0) {
      expect(s.kind, 'the person opens').toBe('fire');
      expect(s.announced, 'a pop tells the person they start').toBe('You go first!');
      expect(s.header, 'the header says it too').toContain('you go first!');
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, 'seabattle-you-first.png') });
    } else {
      expect(s.kind, 'the bot opens').toBe('bot');
      expect(s.announced, 'a pop says the bot starts').toMatch(/ goes first$/);
      expect(s.header, 'the header names who starts').toMatch(/ goes first…$/);
      await page.screenshot({ path: path.join(OUT, 'seabattle-bot-first.png') });
    }
    // End in a draw, then Rematch.
    await page.evaluate(() => {
      const r = (window as unknown as { __famiduel: SeaHook }).__famiduel.runner!;
      if (!r.result) r.result = { winner: null, score: [0, 0] };
    });
    await expect(page.locator('#result')).toBeVisible({ timeout: 5000 });
    if (m === 0) await page.locator('#rematchBtn').tap();
  }
  expect(firsts[1], 'the rematch hands the first shot to the other seat').not.toBe(firsts[0]);
  expect(errors).toEqual([]);
});

test("tic-tac-toe: the bot's newest mark sits on a tile until you move", async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, 'normal']);
  await openFromHome(page, 'tictactoe');
  await introAsPeople(page, [0]);
  await page.waitForTimeout(2200); // countdown
  type TttHook = {
    runner: null | { game: { ringCell(): number | null; game: { turn: number; board: number[]; between: boolean; done: boolean; last: { p: number; cell: number } | null } } };
  };
  const look = () =>
    page.evaluate(() => {
      const v = (window as unknown as { __famiduel: TttHook }).__famiduel.runner!.game;
      return { ring: v.ringCell(), last: v.game.last, turn: v.game.turn, board: [...v.game.board], between: v.game.between, done: v.game.done };
    });
  const tap = (cell: number) => tapWorld(page, 77, 45 + (cell % 3) * 90 + 45, 185 + Math.floor(cell / 3) * 90 + 45);
  let s = await look();
  expect(s.last).toBeNull();
  expect(s.ring).toBeNull();
  // If the person starts, mark the centre and check their own mark gets the tile once drawn.
  if (s.turn === 0) {
    await tap(4);
    await expect.poll(async () => (await look()).ring, { timeout: 2000 }).toBe(4);
  }
  // A bot turn: its newest mark is tiled and stays tiled while the person thinks (3 s),
  // then the tile moves to the person's mark as soon as it is drawn.
  await expect.poll(async () => { s = await look(); return s.turn === 0 && s.last?.p === 1 && !s.between; }, { timeout: 5000 }).toBe(true);
  const botCell = s.last!.cell;
  await expect.poll(async () => (await look()).ring, { timeout: 2000 }).toBe(botCell);
  await page.screenshot({ path: path.join(OUT, 'tictactoe-last-mark.png') });
  await page.waitForTimeout(3000);
  s = await look();
  expect(s.ring, "the bot's mark is still tiled after 3 s").toBe(botCell);
  const free = s.board.findIndex((v) => v < 0);
  await tap(free);
  await expect.poll(async () => (await look()).last?.p, { timeout: 1000 }).toBe(0);
  s = await look();
  expect(s.ring, 'the tile leaves the bot mark as soon as the person marks').not.toBe(botCell);
  // Unless that mark ended the game (the winning line takes over), the tile moves to it.
  if (!s.between) await expect.poll(async () => (await look()).ring, { timeout: 2000 }).toBe(free);
  else expect(s.ring).toBeNull();
  expect(errors).toEqual([]);
});

test("four in a row: the bot's newest disc keeps a ring until you move", async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, 'normal']);
  await openFromHome(page, 'fourinarow');
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
  const drop = (col: number) => tapWorld(page, 88, 48 + col * 43 + 21.5, 520);
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

test("checkers: a bot's double jump stays traced on the board until you move", async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, 'normal']);
  await openFromHome(page, 'checkers');
  await introAsPeople(page, [0]);
  type Marks = { trail: number[]; taken: number[]; mover: number } | null;
  type CheckersHook = { runner: null | { game: { lastMarks(): Marks; game: { cells: Int8Array; turn: number; done: boolean } } } };
  // Before the countdown ends, set up a position where the bot (top, moving down) must
  // double-jump: its man on (1,2) takes (2,3) and (4,5), landing on (5,6). The person keeps
  // a man on (7,0) so the match goes on.
  await page.evaluate(() => {
    const v = (window as unknown as { __famiduel: CheckersHook }).__famiduel.runner!.game;
    const b = new Int8Array(64);
    b[1 * 8 + 2] = -1;
    b[2 * 8 + 3] = 1;
    b[4 * 8 + 5] = 1;
    b[7 * 8 + 0] = 1;
    const g = v.game as unknown as { cells: Int8Array; turn: number; moves: unknown; lastMove: unknown };
    g.cells = b;
    g.turn = 1;
    g.moves = null;
    g.lastMove = null;
  });
  const look = () => page.evaluate(() => (window as unknown as { __famiduel: CheckersHook }).__famiduel.runner!.game.lastMarks());
  await expect.poll(look, { timeout: 8000 }).not.toBeNull();
  let m = await look();
  expect(m, 'the whole path is traced, not just start and end').toEqual({ trail: [10, 28, 46], taken: [19, 37], mover: 1 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'checkers-double-jump.png') });
  // The canvas really shows it: the empty taken squares are marked (ring, tint, cross),
  // while an untouched empty dark square is still plain board brown.
  const brownOff = await page.evaluate(() => {
    const c = document.getElementById('stage') as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const sc = Math.min(c.width / 360, c.height / 640);
    const ox = (c.width - 360 * sc) / 2;
    const oy = (c.height - 640 * sc) / 2;
    const off = (sqr: number) => {
      const d = g.getImageData(Math.round(ox + (40 + (sqr % 8) * 39 + 19.5) * sc), Math.round(oy + (164 + Math.floor(sqr / 8) * 39 + 19.5) * sc), 1, 1).data;
      return Math.abs(d[0] - 0x8a) + Math.abs(d[1] - 0x5a) + Math.abs(d[2] - 0x3b);
    };
    return { taken: [off(19), off(37)], plain: off(3) };
  });
  expect(brownOff.plain, 'a plain empty square is board brown').toBeLessThan(20);
  for (const o of brownOff.taken) expect(o, 'each taken square is marked').toBeGreaterThan(60);
  // Still traced while the person thinks.
  await page.waitForTimeout(2500);
  expect(await look()).toEqual(m);
  // The person moves (7,0) to (6,1); the marks move to that simple move.
  const tapSq = (sqr: number) => tapWorld(page, 77, 40 + (sqr % 8) * 39 + 19.5, 164 + Math.floor(sqr / 8) * 39 + 19.5);
  await tapSq(56);
  // Like a person, wait to see the piece picked up before tapping where it goes: two taps
  // from the same finger inside one frame would replace each other (flaky in the serial run).
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __famiduel: { runner: { game: { sel: { from: number } | null } } } }).__famiduel.runner.game.sel?.from ?? null), { timeout: 2000 })
    .toBe(56);
  await tapSq(49);
  await expect.poll(async () => (await look())?.mover, { timeout: 2000 }).toBe(0);
  m = await look();
  expect(m).toEqual({ trail: [56, 49], taken: [], mover: 0 });
  expect(errors).toEqual([]);
});

test('tank duel: every arena shows and two bots play a round on it', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, ['normal', 'normal']);
  type TankHook = {
    openGame(id: string): void;
    startMatch(): void;
    runner: null | { fastForward(s: number): void; game: { game: { layout: number; round: number; arena: { constructor: new (g: boolean[]) => unknown }; over: boolean } } };
  };
  for (let i = 0; i < LAYOUTS.length; i++) {
    const shown = await page.evaluate(
      ({ i, grid }) => {
        const app = (window as unknown as { __famiduel: TankHook }).__famiduel;
        app.openGame('tanks');
        app.startMatch();
        const g = app.runner!.game.game;
        g.layout = i;
        g.arena = new g.arena.constructor(grid) as typeof g.arena;
        app.runner!.fastForward(1.2);
        return g.layout;
      },
      { i, grid: buildGrid(LAYOUTS[i]) },
    );
    expect(shown, LAYOUTS[i].name).toBe(i);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, `tanks-arena-${LAYOUTS[i].name.toLowerCase()}.png`) });
    const round = await page.evaluate(() => {
      const app = (window as unknown as { __famiduel: TankHook }).__famiduel;
      const g = app.runner!.game.game;
      for (let s = 0; s < 120 && g.round === 1 && !g.over; s++) app.runner!.fastForward(1);
      return g.round > 1 || g.over;
    });
    expect(round, `${LAYOUTS[i].name}: a round ends`).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('minigolf: every hole comes up in a match, fits the phone and can be finished', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, ['hard', 'hard']);
  type GolfHook = {
    openGame(id: string): void;
    startMatch(): void;
    runner: null | { fastForward(s: number): void; game: { game: { holes: { id: string; par: number }[]; holeIdx: number; finished: boolean; phase: string; card: unknown[]; balls: { x: number; y: number }[]; startHole(i: number): void } } };
  };
  for (const h of holes.holes) {
    // Start matches until the seeded pick includes this hole, then jump to it.
    const found = await page.evaluate((id) => {
      const app = (window as unknown as { __famiduel: GolfHook }).__famiduel;
      for (let tries = 0; tries < 80; tries++) {
        app.openGame('minigolf');
        app.startMatch();
        const g = app.runner!.game.game;
        const idx = g.holes.findIndex((x) => x.id === id);
        if (idx < 0) continue;
        g.startHole(idx);
        app.runner!.fastForward(5); // countdown and the hole card
        return { idx, tries, phase: g.phase, pars: g.holes.map((x) => x.par) };
      }
      return null;
    }, h.id);
    expect(found, `${h.id} is picked for some match`).not.toBeNull();
    // The match ramps up: the shipped pars are the content's, and never drop hole to hole.
    expect(found!.pars[found!.idx], `${h.id}: par on the hole card`).toBe(h.par);
    expect([...found!.pars].sort((a, b) => a - b), `${h.id}: match pars ${found!.pars}`).toEqual(found!.pars);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, `minigolf-hole-${h.id}.png`) });
    const bars = await barMismatch(page);
    expect(Math.max(bars.top, bars.bottom), `${h.id}: letterbox bars carry the game edge`).toBeLessThan(24);
    // Minigolf's HUD strips are dark; their coloured outer edge makes each
    // player's bar glow in their colour instead of reading as a black band.
    const peak = await barPeak(page);
    expect(Math.min(peak.top, peak.bottom), `${h.id}: bars show each player's colour, not black`).toBeGreaterThan(55);
    // Two hard bots play it out in the real UI (game time, fast-forwarded).
    const done = await page.evaluate((idx) => {
      const app = (window as unknown as { __famiduel: GolfHook }).__famiduel;
      const g = app.runner!.game.game;
      for (let s = 0; s < 120 && g.holeIdx === idx && !g.finished; s++) app.runner!.fastForward(1);
      return { left: g.holeIdx !== idx || g.finished, card: g.card.length };
    }, found!.idx);
    expect(done.left, `${h.id}: two hard bots finish the hole within 2 minutes`).toBe(true);
    expect(done.card, `${h.id}: the hole is on the scorecard`).toBe(1);
  }
  await page.evaluate(() => (window as unknown as { __famiduel: { showHome(): void } }).__famiduel.showHome());
  expect(errors).toEqual([]);
});

test('air hockey: the bot paddle moves like a hand in real time, not a twitch', async ({ page }) => {
  // Chris (Nov 2026): the bot looked "super spazzy". Watch a real-time match in the app
  // (a hard bot at the top against a normal bot), trace the top paddle every frame, score
  // it with the same motion check as the unit tests, and draw the path for a person to look at.
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, ['normal', 'hard']);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('airhockey'));
  await expect(page.locator('#play')).toBeVisible();
  await page.waitForTimeout(2200); // countdown
  type Trace = { t: number; x: number; y: number; serve: boolean }[];
  const trace: Trace = await page.evaluate(
    (ms) =>
      new Promise<Trace>((done) => {
        type G = { paddles: { x: number; y: number }[]; serve: number };
        const app = (window as unknown as { __famiduel: { runner: { game: { game: G } } } }).__famiduel;
        const out: Trace = [];
        const t0 = performance.now();
        const tick = () => {
          const g = app.runner.game.game;
          out.push({ t: performance.now(), x: g.paddles[1].x, y: g.paddles[1].y, serve: g.serve > 0 });
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else done(out);
        };
        requestAnimationFrame(tick);
      }),
    SECONDS * 1000,
  );
  const { MotionTrace, mergeReports } = await import('../src/core/motion');
  const parts = [];
  let m = new MotionTrace();
  for (let i = 1; i < trace.length; i++) {
    const dt = (trace[i].t - trace[i - 1].t) / 1000;
    if (trace[i].serve || dt <= 0) {
      parts.push(m.cut());
      m = new MotionTrace();
      continue;
    }
    m.record(trace[i].x, trace[i].y, dt);
  }
  parts.push(m.cut());
  const r = mergeReports(parts.filter((p) => p.seconds > 0.5));
  // Draw the traced path over the table (brighter = later) and keep the picture.
  const box = await worldBox(page);
  await page.evaluate(
    ({ pts, box }) => {
      const c = document.createElement('canvas');
      c.id = 'trace';
      Object.assign(c.style, { position: 'fixed', left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px`, pointerEvents: 'none', zIndex: '99' });
      c.width = 360;
      c.height = 640;
      const g = c.getContext('2d')!;
      g.lineWidth = 2;
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].serve) continue;
        g.strokeStyle = `rgba(255,213,74,${0.25 + (0.75 * i) / pts.length})`;
        g.beginPath();
        g.moveTo(pts[i - 1].x, pts[i - 1].y);
        g.lineTo(pts[i].x, pts[i].y);
        g.stroke();
      }
      document.body.append(c);
    },
    { pts: trace, box },
  );
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'airhockey-bot-path.png') });
  fs.writeFileSync(path.join(OUT, 'airhockey-bot-motion.json'), JSON.stringify(r, null, 2));
  await page.evaluate(() => document.getElementById('trace')?.remove());
  expect(r.seconds, 'traced long enough').toBeGreaterThan(SECONDS * 0.5);
  // Looser than the unit test (real frames are uneven), still far below the old bot's ~9 flips/s.
  expect(r.flipsPerSec, 'direction flips per second').toBeLessThan(4);
  expect(r.twitchesPerSec, 'twitches per second').toBeLessThan(1);
  expect(r.wobbleShare, 'time spent wobbling on the spot').toBeLessThan(0.35);
  expect(errors).toEqual([]);
});

test('ping pong: where the ball landed stays on the table until it is hit back', async ({ page }) => {
  // Store reviews of other 2-player apps: Ping Pong is "hard to tell whether the ball has
  // landed yet". Watch two bots rally in real time: every landing leaves a spot that is
  // still fully showing a moment later (unless the ball was already hit back), then goes.
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, ['normal', 'normal']);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('pingpong'));
  await expect(page.locator('#play')).toBeVisible();
  await page.waitForTimeout(2200); // countdown
  type Spot = { x: number; y: number; held: boolean; alpha: number } | null;
  type PongHook = { runner: { game: { bounceSpot(): Spot; game: { hits: number; pointT: number } } } | null };
  const look = () =>
    page.evaluate(() => {
      const v = (window as unknown as { __famiduel: PongHook }).__famiduel.runner!.game;
      return { spot: v.bounceSpot(), hits: v.game.hits };
    });
  // Sample every frame inside the page (a look from the test runner takes longer than a
  // fast ball's last stretch, so the old 150 ms look missed most landings): from the
  // frame a spot appears until the ball is hit back it must stay put, held and fully
  // showing (after its 0.08 s pop-in); after the hit it fades and goes.
  type Frame = { spot: Spot; hits: number; t: number; live: boolean };
  const frames: Frame[] = await page.evaluate(
    (ms) =>
      new Promise<Frame[]>((done) => {
        const v = (window as unknown as { __famiduel: PongHook }).__famiduel.runner!.game;
        const out: Frame[] = [];
        const t0 = performance.now();
        const tick = () => {
          out.push({ spot: v.bounceSpot(), hits: v.game.hits, t: performance.now(), live: v.game.pointT <= 0 });
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else done(out);
        };
        requestAnimationFrame(tick);
      }),
    8000,
  );
  await page.screenshot({ path: path.join(OUT, 'pingpong-bounce-spot.png') });
  let checked = 0;
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const cur = frames[i];
    const fresh = cur.spot?.held && (!prev.spot || prev.spot.x !== cur.spot.x || prev.spot.y !== cur.spot.y);
    if (!fresh) continue;
    const at = cur.spot!;
    let held = 0;
    // Until the hit back, or the point ending (a miss: the spot is cleared with the ball).
    for (let k = i; k < frames.length && frames[k].hits === cur.hits && frames[k].live; k++) {
      const f = frames[k];
      expect(f.spot, 'the spot stays until the ball is hit back').not.toBeNull();
      expect([f.spot!.x, f.spot!.y], 'the spot stays put').toEqual([at.x, at.y]);
      expect(f.spot!.held, 'the spot holds until the ball is hit back').toBe(true);
      // It pops in over 0.08 s, then shows fully until the hit.
      if (f.t - cur.t >= 100) {
        expect(f.spot!.alpha, 'the spot is fully showing while it holds').toBe(1);
        held++;
      }
    }
    if (held >= 1) checked++;
  }
  // Once hit back (or the point ends), an old spot fades and goes within ~2 s.
  const last = frames[frames.length - 1].spot;
  if (last && !last.held) await expect.poll(async () => { const x = await look(); return !x.spot || x.spot.x !== last.x || x.spot.y !== last.y; }, { timeout: 3000 }).toBe(true);
  expect(checked, 'at least one landing was seen holding').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('rematch: whoever went second last match starts the rematch', async ({ page }) => {
  // A coin toss every match could leave a kid going second rematch after rematch. Play
  // three matches in a row of each turn game (two people, through the real result screen's
  // Rematch button) and check the first move swaps seats every time.
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, null]);
  type StartHook = { runner: null | { game: { firstMover?(): number | null }; result: unknown; starterLines(): (string | null)[] } };
  const first = () => page.evaluate(() => (window as unknown as { __famiduel: StartHook }).__famiduel.runner!.game.firstMover?.() ?? null);
  for (const id of ['fourinarow', 'checkers', 'tictactoe', 'penalty', 'minigolf']) {
    await openFromHome(page, id);
    const seen: (number | null)[] = [];
    for (let m = 0; m < 3; m++) {
      await introAsPeople(page, [0, 1]);
      // During the countdown both sides read who goes first (the starter: "You go first!").
      await page.waitForTimeout(500);
      const lines = await page.evaluate(() => (window as unknown as { __famiduel: StartHook }).__famiduel.runner!.starterLines());
      if (id === 'fourinarow' && m === 1) await page.screenshot({ path: path.join(OUT, 'rematch-starter-countdown.png') });
      await page.waitForTimeout(1700); // rest of the countdown
      const f = await first();
      seen.push(f);
      expect(f === 0 || f === 1, `${id} knows its first mover`).toBe(true);
      expect(lines[f!], `${id}: the starter is told it goes first`).toBe('You go first!');
      expect(lines[1 - f!], `${id}: the other seat is told who does`).toMatch(/goes first$/);
      if (id === 'fourinarow' && m === 1) await page.screenshot({ path: path.join(OUT, 'rematch-starter.png') });
      // End the match, then take the result screen's Rematch.
      await page.evaluate(() => {
        const r = (window as unknown as { __famiduel: StartHook }).__famiduel.runner!;
        // A draw, so the night's auto head start (which lets a trailing player start in Tic-Tac-Toe) stays out of it.
        if (!r.result) r.result = { winner: null, score: [0, 0] };
      });
      await expect(page.locator('#result')).toBeVisible({ timeout: 5000 });
      if (m < 2) await page.locator('#rematchBtn').tap();
    }
    expect(seen.every((s) => s === 0 || s === 1), `${id} reports who went first`).toBe(true);
    expect(seen[1], `${id}: the rematch starts with the other seat`).not.toBe(seen[0]);
    expect(seen[2], `${id}: and swaps back the time after`).not.toBe(seen[1]);
    await page.click('#homeBtn');
  }
  expect(errors).toEqual([]);
});

test('penalty: a swiped pick waits for the clock, and the kick always lands on zero', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  await page.evaluate(() => ((window as unknown as { __contrast: { on: boolean } }).__contrast.on = true));
  await setPlayers(page, [null, 'normal']);
  await page.locator('.game-card[data-id="penalty"]').tap();
  await introAsPeople(page, [0]);
  await page.waitForTimeout(2200); // countdown
  type PK = { shooter: number; phase: string; phaseT: number; t: number; flightT: number; kickT: number; picks: number; picked: unknown; runningUp: boolean; aimTime(): number; kickIn(): number };
  type PenHook = { runner: null | { game: { game: PK } } };
  const state = () =>
    page.evaluate(() => {
      const g = (window as unknown as { __famiduel: PenHook }).__famiduel.runner!.game.game;
      return { shooter: g.shooter, phase: g.phase, phaseT: g.phaseT, t: g.t, flightT: g.flightT, kickT: g.kickT, picks: g.picks, picked: g.picked !== null, runningUp: g.runningUp, aim: g.aimTime(), kickIn: g.kickIn() };
    });
  const seen = () => page.evaluate(() => [...(window as unknown as { __contrast: { seen: Map<string, unknown> } }).__contrast.seen.keys()]);
  // Wait for the person's kick (the bot may shoot first), early in its pick clock.
  await expect
    .poll(async () => { const s = await state(); return s.shooter === 0 && s.phase === 'aim' && s.phaseT < 1.2; }, { timeout: 12000, intervals: [50] })
    .toBe(true);
  const words0 = await seen();
  expect(words0, 'the shooter is told to pick').toContain('Swipe to pick your shot!');
  expect(words0.some((w) => /^Kick in \d$/.test(w)), 'the keeper reads when the kick comes').toBe(true);
  await page.screenshot({ path: path.join(OUT, 'penalty-pick-clock.png') });
  // A quick swipe toward the goal, up and to the right.
  const box = await worldBox(page);
  const at = (wx: number, wy: number) => ({ x: box.x + (wx / 360) * box.width, y: box.y + (wy / 640) * box.height });
  const finger = (type: string, p: { x: number; y: number }) =>
    page.evaluate(([t, x, y]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(61, t, x, y), [type, p.x, p.y] as const);
  // Frame by frame, like a finger: the game samples the swipe each frame.
  await finger('pointerdown', at(180, 520)); // above the dive buttons
  for (let i = 1; i <= 4; i++) {
    await page.waitForTimeout(20);
    await finger('pointermove', at(180 + 9 * i, 520 - 40 * i));
  }
  await page.waitForTimeout(20);
  await finger('pointerup', at(216, 360));
  await expect.poll(async () => (await state()).picks, { timeout: 1000, intervals: [20], message: 'the swipe picked a shot' }).toBe(1);
  const picked = await state();
  expect(picked.phase, 'the ball is not kicked on the swipe').toBe('aim');
  const aimStart = picked.t - picked.phaseT;
  await expect.poll(async () => (await seen()).includes('Shot picked! Swipe again to change'), { timeout: 2000 }).toBe(true);
  await page.screenshot({ path: path.join(OUT, 'penalty-shot-picked.png') });
  // The run-up comes, gold, before the strike.
  await expect.poll(async () => (await state()).runningUp, { timeout: 5000, intervals: [30] }).toBe(true);
  await page.screenshot({ path: path.join(OUT, 'penalty-run-up.png') });
  await expect.poll(async () => (await seen()).includes('Here it comes!'), { timeout: 1000 }).toBe(true);
  // Struck when the clock hit zero, not when the swipe ended.
  await expect.poll(async () => (await state()).phase, { timeout: 3000, intervals: [30] }).not.toBe('aim');
  const after = await state();
  expect(Math.abs(after.kickT - aimStart - after.aim), 'kick lands on zero').toBeLessThan(0.05);
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
  const tap = (x: number, y: number) => tapWorld(page, 77, x, y);
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

// The waiting seat's pill in the board games says who is thinking while the bot moves
// ("🤖 Bot is thinking…"), "Waiting…" between two people, and never the old grey
// "<name>'s turn" line Four in a Row used to show.
const boardPersons: [string, Person][] = [['checkers', checkersPerson], ['fourinarow', fourInARowPerson], ['tictactoe', ticTacToePerson]];
for (const [id, person] of boardPersons) {
  test(`${id}: the waiting player sees who is thinking`, async ({ page }) => {
    const errors: string[] = [];
    await page.setViewportSize({ width: 320, height: 568 });
    await boot(page, errors);
    await page.evaluate(() => ((window as unknown as { __contrast: { on: boolean } }).__contrast.on = true));
    await setPlayers(page, [null, 'normal']);
    await openFromHome(page, id);
    await introAsPeople(page, [0]);
    await page.waitForTimeout(2200); // countdown
    const botLine = '🤖 Bot is thinking…';
    const seen = () =>
      page.evaluate(() => [...(window as unknown as { __contrast: { seen: Map<string, unknown> } }).__contrast.seen.keys()]);
    // Play the person's moves for a while; catch the bot's think on camera once.
    let shot = false;
    const watch = async () => {
      for (let i = 0; i < 80 && !shot; i++) {
        if ((await seen()).includes(botLine)) {
          await page.screenshot({ path: path.join(OUT, `${id}-bot-thinking.png`) });
          shot = true;
        } else await page.waitForTimeout(100);
      }
    };
    const [played] = await Promise.all([person(page, 9000, 7), watch()]);
    expect(played.moves[0], 'the person moved').toBeGreaterThan(0);
    const words = await seen();
    expect(words, "the person's pill names the thinking bot").toContain(botLine);
    expect(words.filter((w) => w.endsWith("'s turn")), "no grey \"<name>'s turn\" line").toEqual([]);
    expect(shot).toBe(true);
    expect(errors).toEqual([]);
  });
}

// Minigolf is a turn game too: while the bot lines up its shot, the person's strip says so
// with the same line as the board games ("🤖 Bot is thinking…").
test('minigolf: the waiting player sees the bot lining up', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  await page.evaluate(() => ((window as unknown as { __contrast: { on: boolean } }).__contrast.on = true));
  await setPlayers(page, [null, 'normal']);
  await openFromHome(page, 'minigolf');
  await introAsPeople(page, [0]);
  await page.waitForTimeout(2200); // countdown
  const botLine = '🤖 Bot is thinking…';
  type GolfHook = { runner: null | { game: { game: { phase: string; shooter: number } } } };
  const botAiming = () =>
    page.evaluate(() => {
      const g = (window as unknown as { __famiduel: GolfHook }).__famiduel.runner!.game.game;
      return g.phase === 'aim' && g.shooter === 1;
    });
  const seen = () =>
    page.evaluate(() => [...(window as unknown as { __contrast: { seen: Map<string, unknown> } }).__contrast.seen.keys()]);
  // The person takes their shots (the monkey drags in the bottom half); catch the bot's turn once.
  let shot = false;
  const watch = async () => {
    for (let i = 0; i < 120 && !shot; i++) {
      if ((await botAiming()) && (await seen()).includes(botLine)) {
        await page.screenshot({ path: path.join(OUT, 'minigolf-bot-thinking.png') });
        shot = true;
      } else await page.waitForTimeout(100);
    }
  };
  await Promise.all([monkey(page, 0, 12000, 7), watch()]);
  expect(await seen(), "the person's strip names the bot lining up").toContain(botLine);
  expect(shot).toBe(true);
  expect(errors).toEqual([]);
});

// Hidden games (content/games.json) have no home card; their own checks above still run.
for (const g of games.games.filter((x) => !x.hidden)) {
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
    // ...and that edge isn't so dark the bars read as black bands (~25). Sea Battle,
    // Snake and Rock Paper Scissors draw a seat-colour edge for this (seatEdges()).
    const peak = await barPeak(page);
    expect(Math.min(peak.top, peak.bottom), `letterbox bars aren't black bands (top ${peak.top}, bottom ${peak.bottom})`).toBeGreaterThan(40);
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
    // Let the opening card (Minigolf's hole card) finish fading in before jumping ahead, so
    // its words are judged at rest instead of only from the first faint frames.
    await settleFades(page);
    await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(900));
    row.finished = await page.locator('#result').isVisible();
    if (row.finished) await shot('result');
    expect(row.finished, 'bot vs bot reaches the result screen').toBe(true);
    // Every word drawn on the canvas during all three matches, at a readable size.
    const tiny = await page.evaluate(() => [...(window as unknown as { __smallText: Map<string, number> }).__smallText]);
    expect(tiny.map(([str, size]) => `"${str}" at ${size}`), 'canvas text below the minimum size').toEqual([]);
    // Every label drawn while playing, against the pixels behind it (WCAG 1.4.3).
    const seen = await page.evaluate(() => [...(window as unknown as { __contrast: { seen: Map<string, { best: number; need: number; size: number; rest: boolean }> } }).__contrast.seen]);
    const faint = (c: { best: number; need: number }) => c.best < c.need;
    row.faint = seen.filter(([, c]) => c.rest && faint(c)).map(([str, c]) => `"${str}" ${c.best.toFixed(1)}:1 (needs ${c.need}:1 at ${c.size})`);
    // A label the match ended on mid-fade (never seen fully shown) is reported, not failed.
    for (const [str] of seen.filter(([, c]) => !c.rest && faint(c))) row.warnings.push(`"${str}" was only seen fading in, contrast not judged`);
    expect(row.faint, 'canvas labels below WCAG contrast against what is behind them').toEqual([]);
    expect(errors).toEqual([]);
  });
}

// The contrast pass above plays Blue vs Pink. Mint and Orange are the lightest seat
// colours, so a label drawn in a player's colour (or on it) is at its worst with them:
// play every shown game once more with Mint at the bottom and Orange on top.
test('contrast: Mint vs Orange, the lightest seats, in every shown game', async ({ page }) => {
  test.setTimeout(330_000);
  const errors: string[] = [];
  await boot(page, errors);
  const mint = PLAYER_COLORS.find((c) => c.name === 'Mint')!.hex;
  const orange = PLAYER_COLORS.find((c) => c.name === 'Orange')!.hex;
  const purple = PLAYER_COLORS.find((c) => c.name === 'Purple')!.hex;
  const problems: string[] = [];
  const shown = games.games.filter((x) => !x.hidden && (built.length === 0 || built.includes(x.id)));
  // Then Purple (the darkest seat) vs Mint in the games that pop "they used …" in the
  // power user's colour, so those small pops are judged in Purple too.
  const runs = [
    ...shown.map((g) => ({ g, a: mint, b: orange, tag: 'mint-orange' })),
    ...shown.filter((g) => ['snake', 'tanks', 'quickdraw', 'minigolf'].includes(g.id)).map((g) => ({ g, a: purple, b: mint, tag: 'purple-mint' })),
  ];
  for (const { g, a: seatA, b: seatB, tag } of runs) {
    await page.evaluate(([a, b]) => {
      const app = (window as unknown as { __famiduel: Hook & { store: { data: { profiles: { color: string }[] } } } }).__famiduel;
      app.store.data.profiles[0].color = a;
      app.store.data.profiles[1].color = b;
    }, [seatA, seatB]);
    await setPlayers(page, [null, null]);
    const colors = await page.evaluate(() =>
      (window as unknown as { __famiduel: { store: { data: { profiles: { color: string }[] } } } }).__famiduel.store.data.profiles.map((p) => p.color),
    );
    expect(colors, `the seats keep their colours (${tag})`).toEqual([seatA, seatB]);
    await page.evaluate(() => {
      const c = (window as unknown as { __contrast: { on: boolean; seen: Map<string, unknown> } }).__contrast;
      c.seen.clear();
      c.on = true;
    });
    await page.locator(`.game-card[data-id="${g.id}"]`).tap();
    await introAsPeople(page, [0, 1]);
    await page.waitForTimeout(2200); // countdown
    const person = PEOPLE[g.id];
    if (person) await person(page, 5000, 4);
    else await Promise.all([monkey(page, 0, 5000, 4), monkey(page, 1, 5000, 5)]);
    if (g.id === 'snake' || g.id === 'tanks') await page.screenshot({ path: path.join(OUT, `${g.id}-${tag}.png`) });
    // Then bots in the same seats to the result, so end-of-round labels are seen too.
    await leaveMatch(page);
    await setPlayers(page, ['normal', 'hard']);
    await page.evaluate((id) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(id), g.id);
    await expect(page.locator('#play')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(900));
    const seen = await page.evaluate(() => [...(window as unknown as { __contrast: { seen: Map<string, { best: number; need: number; size: number; rest: boolean }> } }).__contrast.seen]);
    for (const [str, c] of seen) if (c.rest && c.best < c.need) problems.push(`${g.id} (${tag}): "${str}" ${c.best.toFixed(1)}:1 (needs ${c.need}:1 at ${c.size})`);
    if (await page.locator('#result').isVisible()) await page.click('#homeBtn');
    else await leaveMatch(page);
  }
  expect(problems, 'labels below WCAG contrast with Mint vs Orange (and Purple vs Mint) seats').toEqual([]);
  expect(errors).toEqual([]);
});

// Bigger text (settings): every shown game is played with it on, by people on a small phone
// and then bot vs bot to the result on a tall one, with screenshots of both. Fails on any
// word that runs past the world's left or right edge; the screenshots are for the eye
// (strips, buttons, banners). The canvas contrast probe judges every word too.
test('bigger text: every shown game keeps its words on screen, small and tall phone', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, errors);
  await page.click('#settingsBtn');
  await page.locator('input[data-k="bigText"]').check();
  await page.click('#settingsBack');
  const on = await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.store.data.settings.bigText);
  expect(on, 'the Bigger text switch is saved').toBe(true);
  const problems: string[] = [];
  const dim: string[] = [];
  for (const g of games.games.filter((x) => !x.hidden && (built.length === 0 || built.includes(x.id)))) {
    await page.setViewportSize({ width: 320, height: 568 });
    await setPlayers(page, [null, null]);
    await page.evaluate(() => {
      const e = (window as unknown as { __edges: { on: boolean; over: Map<string, number> } }).__edges;
      e.over.clear();
      e.on = true;
      // Bigger words sit on different pixels (and their outlines change width), so the
      // canvas contrast probe judges every word again with the switch on.
      const c = (window as unknown as { __contrast: { on: boolean; seen: Map<string, unknown> } }).__contrast;
      c.seen.clear();
      c.on = true;
    });
    await page.locator(`.game-card[data-id="${g.id}"]`).tap();
    await introAsPeople(page, [0, 1]);
    await page.waitForTimeout(2200); // countdown
    const person = PEOPLE[g.id];
    if (person) await person(page, 3000, 4);
    else await Promise.all([monkey(page, 0, 3000, 4), monkey(page, 1, 3000, 5)]);
    await page.screenshot({ path: path.join(OUT, `bigtext-${g.id}-320.png`) });
    await leaveMatch(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await setPlayers(page, ['normal', 'hard']);
    await page.evaluate((id) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(id), g.id);
    await expect(page.locator('#play')).toBeVisible();
    await page.waitForTimeout(2600);
    await page.screenshot({ path: path.join(OUT, `bigtext-${g.id}-390.png`) });
    await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(900));
    const over = await page.evaluate(() => [...(window as unknown as { __edges: { over: Map<string, number> } }).__edges.over]);
    for (const [str, by] of over) problems.push(`${g.id}: "${str}" runs ${by.toFixed(0)} units off the screen`);
    await settleFades(page);
    const seen = await page.evaluate(() => [...(window as unknown as { __contrast: { seen: Map<string, { best: number; need: number; size: number; rest: boolean }> } }).__contrast.seen]);
    expect(seen.length, `${g.id}: the contrast probe saw words with Bigger text on`).toBeGreaterThan(0);
    for (const [str, c] of seen) if (c.rest && c.best < c.need) dim.push(`${g.id}: "${str}" ${c.best.toFixed(1)}:1 (needs ${c.need}:1 at ${c.size})`);
    if (await page.locator('#result').isVisible()) await page.click('#homeBtn');
    else await leaveMatch(page);
  }
  await page.evaluate(() => {
    (window as unknown as { __edges: { on: boolean } }).__edges.on = false;
    (window as unknown as { __contrast: { on: boolean } }).__contrast.on = false;
  });
  expect(problems, 'words off the screen with Bigger text on').toEqual([]);
  expect(dim, 'labels below WCAG contrast with Bigger text on').toEqual([]);
  expect(errors).toEqual([]);
});

// F79: with the phone's "reduce motion" on, the power pictures hold one frame and the
// ghost finger stands still; turning it off sets them moving again.
test('reduced motion: power pictures and the ghost finger hold still', async ({ page }) => {
  const errors: string[] = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, errors);
  await page.setViewportSize({ width: 390, height: 844 });
  await setPlayers(page, [null, null]);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('sumo'));
  await expect(page.locator('#intro')).toBeVisible();
  await page.locator('.power-card[data-p="0"]').first().tap();
  const pic = page.locator('.power-card[data-p="0"].on .power-pic');
  await expect(pic).toBeVisible();
  const state = () =>
    pic.evaluate((svg) => ({ paused: (svg as SVGSVGElement).animationsPaused(), t: (svg as SVGSVGElement).getCurrentTime() }));
  const a = await state();
  expect(a.paused).toBe(true);
  expect(a.t).toBeCloseTo(1, 1);
  const shot1 = await pic.screenshot();
  await page.waitForTimeout(700);
  expect((await pic.screenshot()).equals(shot1), 'the picture did not move').toBe(true);
  // The intro's ghost finger (shown for a game's first matches) has no animation.
  const finger = page.locator('.half.p0 .demo .f');
  if (await finger.count()) expect(await finger.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await page.screenshot({ path: path.join(OUT, 'reduced-motion-intro.png') });
  // The phone's setting turned off mid-session: the picture loops again.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => (await state()).paused).toBe(false);
  expect(errors).toEqual([]);
});

// F80: Settings > Look > Little hands makes the intro's Ready, power cards and bot level
// buttons at least 56 px tall (ages 4-6 guidance asks 56-64 px); every intro still fits.
test('little hands: big intro buttons, and every intro still fits', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  await boot(page, errors);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#settingsBtn');
  await page.locator('input[data-k="bigButtons"]').check();
  expect(await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.store.data.settings.bigButtons)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.dataset.bighands)).toBe('1');
  await page.click('#settingsBack');
  const setBig = (on: boolean) =>
    page.evaluate((v) => {
      const app = (window as unknown as { __famiduel: Hook & { applyBigText(): void } }).__famiduel;
      app.store.data.settings.bigText = v;
      app.applyBigText();
    }, on);
  const problems: string[] = [];
  for (const players of [[null, null], [null, 'easy']] as const) {
    await setPlayers(page, [...players]);
    for (const big of [false, true]) {
      await setBig(big);
      for (const [w, h] of [[320, 568], [360, 640], [390, 844]]) {
        await page.setViewportSize({ width: w, height: h });
        for (const id of built) {
          const r = await page.evaluate((g) => {
            const app = (window as unknown as { __famiduel: Hook }).__famiduel;
            app.openGame(g);
            // Pick the first power in each person's half: the picked layout is the tallest.
            for (const c of document.querySelectorAll<HTMLElement>('.half:not(.bot) .power-card:first-child')) c.click();
            const small = [...document.querySelectorAll<HTMLElement>('#intro .btn.ready, #intro .power-card, #intro .botlvl button')]
              .map((b) => Math.round(b.getBoundingClientRect().height))
              .filter((hgt) => hgt < 56);
            const over = [...document.querySelectorAll('#intro .half')].some(
              (hf) => (hf.querySelector('.half-inner') as HTMLElement).getBoundingClientRect().height > (hf as HTMLElement).getBoundingClientRect().height + 1,
            );
            return { small, over };
          }, id);
          const tag = `${id} at ${w}x${h}${big ? ' (bigger text)' : ''}${players[1] ? ' vs bot' : ''}`;
          if (r.small.length) problems.push(`${tag}: buttons ${r.small.join(', ')} px`);
          if (r.over) {
            problems.push(`${tag}: intro spills out of its half`);
            await page.screenshot({ path: path.join(OUT, `bighands-clipped-${id}-${w}x${h}${big ? '-big' : ''}.png`) });
          }
          if (id === 'sumo' && w !== 360) await page.screenshot({ path: path.join(OUT, `bighands-sumo-${w}${big ? '-big' : ''}${players[1] ? '-bot' : ''}.png`) });
        }
      }
    }
  }
  await setBig(false);
  await page.evaluate(() => {
    const app = (window as unknown as { __famiduel: Hook & { applyBigText(): void } }).__famiduel;
    app.store.data.settings.bigButtons = false;
    app.applyBigText();
  });
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});

// Short phones and Bigger text have no room for power descriptions inside the narrow cards:
// the Ready button tells a person who hasn't picked that a tap shows what a power does, and
// the picked power's description takes the how-to's place, so the half never grows. Every
// shown game's intro must still fit with each power picked, on small and tall phones.
test('intro: a picked power says what it does and the intro still fits, every game and size', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  await boot(page, errors);
  const setBig = (on: boolean) =>
    page.evaluate((v) => {
      const app = (window as unknown as { __famiduel: Hook & { applyBigText(): void } }).__famiduel;
      app.store.data.settings.bigText = v;
      app.applyBigText();
    }, on);
  await page.setViewportSize({ width: 390, height: 844 });
  await setBig(true);
  await setPlayers(page, [null, 'normal']);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('sumo'));
  await expect(page.locator('#intro')).toBeVisible();
  await expect(page.locator('#ready0')).toHaveText('Tap a power to see it');
  await expect(page.locator('.power-card[data-p="0"] small').first()).toBeHidden();
  await expect(page.locator('.half.p0 .howto')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'bigtext-intro-hint-390.png') });
  const cards = page.locator('.power-card[data-p="0"]');
  await cards.nth(1).tap();
  await expect(page.locator('#ready0')).toHaveText('Ready!');
  const desc = page.locator('.half.p0 .pick-desc');
  await expect(desc).toBeVisible();
  await expect(page.locator('.half.p0 .howto')).toBeHidden();
  const name1 = (await cards.nth(1).locator('b').textContent())!;
  await expect(desc).toContainText(name1);
  // Changing your mind shows the other power's description instead.
  await cards.nth(2).tap();
  await expect(desc).toContainText((await cards.nth(2).locator('b').textContent())!);
  await expect(desc).not.toContainText(name1);
  // Sumo is a free game: the picked power's looping picture sits beside its words.
  await expect(desc.locator('.power-pic')).toBeVisible();
  await expect(page.locator('.power-card[data-p="0"].on .power-pic')).toBeHidden();
  await page.screenshot({ path: path.join(OUT, 'bigtext-intro-picked-390.png') });
  // On a tall phone without Bigger text every card shows its description, as before.
  await setBig(false);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('sumo'));
  await expect(page.locator('#ready0')).toHaveText('Pick a power');
  await expect(page.locator('.power-card[data-p="0"] small').first()).toBeVisible();
  await page.locator('.power-card[data-p="0"]').first().tap();
  // ...and the picked card shows the power's looping picture in its icon's place.
  await expect(page.locator('.half.p0 .pick-desc')).toBeHidden();
  await expect(page.locator('.power-card[data-p="0"].on .power-pic')).toBeVisible();
  await expect(page.locator('.power-card[data-p="0"].on .picon')).toBeHidden();
  await expect(page.locator('.power-card[data-p="0"]:not(.on) .power-pic').first()).toBeHidden();
  await expect(page.locator('.half.p0 .howto')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'intro-picked-pic-390.png') });
  // Every game, two people, each power picked in turn: nothing spills out of a half.
  await setPlayers(page, [null, null]);
  const clipped: string[] = [];
  for (const big of [false, true]) {
    await setBig(big);
    for (const [w, h] of [[320, 568], [360, 640], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const id of built) {
        const over = await page.evaluate(async (g) => {
          const app = (window as unknown as { __famiduel: Hook }).__famiduel;
          app.openGame(g);
          let worst = -Infinity;
          for (const card of document.querySelectorAll<HTMLElement>('#intro .power-card')) {
            card.click();
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            for (const half of document.querySelectorAll<HTMLElement>('#intro .half')) {
              worst = Math.max(worst, (half.querySelector('.half-inner') as HTMLElement).getBoundingClientRect().height - half.getBoundingClientRect().height);
            }
          }
          app.showHome();
          return worst;
        }, id);
        if (over > 1) clipped.push(`${id} at ${w}x${h}${big ? ' (bigger text)' : ''}: ${Math.round(over)}px`);
      }
    }
  }
  await setBig(false);
  expect(clipped, 'intro cut off once a power is picked').toEqual([]);
  expect(errors).toEqual([]);
});

// Menus are DOM, so the canvas probe never sees them: judge the intro (with a person and
// with a bot, before and after Ready), the pause sheet and the result screen against the
// pixels behind each text run, once with the usual seats and once with Mint vs Orange
// (the lightest seat colours, which tint the halves and colour the Ready buttons).
test('contrast: intro, pause and result text (DOM) in the usual and the lightest seats', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await boot(page, errors);
  const pairs: [string, string][] = [
    [PLAYER_COLORS[0].hex, PLAYER_COLORS[1].hex],
    [PLAYER_COLORS.find((c) => c.name === 'Mint')!.hex, PLAYER_COLORS.find((c) => c.name === 'Orange')!.hex],
  ];
  const id = built.includes('sumo') || built.length === 0 ? 'sumo' : built[0];
  const problems: string[] = [];
  let checked = 0;
  const judge = async (where: string, root: string) => {
    const labels = await domContrast(page, root);
    checked += labels.length;
    problems.push(...faintLabels(where, labels));
  };
  for (const [a, b] of pairs) {
    const tag = PLAYER_COLORS.find((c) => c.hex === a)!.name;
    await page.evaluate(([x, y]) => {
      const app = (window as unknown as { __famiduel: Hook & { store: { data: { profiles: { color: string }[] } } } }).__famiduel;
      app.store.data.profiles[0].color = x;
      app.store.data.profiles[1].color = y;
    }, [a, b]);
    await setPlayers(page, [null, null]);
    await page.locator(`.game-card[data-id="${id}"]`).tap();
    await expect(page.locator('#intro')).toBeVisible();
    await page.waitForTimeout(400);
    await judge(`${tag} intro`, '#intro');
    for (const p of [0, 1]) if (await page.locator(`.power-card[data-p="${p}"]`).count()) await page.locator(`.power-card[data-p="${p}"]`).nth(p).tap();
    await page.locator('#ready0').tap();
    await judge(`${tag} intro, powers picked, one ready`, '#intro');
    await page.screenshot({ path: path.join(OUT, `intro-${tag.toLowerCase()}-ready.png`) });
    await page.locator('#ready1').tap();
    await expect(page.locator('#play')).toBeVisible();
    await page.waitForTimeout(2400);
    await holdPause(page);
    await judge(`${tag} pause`, 'body');
    await page.click('#quitBtn');
    await setPlayers(page, [null, 'easy']);
    await page.locator(`.game-card[data-id="${id}"]`).tap();
    await expect(page.locator('#intro')).toBeVisible();
    await page.waitForTimeout(400);
    await judge(`${tag} intro vs bot`, '#intro');
    await page.locator('#introBack').tap();
    await setPlayers(page, ['normal', 'hard']);
    await page.evaluate((g) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(g), id);
    await expect(page.locator('#play')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(900));
    await expect(page.locator('#result')).toBeVisible();
    // Judge the buttons once they're awake (the result ignores taps for a moment first).
    await expect(page.locator('#result.settling')).toHaveCount(0);
    await page.waitForTimeout(400);
    await judge(`${tag} result`, '#result');
    await page.screenshot({ path: path.join(OUT, `result-${tag.toLowerCase()}.png`) });
    await page.click('#homeBtn');
  }
  expect(checked, 'text runs judged').toBeGreaterThan(20);
  expect(problems, 'menu text below WCAG contrast against what is behind it').toEqual([]);
  expect(errors).toEqual([]);
});

// Home and settings follow the phone's light or dark look (settings.theme), so judge their
// DOM text in both: the whole home page (scrolled through, so every game card is seen) and
// the settings screen, against the pixels behind each run.
test('contrast: home and settings text (DOM) in light and dark theme', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  await boot(page, errors);
  const problems: string[] = [];
  let checked = 0;
  const judge = async (where: string, root: string) => {
    const labels = await domContrast(page, root);
    checked += labels.length;
    problems.push(...faintLabels(where, labels));
  };
  for (const theme of ['light', 'dark'] as const) {
    await page.locator('#settingsBtn').tap();
    await expect(page.locator('#settings')).toBeVisible();
    await page.locator(`#themeSeg button[data-v="${theme}"]`).tap();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForTimeout(300);
    await judge(`${theme} settings`, '#settings');
    await page.screenshot({ path: path.join(OUT, `settings-${theme}.png`) });
    await page.locator('#settingsBack').tap();
    await expect(page.locator('#home')).toBeVisible();
    await page.waitForTimeout(1900); // the neon "Duel" flickers on once (1.75 s); judge it lit
    // Judge each screenful of home, top to bottom.
    // #home is the scroller (a full-screen panel), not the document.
    const pages = await page.evaluate(() => Math.ceil(document.querySelector('#home')!.scrollHeight / innerHeight));
    expect(pages, 'home is taller than one screen (so scrolling is checked)').toBeGreaterThan(1);
    for (let i = 0; i <= pages; i++) {
      await page.evaluate((k) => document.querySelector('#home')!.scrollTo(0, k * innerHeight * 0.8), i);
      await page.waitForTimeout(150);
      await judge(`${theme} home (screen ${i + 1})`, '#home');
    }
    await page.evaluate(() => document.querySelector('#home')!.scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT, `home-${theme}.png`) });
  }
  expect(checked, 'text runs judged').toBeGreaterThan(20);
  expect(problems, 'home and settings text below WCAG contrast').toEqual([]);
  expect(errors).toEqual([]);
});

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

// Grown-ups corner (Settings): behind a parental gate (a times-table question in words), a
// tip on Guided Access / App pinning. A wrong answer keeps it shut and asks a new question.
test('grown-ups corner: a parental gate in words, then the keep-them-in-the-app tip', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  await page.click('#settingsBtn');
  await page.locator('#grownUps').scrollIntoViewIfNeeded();
  await page.locator('#grownUps').tap();
  const q = page.locator('#gateQ');
  await expect(q).toBeVisible();
  const first = (await q.textContent())!;
  expect(first, 'the question has no digits to copy').not.toMatch(/\d/);
  await page.screenshot({ path: path.join(OUT, 'grownups-gate-320.png') });
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const answer = (t: string) => {
    const m = /What is (\w+) times (\w+)\?/.exec(t)!;
    return WORDS.indexOf(m[1]) * WORDS.indexOf(m[2]);
  };
  await page.fill('#gateIn', String(answer(first) + 1));
  await page.locator('#gateOk').tap();
  await expect(page.locator('#gateMsg')).toHaveText(/Not quite/);
  await expect(q).not.toHaveText(first);
  await expect(page.locator('.grownups')).toHaveCount(0);
  await page.fill('#gateIn', String(answer((await q.textContent())!)));
  await page.locator('#gateOk').tap();
  await expect(page.locator('.grownups')).toBeVisible();
  await expect(page.locator('.grownups')).toContainText('Guided Access');
  await expect(page.locator('.grownups')).toContainText('App pinning');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'tips fit a small phone').toBe(false);
  await page.screenshot({ path: path.join(OUT, 'grownups-tips-320.png') });
  await page.locator('#guDone').scrollIntoViewIfNeeded();
  await page.locator('#guDone').tap();
  await expect(page.locator('#modal')).toBeHidden();
  // Cancel closes the gate without opening anything.
  await page.locator('#grownUps').tap();
  await page.locator('#gateCancel').tap();
  await expect(page.locator('#modal')).toBeHidden();
  await page.click('#settingsBack');
  expect(errors).toEqual([]);
});

// F94: Minigolf's "📅 Today" switch on the intro plays today's course (the same 3 holes on
// every phone today, whatever the match seed); the strip fits a small phone, also with
// Bigger text, and a person's total shows as the day's best on the result.
test("minigolf: today's course plays the same holes, fits, and keeps the day's best", async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  type Golf = { __famiduel: Hook & { applyBigText(): void; runner: { game: { game: { holes: { id: string }[] } } } } };
  const holes = () => page.evaluate(() => (window as unknown as Golf).__famiduel.runner.game.game.holes.map((h) => h.id).join(','));
  const midFits = () =>
    page.evaluate(() => {
      const mid = document.querySelector<HTMLElement>('#intro .intro-mid')!;
      const out: string[] = [];
      if (mid.scrollWidth > mid.clientWidth + 1) out.push(`strip ${mid.scrollWidth} > ${mid.clientWidth}`);
      for (const el of mid.children) {
        const r = el.getBoundingClientRect();
        if (r.left < -0.5 || r.right > window.innerWidth + 0.5) out.push(`${el.id || el.className} off screen`);
      }
      return out;
    });
  // F96: before anyone plays today's course, home's Minigolf card wears a 📅 (no other card does).
  await expect(page.locator('.game-card[data-id="minigolf"] .gday')).toHaveCount(1);
  await expect(page.locator('.gday')).toHaveCount(1);
  await page.locator('.game-card[data-id="minigolf"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'minigolf-daily-home-badge.png') });
  for (const big of [false, true]) {
    await page.evaluate((on) => {
      const app = (window as unknown as Golf).__famiduel;
      app.store.data.settings.bigText = on;
      app.applyBigText();
    }, big);
    await setPlayers(page, [null, null]);
    await openFromHome(page, 'minigolf');
    const btn = page.locator('#dailyBtn');
    await expect(btn).toBeVisible();
    if (!big) {
      await expect(btn).toHaveText('📅 Today');
      expect(await midFits(), 'strip before the switch').toEqual([]);
      await btn.tap();
    }
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(btn).toHaveText('📅 Today ✓');
    await expect(page.locator('#introBlurb')).toContainText('📅 Today');
    expect(await midFits(), `strip with today's course${big ? ' (Bigger text)' : ''}`).toEqual([]);
    await page.screenshot({ path: path.join(OUT, `minigolf-daily-intro${big ? '-bigtext' : ''}.png`) });
    // F98: the opening hole card says it's today's course (drawn for each seat).
    await page.evaluate(() => {
      const c = (window as unknown as { __contrast: { on: boolean; seen: Map<string, unknown> } }).__contrast;
      c.seen.clear();
      c.on = true;
    });
    await introAsPeople(page, [0, 1]);
    // Judged once the card has faded in after the countdown (it is drawn see-through before).
    await expect
      .poll(() =>
        page.evaluate(() => {
          const r = (window as unknown as { __famiduel: { runner: { countdown: number; game: { game: { phase: string; timer: number } } } } }).__famiduel.runner;
          return r.countdown <= 0 && r.game.game.phase === 'intro' && r.game.game.timer < 1.5;
        }),
        { message: 'the opening hole card is up' },
      )
      .toBe(true);
    await page.evaluate(() => (window as unknown as { __contrast: { seen: Map<string, unknown> } }).__contrast.seen.clear());
    await expect
      .poll(() => page.evaluate(() => [...(window as unknown as { __contrast: { seen: Map<string, unknown> } }).__contrast.seen.keys()].some((w) => /^📅 TODAY'S COURSE · HOLE 1 OF \d$/.test(w))), { message: "the hole card says today's course" })
      .toBe(true);
    if (!big) await page.screenshot({ path: path.join(OUT, 'minigolf-daily-holecard.png') });
    await page.evaluate(() => ((window as unknown as { __contrast: { on: boolean } }).__contrast.on = false));
    const a = await holes();
    await leaveMatch(page);
    await openFromHome(page, 'minigolf');
    await introAsPeople(page, [0, 1]);
    expect(await holes(), 'the same holes again today').toBe(a);
    await leaveMatch(page);
  }
  // Two bots play it to the end: a bot's total never counts as the day's best.
  await setPlayers(page, ['normal', 'normal']);
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('minigolf'));
  await expect(page.locator('#play')).toBeVisible();
  await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(900));
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#result .res-daily')).toHaveCount(0);
  await page.click('#homeBtn');
  // A person against the bot: an idle person never putts out, so the round's end is handed to
  // the shell as the game would (the same path a real finish takes); their 9 is today's best.
  await setPlayers(page, [null, 'normal']);
  await openFromHome(page, 'minigolf');
  await expect(page.locator('#dailyBtn')).toHaveAttribute('aria-pressed', 'true');
  await introAsPeople(page, [0]);
  await page.evaluate(() => {
    const runner = (window as unknown as { __famiduel: { runner: { result: unknown; fastForward(s: number): void } } }).__famiduel.runner;
    runner.result = { winner: 0, score: [9, 11], summary: '9 – 11 strokes' };
    runner.fastForward(3);
  });
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#result .half.p0 .res-daily')).toHaveText('📅 New best today: 9!');
  await expect(page.locator('#result .half.p1 .res-daily')).toContainText("Today's best: 9 by");
  await expect(page.locator('#result .half.p0 .res-daily')).toContainText('📅');
  await page.screenshot({ path: path.join(OUT, 'minigolf-daily-result.png') });
  // F96: home's Minigolf card wore a 📅 until today's course was played; now it's gone.
  await page.click('#homeBtn');
  await expect(page.locator('.game-card[data-id="minigolf"] .gday')).toHaveCount(0);
  // Back to random holes with the switch.
  await openFromHome(page, 'minigolf');
  await page.locator('#dailyBtn').tap();
  await expect(page.locator('#dailyBtn')).toHaveText('📅 Today');
  await expect(page.locator('#introBlurb')).not.toContainText('📅');
  expect(errors).toEqual([]);
});

test('tanks: a palm resting in the stick zone never takes the stick from the thumb that steers (F105)', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, errors);
  type H = Hook & { runner: { countdown: number; game: { stickVec: { x: number; y: number }[] } } | null };
  await setPlayers(page, [null, 'easy']);
  await page.locator('.game-card[data-id="tanks"]').tap();
  await introAsPeople(page, [0]);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.countdown), { timeout: 6000, message: 'the countdown ends' }).toBeLessThanOrEqual(0);
  await installFingers(page);
  const box = await worldBox(page);
  const at = (x: number, y: number) => ({ x: box.x + (x / 360) * box.width, y: box.y + (y / 640) * box.height });
  const finger = async (fid: number, t: string, x: number, y: number) => {
    const c = at(x, y);
    await page.evaluate(([i, tt, cx, cy]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(i, tt, cx, cy), [fid, t, c.x, c.y] as const);
  };
  const frames = (n: number) => page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r(null) : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const stick = () => page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.game.stickVec[0]);
  // 1. A palm rests in the stick zone first (strip edge, left), then the thumb lands on the stick and pushes up.
  await finger(400, 'pointerdown', 24, 630);
  await frames(20);
  await finger(401, 'pointerdown', 78, 584);
  for (let i = 1; i <= 8; i++) {
    await finger(401, 'pointermove', 78, 584 - i * 5);
    await frames(2);
  }
  let v = await stick();
  expect(v.y, 'the stick follows the thumb pushing up, not the palm that landed first').toBeLessThan(-0.8);
  // 2. The thumb holds still; the palm lifts and lands again: the thumb keeps the stick.
  await finger(400, 'pointerup', 24, 630);
  await finger(400, 'pointerdown', 130, 632);
  await frames(30);
  v = await stick();
  expect(v.y, 'a palm landing while the thumb holds still does not take the stick').toBeLessThan(-0.8);
  await page.screenshot({ path: path.join(OUT, 'palm-tanks.png') });
  await finger(401, 'pointerup', 78, 544);
  await finger(400, 'pointerup', 130, 632);
  expect(errors).toEqual([]);
});

for (const id of ['airhockey', 'pingpong'] as const) {
  test(`${id}: a palm resting in your half never takes the paddle from the finger that plays`, async ({ page }) => {
    const errors: string[] = [];
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, errors);
    type H = Hook & { runner: { fastForward(s: number): void; game: { game: { paddles: { x: number }[] } } } | null };
    await setPlayers(page, [null, 'easy']);
    await page.locator(`.game-card[data-id="${id}"]`).tap();
    await introAsPeople(page, [0]);
    await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.fastForward(4));
    await installFingers(page);
    const box = await worldBox(page);
    const at = (x: number, y: number) => ({ x: box.x + (x / 360) * box.width, y: box.y + (y / 640) * box.height });
    const finger = async (fid: number, t: string, x: number, y: number) => {
      const c = at(x, y);
      await page.evaluate(([i, tt, cx, cy]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(i, tt, cx, cy), [fid, t, c.x, c.y] as const);
    };
    const frames = (n: number) => page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r(null) : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
    const paddleX = () => page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.game.game.paddles[0].x);
    const drag = async (fx: number, toX: number, y: number) => {
      for (let i = 1; i <= 16; i++) {
        await finger(301, 'pointermove', fx + ((toX - fx) * i) / 16, y);
        await frames(2);
      }
      await frames(40); // let the paddle catch up
    };
    // 1. The palm rests first (bottom edge, left of centre), then the finger lands and drags right.
    await finger(300, 'pointerdown', 110, 626);
    await frames(30);
    await finger(301, 'pointerdown', 180, 540);
    await drag(180, 290, 540);
    const afterRight = await paddleX();
    expect(afterRight, 'the paddle followed the dragging finger, not the palm that landed first').toBeGreaterThan(240);
    // 2. Mid-rally the palm lifts and lands again on the other side; the finger drags left.
    await finger(300, 'pointerup', 110, 626);
    await finger(300, 'pointerdown', 300, 626);
    await drag(290, 80, 540);
    const afterLeft = await paddleX();
    expect(afterLeft, 'a palm landing mid-rally did not pull the paddle to it').toBeLessThan(130);
    await page.screenshot({ path: path.join(OUT, `palm-${id}.png`) });
    await finger(301, 'pointerup', 80, 540);
    await finger(300, 'pointerup', 300, 626);
    expect(errors).toEqual([]);
  });
}

// F113: before game 1 a family can swap lineup games they don't fancy (up to 3); the
// lineup still fits a small phone, with Bigger text too, and the 7 stay different.
test('tournament: games can be swapped out before game 1, on a small phone', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, errors);
  await setPlayers(page, [null, null]);
  await page.click('#tourneyBtn');
  await expect(page.locator('#tourney')).toBeVisible();
  const swaps = page.locator('#tourney .slot-swap');
  await expect(swaps).toHaveCount(7);
  await expect(page.locator('.tourney-swaps')).toContainText('3 swaps left');
  const names = () => page.locator('#tourney .slot .sname').allTextContents();
  const before = await names();
  await swaps.nth(2).tap();
  await expect(page.locator('.tourney-swaps')).toContainText('2 swaps left');
  const after = await names();
  expect(after[2], 'game 3 was swapped').not.toBe(before[2]);
  expect(new Set(after.slice(0, 7)).size, 'the 7 are still different').toBe(7);
  expect(after.filter((_n, i) => i !== 2 && i < 7)).toEqual(before.filter((_n, i) => i !== 2 && i < 7));
  for (const big of [false, true]) {
    await page.evaluate((on) => {
      const app = (window as unknown as { __famiduel: { store: { data: { settings: { bigText: boolean } } }; applyBigText(): void; showTournament(): void } }).__famiduel;
      app.store.data.settings.bigText = on;
      app.applyBigText();
      app.showTournament();
    }, big);
    const off = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#tourney .slot, #tourney .tourney-swaps, #tourneyPlay')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < -0.5 || r.right > window.innerWidth + 0.5 || el.scrollWidth > el.clientWidth + 1;
        })
        .map((el) => el.className || el.id),
    );
    expect(off, `lineup fits${big ? ' (Bigger text)' : ''}`).toEqual([]);
    await page.screenshot({ path: path.join(OUT, `tournament-swap${big ? '-bigtext' : ''}.png`), fullPage: true });
  }
  await swaps.nth(0).tap();
  await swaps.nth(0).tap();
  await expect(page.locator('.tourney-swaps')).toHaveCount(0);
  await expect(page.locator('#tourney .slot-swap')).toHaveCount(0);
  // Game 1 is whatever slot 1 now holds.
  const first = (await names())[0];
  await expect(page.locator('#tourneyPlay')).toContainText(first);
  expect(errors).toEqual([]);
});
