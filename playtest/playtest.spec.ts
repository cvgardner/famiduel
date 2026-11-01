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
  // The home grid follows content/games.json: action games first, slow turn games last.
  const shown = await page.locator('.game-card').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id));
  expect(shown, 'home grid order').toEqual(games.games.map((g) => g.id));
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
  expect(groups.map((g) => g.id), 'home groups').toEqual(['action', 'board', 'extra']);
  for (const g of groups) {
    expect(g.h, `${g.id} heading visible`).toBeGreaterThan(10);
    expect(g.gap, `${g.id} heading sits above its cards`).toBeGreaterThanOrEqual(0);
    expect(g.gap, `${g.id} heading sits right above its cards`).toBeLessThan(16);
  }
  expect(groups.reduce((n, g) => n + g.cards, 0)).toBe(games.games.length);
  await page.locator('.group[data-group="board"] .group-title').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'home-groups.png') });
  await page.evaluate(() => window.scrollTo(0, 0));
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
          fits: ir.height <= hr.height + 1 && ir.top >= hr.top - 1 && ir.bottom <= hr.bottom + 1,
        };
      }),
    );
    if (halves.length !== 2) problems.push(`${id}: ${halves.length} halves on how to play`);
    for (const [i, h] of halves.entries()) {
      if (!h.demo) problems.push(`${id} half ${i}: no ghost finger`);
      if (!h.howto) problems.push(`${id} half ${i}: no how-to line`);
      if (h.power !== hasPowers) problems.push(`${id} half ${i}: picked power ${h.power ? 'shown without powers' : 'missing'}`);
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
  await expect(page.locator('.player-chip[data-p="1"] .botlbl')).toContainText('easy');
  await expect(page.locator('.player-chip[data-p="1"] .pname')).toHaveText('Bot');
  await expect(page.locator('.night-score span')).toContainText('You vs the bot · 0 games');
  expect(await smallTargets(page, 'home solo')).toEqual([]);
  await page.screenshot({ path: path.join(OUT, 'solo-home.png') });
  // Every built game from its home card: the top seat is the Easy bot.
  let n = 0;
  for (const id of built) {
    await page.locator(`.game-card[data-id="${id}"]`).tap();
    await expect(page.locator('#intro .half.p1.bot'), `${id}: bot half on the intro`).toBeVisible();
    await expect(page.locator('#intro .half.p1 .who'), id).toHaveText('Bot 🤖');
    await introAsPeople(page, [0]);
    expect(await page.evaluate(() => (window as unknown as { __famiduel: H }).__famiduel.runner!.players.map((p) => p.bot)), id).toEqual([null, 'easy']);
    // The bot wins this one (ended by hand to keep the pass short).
    await page.evaluate(() => {
      (window as unknown as { __famiduel: H }).__famiduel.runner!.result = { winner: 1, score: [0, 1] };
    });
    await expect(page.locator('#result')).toBeVisible();
    n++;
    await expect(page.locator('#result .half.p1 .res-title'), id).toHaveText('Bot wins');
    await expect(page.locator('#result .half.p1 .who'), id).toHaveText('Bot 🏆');
    await expect(page.locator('#result .half.p0 .res-title'), id).toHaveText('So close!');
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
  const box = await worldBox(page);
  const tap = async (x: number, y: number) => {
    const c = { x: box.x + (x / 360) * box.width, y: box.y + (y / 640) * box.height };
    for (const t of ['pointerdown', 'pointerup']) {
      await page.evaluate(([tt, cx, cy]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(77, tt, cx, cy), [t, c.x, c.y] as const);
      await page.waitForTimeout(60);
    }
  };
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
  // A miss hands the turn to the bot.
  await fire((await look()).water!);
  await expect.poll(async () => (await look()).turn, { timeout: 3000 }).toBe(1);
  // The bot's turn ends with a miss too, and the next person turn starts plain.
  await myTurn();
  const back = await look();
  expect(back.again).toBe(0);
  expect(back.header).not.toContain('go again');
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
  const tap = async (x: number, y: number) => {
    const box = await worldBox(page);
    const c = { x: box.x + (x / 360) * box.width, y: box.y + (y / 640) * box.height };
    for (const t of ['pointerdown', 'pointerup']) {
      await page.evaluate(([tt, cx, cy]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(78, tt, cx, cy), [t, c.x, c.y] as const);
      await page.waitForTimeout(60);
    }
  };
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
  await page.locator('.game-card[data-id="tictactoe"]').tap();
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
  const box = await worldBox(page);
  const tap = async (cell: number) => {
    const c = { x: box.x + ((45 + (cell % 3) * 90 + 45) / 360) * box.width, y: box.y + ((185 + Math.floor(cell / 3) * 90 + 45) / 640) * box.height };
    for (const t of ['pointerdown', 'pointerup'])
      await page.evaluate(([tt, cx, cy]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(77, tt, cx, cy), [t, c.x, c.y] as const);
  };
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

test("checkers: a bot's double jump stays traced on the board until you move", async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await setPlayers(page, [null, 'normal']);
  await page.locator('.game-card[data-id="checkers"]').tap();
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
  const box = await worldBox(page);
  const tapSq = async (sqr: number) => {
    const x = box.x + ((40 + (sqr % 8) * 39 + 19.5) / 360) * box.width;
    const y = box.y + ((164 + Math.floor(sqr / 8) * 39 + 19.5) / 640) * box.height;
    for (const t of ['pointerdown', 'pointerup'])
      await page.evaluate(([tt, cx, cy]) => (window as unknown as { __finger: (...a: unknown[]) => void }).__finger(77, tt, cx, cy), [t, x, y] as const);
  };
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
    await page.locator(`.game-card[data-id="${id}"]`).tap();
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
    await page.locator(`.game-card[data-id="${id}"]`).tap();
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
    const seen = await page.evaluate(() => [...(window as unknown as { __contrast: { seen: Map<string, { best: number; need: number; size: number; rest: boolean }> } }).__contrast.seen]);
    const faint = (c: { best: number; need: number }) => c.best < c.need;
    row.faint = seen.filter(([, c]) => c.rest && faint(c)).map(([str, c]) => `"${str}" ${c.best.toFixed(1)}:1 (needs ${c.need}:1 at ${c.size})`);
    // A label the match ended on mid-fade (never seen fully shown) is reported, not failed.
    for (const [str] of seen.filter(([, c]) => !c.rest && faint(c))) row.warnings.push(`"${str}" was only seen fading in, contrast not judged`);
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
