// App Store screenshots, taken from the real web build in a headless phone browser.
//
//   npm run store:shots            (builds first; needs `npx playwright install chromium` once)
//
// Writes JPEGs (App Store Connect refuses PNGs with an alpha channel) to
// docs/app-store/screenshots/<size>/, one folder per display size App Store Connect asks
// for. Sizes checked against Apple's "Screenshot specifications" page, Nov 2026:
//   - iPhone 6.9" (Dynamic Island, large)  1320 x 2868  (optional, but shown on the
//     biggest phones; it also covers the "Face ID large" slot)
//   - iPhone 6.3" (Dynamic Island, medium) 1206 x 2622  (required)
// The app ships iPhone-only (TARGETED_DEVICE_FAMILY = 1), so no iPad shots are required.
// Pass --ipad to also make 13" iPad shots (2064 x 2752) if you switch to universal.
import { chromium, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'docs/app-store/screenshots');
const PORT = 4179;
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

const SCENES: { file: string; take: (p: Page) => Promise<void> }[] = [
  { file: '01-home', take: (p) => fresh(p) },
  { file: '02-airhockey', take: (p) => midMatch(p, 'airhockey', 6) },
  {
    file: '03-powers',
    take: async (p) => {
      await fresh(p);
      await p.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.openGame('sumo'));
      await p.locator('#intro').waitFor();
      await p.waitForTimeout(400);
    },
  },
  { file: '04-minigolf', take: (p) => midMatch(p, 'minigolf', 8) },
  { file: '05-penalty', take: (p) => midMatch(p, 'penalty', 7) },
  {
    file: '06-tournament',
    take: async (p) => {
      await fresh(p);
      await p.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showTournament());
      await p.waitForTimeout(400);
    },
  },
];

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
    mkdirSync(dir, { recursive: true });
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
    for (const scene of SCENES) {
      await scene.take(page);
      const file = join(dir, `${scene.file}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
      console.log(`${s.name}/${scene.file}.jpg  ${s.w * s.scale}x${s.h * s.scale}`);
    }
    if (errors.length) throw new Error(`page errors on ${s.name}:\n${errors.join('\n')}`);
    await ctx.close();
  }
  await browser.close();
} finally {
  server.kill();
}
