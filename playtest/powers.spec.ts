// Weekly power rotation in the real app (src/core/rotation.ts). Each week the intro shows
// 3 of a game's 5 powers, so the playtest's own intros only ever see this week's. Here every
// power in every pool gets its turn on the intro: for each game, enough weeks to show each
// power once (longest words first), on a small phone, with and without Bigger text.
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import games from '../content/games.json' with { type: 'json' };
import powers from '../content/powers.json' with { type: 'json' };
import { cycleOf, weekIndex, weekStart, weeklyPowers, type PowerTable } from '../src/core/rotation';

const OUT = path.join(process.cwd(), 'playtest-report');
const TABLE = powers as unknown as PowerTable;

type Hook = {
  store: { data: { settings: Record<string, boolean> }; save(): void };
  showHome(): void;
  openGame(id: string): void;
  applyBigText(): void;
  powerDate: Date | null;
};

/** Mondays (as local dates) whose offers between them show every power, the wordiest week first. */
function weeksCovering(game: string): Date[] {
  const pool = TABLE.games[game];
  const k = Math.min(TABLE.rotation.perWeek, pool.length);
  const base = weekIndex(new Date());
  const weeks = cycleOf(game, pool.length, k).map((_, i) => {
    const [y, m, d] = weekStart(base + i).split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  });
  const words = (d: Date) => weeklyPowers(TABLE, game, d).reduce((n, p) => n + p.name.length + p.desc.length, 0);
  weeks.sort((a, b) => words(b) - words(a));
  const left = new Set(pool.map((p) => p.id));
  const out: Date[] = [];
  for (const w of weeks) {
    const ids = weeklyPowers(TABLE, game, w).map((p) => p.id);
    if (ids.some((id) => left.has(id))) {
      out.push(w);
      ids.forEach((id) => left.delete(id));
    }
    if (!left.size) break;
  }
  return out;
}

async function boot(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto('/?seed=playtest');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => {
    const a = (window as unknown as { __famiduel: Hook }).__famiduel;
    a.store.data.settings.powers = true;
    a.store.save();
    a.showHome();
  });
}

test('weekly powers: every power in every pool fits the intro on a small phone', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  const shown = games.games.filter((g) => !(g as { hidden?: boolean }).hidden && (TABLE.games[g.id] ?? []).length).map((g) => g.id);
  const problems: string[] = [];
  const seen = new Map<string, Set<string>>();
  for (const big of [false, true]) {
    await page.evaluate((on) => {
      const a = (window as unknown as { __famiduel: Hook }).__famiduel;
      a.store.data.settings.bigText = on;
      a.applyBigText();
    }, big);
    for (const [w, h] of [[320, 568], [360, 640]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const id of shown) {
        for (const day of weeksCovering(id)) {
          const tag = `${id} week of ${weekStart(weekIndex(day))} at ${w}x${h}${big ? ' (bigger text)' : ''}`;
          await page.evaluate(
            ([g, t]) => {
              const a = (window as unknown as { __famiduel: Hook }).__famiduel;
              a.powerDate = new Date(t);
              a.openGame(g);
            },
            [id, day.getTime()] as const,
          );
          const want = weeklyPowers(TABLE, id, day).map((p) => p.id);
          const got = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('#intro .half.p0 .power-card')].map((c) => ({
              id: c.dataset.id!,
              nameCut: (() => {
                const b = c.querySelector('b') as HTMLElement;
                return b.scrollWidth > b.clientWidth + 1;
              })(),
            })),
          );
          if (JSON.stringify(got.map((c) => c.id)) !== JSON.stringify(want)) problems.push(`${tag}: intro shows ${got.map((c) => c.id)} not ${want}`);
          for (const c of got) {
            if (c.nameCut) problems.push(`${tag}: ${c.id}'s name is cut off`);
            if (!seen.has(id)) seen.set(id, new Set());
            seen.get(id)!.add(c.id);
          }
          const clipped = await page.evaluate(() =>
            [...document.querySelectorAll('#intro .half')].some((half) => {
              const inner = half.querySelector('.half-inner') as HTMLElement;
              return inner.getBoundingClientRect().height > (half as HTMLElement).getBoundingClientRect().height + 1;
            }),
          );
          if (clipped) {
            problems.push(`${tag}: intro cut off`);
            await page.screenshot({ path: path.join(OUT, `powers-${id}-${w}x${h}${big ? '-big' : ''}.png`) });
          }
          await page.evaluate(() => (window as unknown as { __famiduel: Hook }).__famiduel.showHome());
        }
      }
    }
  }
  await page.evaluate(() => {
    const a = (window as unknown as { __famiduel: Hook }).__famiduel;
    a.powerDate = null;
    a.store.data.settings.bigText = false;
    a.applyBigText();
  });
  for (const id of shown) expect([...(seen.get(id) ?? [])].sort(), `${id}: every pool power shown`).toEqual(TABLE.games[id].map((p) => p.id).sort());
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});
