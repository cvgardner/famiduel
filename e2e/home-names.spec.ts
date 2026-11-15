import { expect, test } from '@playwright/test';
import { boot } from './helpers';

// F309: on home each player's name stays inside its own chip and clear of the round VS badge
// between the chips, for short, default and 12-letter names (the editor's limit), on a small
// phone with and without Bigger text. Seat 2's name lines up right; a long one used to run left
// over the badge and seat 1's chip.
type Hook = { store: { data: { profiles: { name: string; bot: string | null }[]; settings: { bigText: boolean } }; save(): void }; showHome(): void; applyBigText(): void };

for (const [label, size, big] of [
  ['320x568', { width: 320, height: 568 }, false],
  ['320x568 with Bigger text', { width: 320, height: 568 }, true],
  ['390x844 with Bigger text', { width: 390, height: 844 }, true],
] as const) {
  test.describe(`home names clear of VS (${label})`, () => {
    test.use({ viewport: size });
    test('short, default and 12-letter names', async ({ page }) => {
      const errors = await boot(page, 'E2E', false);
      for (const names of [['Jo', 'Al'], ['', ''], ['WWWWWWWWWWWW', 'Grandma Jose']]) {
        const boxes = await page.evaluate(([big, n]) => {
          const app = (window as unknown as { __famiduel: Hook }).__famiduel;
          app.store.data.settings.bigText = big as boolean;
          (n as string[]).forEach((v, i) => (app.store.data.profiles[i].name = v));
          app.store.save();
          app.applyBigText();
          app.showHome();
          const r = (e: Element) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
          const vs = r(document.querySelector('.vs')!);
          return [...document.querySelectorAll('.player-chip')].map((c) => ({ chip: r(c), name: r(c.querySelector('.pname')!), text: c.querySelector('.pname')!.textContent, vs }));
        }, [big, names] as const);
        for (const { chip, name, text, vs } of boxes) {
          const across = Math.min(name.r, vs.r) - Math.max(name.l, vs.l);
          const down = Math.min(name.b, vs.b) - Math.max(name.t, vs.t);
          expect(across > 0.5 && down > 0.5, `"${text}" under the VS badge (${Math.round(name.l)}-${Math.round(name.r)} vs ${Math.round(vs.l)}-${Math.round(vs.r)})`).toBe(false);
          expect(name.l >= chip.l - 0.5 && name.r <= chip.r + 0.5, `"${text}" inside its chip`).toBe(true);
        }
      }
      expect(errors).toEqual([]);
    });
  });
}
