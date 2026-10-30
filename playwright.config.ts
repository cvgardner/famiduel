import { defineConfig } from '@playwright/test';

// PW_CHROMIUM lets a machine with a preinstalled Chromium skip `playwright install`.
const PORT = Number(process.env.PORT ?? 4173);

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    // `npm run playtest`: real-time touch play of every game, writes playtest-report/.
    { name: 'playtest', testDir: 'playtest', timeout: 120_000, use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
