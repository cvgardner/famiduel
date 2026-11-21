// App Store screenshots, taken from the real web build in a headless phone browser.
//
//   npm run store:shots            (builds first; needs `npx playwright install chromium` once)
//   npm run store:shots -- --plain (bare app screens as JPEGs, no captions)
//
// Order and captions come from docs/app-store/screenshots.json. Each screen is framed with
// its caption (scripts/storeframe.ts) and written as an RGB PNG (App Store Connect refuses
// PNGs with an alpha channel) to docs/app-store/screenshots/<size>/, one folder per display
// size App Store Connect asks for: upload each folder as it is, in file order. The bare
// screens go to docs/app-store/screenshots/raw/<size>/ for a look. Both are wiped first, so
// no old shot is left to upload by mistake. Sizes checked against Apple's "Screenshot specifications" page, Nov 2026:
//   - iPhone 6.9" (Dynamic Island, large)  1320 x 2868  (optional, but shown on the
//     biggest phones; it also covers the "Face ID large" slot)
//   - iPhone 6.3" (Dynamic Island, medium) 1206 x 2622  (required)
// The app ships iPhone-only (TARGETED_DEVICE_FAMILY = 1), so no iPad shots are required.
// Pass --ipad to also make 13" iPad shots (2064 x 2752) if you switch to universal.
import { chromium, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { frame, type Caption } from './storeframe';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'docs/app-store/screenshots');
const PORT = 4179;
const PLAIN = process.argv.includes('--plain');
const PLAN = JSON.parse(readFileSync(join(ROOT, 'docs/app-store/screenshots.json'), 'utf8')) as {
  shots: ({ scene: string } & Caption)[];
};
const URL = `http://localhost:${PORT}/?seed=STORE`;

type Size = { name: string; w: number; h: number; scale: number };
const SIZES: Size[] = [
  { name: 'iphone-6.9', w: 440, h: 956, scale: 3 }, // 1320 x 2868
  { name: 'iphone-6.3', w: 402, h: 874, scale: 3 }, // 1206 x 2622
];
if (process.argv.includes('--ipad')) SIZES.push({ name: 'ipad-13', w: 1032, h: 1376, scale: 2 }); // 2064 x 2752

type Hook = {
  store: { data: { profiles: { bot: string | null }[]; settings: { powers: boolean } }; save(): void };
  showHome(): void;
  showTournament(): void;
  openGame(id: string): void;
  startMatch(): void;
  runner: { fastForward(s: number): void } | null;
};

async function fresh(page: Page): Promise<void> {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.logo').waitFor();
  await page.evaluate(() => {
    const app = (window as unknown as { __famiduel: Hook }).__famiduel;
    app.store.data.settings.powers = true; // the pitch: classic games, with super powers
    app.store.save();
    app.showHome();
  });
  await page.waitForTimeout(300);
}

/** A match a few seconds in, both seats played by bots so things are moving. */
async function midMatch(page: Page, id: string, seconds: number): Promise<void> {
  await fresh(page);
  await page.evaluate(
    ([gameId, s]) => {
      const app = (window as unknown as { __famiduel: Hook }).__famiduel;
      app.store.data.profiles[0].bot = 'normal';
      app.store.data.profiles[1].bot = 'normal';
      app.store.save();
      app.openGame(gameId as string);
      app.startMatch();
      app.runner!.fastForward(s as number);
    },
    [id, seconds] as const,
  );
  await page.locator('#play').waitFor();
  await page.waitForTimeout(400); // a few drawn frames
}

/** A game's intro with this week's three super powers to pick from. */
async function powerPick(page: Page, id: string): Promise<void> {
  await fresh(page);
  await page.evaluate((gameId) => (window as unknown as { __famiduel: Hook }).__famiduel.openGame(gameId), id);
  await page.locator('#intro').waitFor();
  await page.waitForTimeout(400);
}

/**
 * Every scene screenshots.json can name. Seconds into a match are picked so both bots are
 * mid-rally or mid-shot; if a frame lands on a pause or a round card, change the number.
 */
const SCENES: Record<string, (p: Page) => Promise<void>> = {
  home: (p) => fresh(p),
  powers: (p) => powerPick(p, 'airhockey'),
  pingpong: (p) => midMatch(p, 'pingpong', 6),
  snake: (p) => midMatch(p, 'snake', 5),
  minipool: (p) => midMatch(p, 'minipool', 8),
  tugofwar: (p) => midMatch(p, 'tugofwar', 4),
  minigolf: (p) => midMatch(p, 'minigolf', 8),
  airhockey: (p) => midMatch(p, 'airhockey', 6),
  penalty: (p) => midMatch(p, 'penalty', 7),
  sumo: (p) => midMatch(p, 'sumo', 5),
  tournament: async (p) => {
    await fresh(p);
    await p.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showTournament());
    await p.waitForTimeout(400);
  },
};
for (const s of PLAN.shots) if (!SCENES[s.scene]) throw new Error(`screenshots.json names an unknown scene "${s.scene}"`);
if (PLAN.shots.length > 10) throw new Error('App Store Connect takes at most 10 screenshots per size');

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('vite preview did not start');
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
try {
  await waitForServer();
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  for (const s of SIZES) {
    const dir = join(OUT, s.name);
    const rawDir = join(OUT, 'raw', s.name);
    for (const d of [dir, rawDir]) {
      rmSync(d, { recursive: true, force: true });
      mkdirSync(d, { recursive: true });
    }
    const W = s.w * s.scale;
    const H = s.h * s.scale;
    const ctx = await browser.newContext({
      viewport: { width: s.w, height: s.h },
      deviceScaleFactor: s.scale,
      isMobile: s.name.startsWith('iphone'),
      hasTouch: true,
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    for (const [i, shot] of PLAN.shots.entries()) {
      await SCENES[shot.scene](page);
      const name = `${String(i + 1).padStart(2, '0')}-${shot.scene}`;
      if (PLAIN) {
        await page.screenshot({ path: join(dir, `${name}.jpg`), type: 'jpeg', quality: 92 });
        console.log(`${s.name}/${name}.jpg  ${W}x${H}`);
        continue;
      }
      const png = await page.screenshot({ type: 'png' });
      writeFileSync(join(rawDir, `${name}.png`), png);
      writeFileSync(join(dir, `${name}.png`), frame(png, W, H, shot));
      console.log(`${s.name}/${name}.png  ${W}x${H}  "${shot.caption.replace('\n', ' ')}"`);
    }
    if (errors.length) throw new Error(`page errors on ${s.name}:\n${errors.join('\n')}`);
    await ctx.close();
  }
  await browser.close();
} finally {
  server.kill();
}
