// A self-test of the real ad path on an iPhone simulator, with no taps: built only when
// VITE_AD_SELFTEST=1 (scripts/ios-ad-selftest.sh), never in a store or web build.
// It waits for AdMob's test interstitial to load, plays one bot-vs-bot match, taps
// Rematch and so shows the ad. Progress goes to the console ("[ad-selftest] ..."), which
// Capacitor prints to the simulator log.
import type { App } from './app';
import { RESULT_SETTLE_MS } from './app';

const log = (m: string) => console.log(`[ad-selftest] ${m}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runAdSelfTest(app: App): Promise<void> {
  const money = app.money;
  if (!money) return log('FAIL no ads backend (not running in the app?)');
  log(`start; removed=${app.adState.removed} launches=${app.adState.launches}`);
  app.adRules = { minMatches: 1, minGapMs: 0, freeLaunches: 0 };
  const price = await money.purchases.price();
  log(`store price for Remove Ads: ${price ?? 'none (expected until the product exists)'}`);
  for (let i = 0; i < 60 && !money.ads.ready(); i++) await wait(500);
  if (!money.ads.ready()) return log('FAIL interstitial did not load in 30 s');
  log('interstitial loaded');
  const [a, b] = app.store.data.profiles;
  a.bot = 'normal';
  b.bot = 'normal';
  app.store.save();
  app.openGame('airhockey');
  app.startMatch();
  app.runner!.fastForward(900);
  for (let i = 0; i < 20 && document.getElementById('result')?.classList.contains('hidden'); i++) await wait(250);
  log('result screen shown');
  await wait(RESULT_SETTLE_MS + 300);
  document.querySelector<HTMLButtonElement>('#rematchBtn')!.click();
  log('rematch tapped; the ad should be on screen now');
  const t0 = Date.now();
  for (let i = 0; i < 600 && document.getElementById('intro')?.classList.contains('hidden'); i++) await wait(100);
  log(document.getElementById('intro')?.classList.contains('hidden') ? 'ad still open after 60 s (close it to finish)' : `ad closed after ${Math.round((Date.now() - t0) / 1000)} s; intro shown: PASS`);
}
