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
import { installFingers, monkey } from './monkey';

const OUT = path.resolve('playtest-report');
const SECONDS = Number(process.env.PLAYTEST_SECONDS ?? 8);

type Row = { id: string; name: string; shots: string[]; fps: number; gestures: number; warnings: string[]; errors: string[]; finished: boolean };
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
  await page.setViewportSize({ width: 360, height: 640 });
  for (const id of built) {
    await page.evaluate((g) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(g), id);
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('#intro .half')].some((h) => {
        const inner = h.querySelector('.half-inner') as HTMLElement;
        return inner.getBoundingClientRect().height > (h as HTMLElement).getBoundingClientRect().height + 1;
      }),
    );
    if (bad) {
      clipped.push(id);
      await page.screenshot({ path: path.join(OUT, `${id}-intro-clipped.png`) });
    }
    await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showHome());
  }
  expect(clipped, 'intro content cut off on a 360x640 phone').toEqual([]);
  expect(errors).toEqual([]);
});

for (const g of games.games) {
  test(`play like a person: ${g.id}`, async ({ page }) => {
    test.skip(built.length > 0 && !built.includes(g.id), 'not built yet');
    const errors: string[] = [];
    const row: Row = { id: g.id, name: g.name, shots: [], fps: 0, gestures: 0, warnings: [], errors, finished: false };
    rows.push(row);
    await boot(page, errors);
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
    row.gestures += await monkey(page, 0, SECONDS * 1000, 1);
    row.fps = await fps(page);
    const b = await shot('vs-bot-later');
    if (a.equals(b)) row.warnings.push('screen did not change during play');
    if (row.fps < 40) row.warnings.push(`low frame rate: ${row.fps} fps`);

    // 2. Two people at once, both halves touched simultaneously.
    await page.click('#pauseBtn');
    await page.click('#quitBtn');
    await setPlayers(page, [null, null]);
    await page.locator(`.game-card[data-id="${g.id}"]`).tap();
    await introAsPeople(page, [0, 1]);
    await page.waitForTimeout(2200);
    const counts = await Promise.all([monkey(page, 0, SECONDS * 1000, 2), monkey(page, 1, SECONDS * 1000, 3)]);
    row.gestures += counts[0] + counts[1];
    await shot('two-people');

    // 3. The match must be finishable: hand both seats to bots and fast-forward.
    await page.click('#pauseBtn');
    await page.click('#quitBtn');
    await setPlayers(page, ['normal', 'hard']);
    await page.evaluate((id) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(id), g.id);
    await expect(page.locator('#play')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.runner!.fastForward(900));
    row.finished = await page.locator('#result').isVisible();
    if (row.finished) await shot('result');
    expect(row.finished, 'bot vs bot reaches the result screen').toBe(true);
    expect(errors).toEqual([]);
  });
}

test.afterAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(rows, null, 2));
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);
  const cards = rows
    .map(
      (r) => `<section><h2>${esc(r.name)} <small>${r.fps} fps · ${r.gestures} gestures · ${r.finished ? 'finished' : 'NOT finished'}</small></h2>
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
