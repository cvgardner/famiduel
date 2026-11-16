import { expect, test } from '@playwright/test';
import games from '../content/games.json' with { type: 'json' };
import { boot } from './helpers';

// F318: with a 12-letter name on a 320 px phone with Bigger text, the countdown's
// "<name> goes first" pill in a turn game ran ~35 units off both screen edges. Every shown
// game's countdown words must stay on screen and clear of its edges (the edge probe).
type Hook = {
  store: { data: { profiles: { name: string; bot: string | null }[]; settings: { bigText: boolean } }; save(): void };
  showHome(): void;
  applyBigText(): void;
  openGame(id: string): void;
  runner: { starterLines(): [string | null, string | null] } | null;
};
type Edges = { on: boolean; over: Map<string, number>; near: Map<string, number> };

test.setTimeout(120_000);
test.use({ viewport: { width: 320, height: 568 }, hasTouch: true });

test('countdown words fit with 12-letter names (320x568, Bigger text)', async ({ page }) => {
  const errors = await boot(page, 'E2E', false);
  const checked: string[] = [];
  for (const id of games.games.filter((g) => !g.hidden).map((g) => g.id)) {
    // Both seats get the long name: the seeded coin toss picks either seat to start.
    for (const names of [['WWWWWWWWWWWW', 'WWWWWWWWWWWW']]) {
      await page.evaluate(([gameId, n]) => {
        const app = (window as unknown as { __famiduel: Hook }).__famiduel;
        app.store.data.settings.bigText = true;
        (n as string[]).forEach((v, i) => {
          app.store.data.profiles[i].name = v;
          app.store.data.profiles[i].bot = null;
        });
        app.store.save();
        app.applyBigText();
        app.showHome();
        app.openGame(gameId as string);
      }, [id, names] as const);
      await page.locator('#ready0').tap();
      await page.locator('#ready1').tap();
      await expect(page.locator('#play')).toBeVisible();
      const lines = await page.evaluate(() => {
        const e = (window as unknown as { __edges: Edges }).__edges;
        e.over.clear();
        e.near.clear();
        e.on = true;
        return (window as unknown as { __famiduel: Hook }).__famiduel.runner!.starterLines();
      });
      await page.waitForTimeout(700);
      const [over, near] = await page.evaluate(() => {
        const e = (window as unknown as { __edges: Edges }).__edges;
        e.on = false;
        return [[...e.over].map(([s]) => s), [...e.near].map(([s]) => s)];
      });
      const mine = lines.filter((l): l is string => !!l);
      checked.push(...mine);
      expect(over.filter((s) => mine.includes(s)), `${id}: starter words off the screen`).toEqual([]);
      expect(near.filter((s) => mine.includes(s)), `${id}: starter words crowding the edge`).toEqual([]);
      await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showHome());
    }
  }
  expect(checked.some((l) => l.startsWith('WWWWWWWWWWWW')), 'a long name was checked').toBe(true);
  expect(errors).toEqual([]);
});

// F317: names on the board (the HUD, score pills, notices) must never sit on other words.
// Each shown game, two people with a 12-letter name and "Grandma Jose" (both ways round),
// then playing the bot with long names on both seats, ~3 s past the intro on a 320 px phone
// with Bigger text: the box probe lists every word drawn in a frame, and a word that holds
// a name must not overlap a different word drawn in the same frame.
type Box = { str: string; size: number; l: number; t: number; r: number; b: number };
type Seat = { name: string; bot: string | null; botName?: string };

test('names in play never sit on other words (320x568, Bigger text)', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'the viewport is fixed above, so one project is enough');
  test.setTimeout(240_000);
  // Classic rules: with powers on, Ready waits for a power pick.
  const errors = await boot(page, 'E2E', false);
  const LONG = 'WWWWWWWWWWWW';
  const GRAN = 'Grandma Jose';
  const setups: { names: [string, string]; solo: boolean }[] = [
    { names: [LONG, GRAN], solo: false },
    { names: [GRAN, LONG], solo: false },
    { names: [LONG, LONG], solo: true },
  ];
  const hits = new Set<string>();
  const seenIn = new Set<string>();
  for (const id of games.games.filter((g) => !g.hidden).map((g) => g.id)) {
    for (const { names, solo } of setups) {
      await page.evaluate(
        ([gameId, n, isSolo]) => {
          const app = (window as unknown as { __famiduel: Hook & { store: { data: { profiles: Seat[] } } } }).__famiduel;
          app.store.data.settings.bigText = true;
          (n as string[]).forEach((v, i) => {
            const seat = app.store.data.profiles[i];
            seat.name = v;
            seat.bot = null;
          });
          if (isSolo) {
            app.store.data.profiles[1].bot = 'normal';
            app.store.data.profiles[1].botName = (n as string[])[1];
          }
          app.store.save();
          app.applyBigText();
          app.showHome();
          app.openGame(gameId as string);
        },
        [id, names, solo] as const,
      );
      for (const r of ['#ready0', '#ready1']) {
        const b = page.locator(r);
        if (await b.isVisible()) await b.tap();
      }
      const found = await page.evaluate(async (ns) => {
        const w = window as unknown as { __boxes: { on: boolean; boxes: Box[] } };
        const frame = () => new Promise((res) => requestAnimationFrame(() => res(null)));
        // A name may be cut to fit ("WWWWWWW…"), so its first 6 letters count too.
        const isName = (s: string) => ns.some((n) => s.includes(n.slice(0, 6)));
        const out = { hits: [] as string[], names: 0 };
        for (let i = 0; i < 6; i++) {
          await new Promise((res) => setTimeout(res, 500));
          w.__boxes.boxes = [];
          w.__boxes.on = true;
          await frame();
          w.__boxes.on = false;
          const bx = w.__boxes.boxes.filter((b) => b.str.trim());
          for (const a of bx) {
            // The countdown's "<name> goes first" pill is solid on purpose (F318 checks its fit):
            // in Penalty it covers the still-empty kick tracker for the 3 s of "3 2 1".
            if (!isName(a.str) || / goes first$/.test(a.str)) continue;
            out.names++;
            for (const o of bx) {
              if (o === a || o.str === a.str) continue;
              if (a.l < o.r - 1 && a.r > o.l + 1 && a.t < o.b - 1 && a.b > o.t + 1) out.hits.push(`"${a.str}" on "${o.str}"`);
            }
          }
        }
        return out;
      }, names);
      if (found.names) seenIn.add(id);
      for (const h of found.hits) hits.add(`${id}${solo ? ' (bot)' : ''}: ${h}`);
      await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showHome());
    }
  }
  expect([...hits], 'a name drawn on other words').toEqual([]);
  // 2026-11-15: names show on the board in Minigolf, Sumo, Tank Duel, Sea Battle and RPS.
  expect(seenIn.size, `the probe saw names on the board (${[...seenIn].join(', ')})`).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});
