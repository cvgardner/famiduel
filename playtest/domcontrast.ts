// WCAG contrast for the menus' DOM text (intro, result, pause), the way the canvas
// probe (src/engine/draw.ts) does it for game labels: what matters is the pixels
// really behind the words, gradients and the game canvas included. So the page is
// screenshotted once with every glyph made transparent, and each text run is judged
// against the median colour of the pixels under its box (a median, so an emoji or an
// icon beside the words doesn't skew it).

import type { Page } from '@playwright/test';
import { contrastNeeded, contrastRatio, over, parseColor } from '../src/core/contrast';

export type DomLabel = { text: string; ratio: number; need: number; size: number; weight: number };

type Item = { text: string; color: string; size: number; weight: number; op: number; box: { x: number; y: number; w: number; h: number } };

/** Every visible text run under `root` with its contrast against what is behind it. */
export async function domContrast(page: Page, root: string): Promise<DomLabel[]> {
  const items: Item[] = await page.evaluate((sel) => {
    const out: Item[] = [];
    const top = document.querySelector(sel);
    if (!top) return out;
    const walk = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
      // Emoji and arrows alone aren't text to read (and draw in their own colours).
      if (!/[\p{L}\p{N}]/u.test(t)) continue;
      const el = n.parentElement!;
      const cs = getComputedStyle(el);
      if (cs.visibility !== 'visible') continue;
      // WCAG exempts inactive controls.
      if (el.closest('button:disabled, [aria-disabled="true"]')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue;
      // Covered (a modal over the game, say): not something anyone can read right now.
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) continue;
      let op = 1;
      for (let e: Element | null = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
      if (op < 0.05) continue;
      out.push({ text: t.slice(0, 48), color: cs.color, size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10) || 400, op, box: { x: r.x, y: r.y, w: r.width, h: r.height } });
    }
    return out;
  }, root);
  if (!items.length) return [];

  const hide = await page.addStyleTag({
    content: '* { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; caret-color: transparent !important; transition: none !important; }',
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const png = await page.screenshot({ animations: 'disabled' });
  await hide.evaluate((s) => (s as Element).remove());

  const bgs: [number, number, number][] = await page.evaluate(
    async ({ b64, boxes }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      return boxes.map((b) => {
        const x = Math.max(0, Math.floor(b.x * k));
        const y = Math.max(0, Math.floor(b.y * k));
        const w = Math.max(1, Math.min(img.width - x, Math.ceil(b.w * k)));
        const h = Math.max(1, Math.min(img.height - y, Math.ceil(b.h * k)));
        const d = g.getImageData(x, y, w, h).data;
        const ch: number[][] = [[], [], []];
        for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) ch[j].push(d[i + j]);
        return ch.map((v) => v.sort((p, q) => p - q)[v.length >> 1]) as [number, number, number];
      });
    },
    { b64: png.toString('base64'), boxes: items.map((i) => i.box) },
  );

  return items.map((it, i) => {
    const fg = parseColor(it.color) ?? [255, 255, 255, 1];
    const bg = bgs[i];
    return { text: it.text, ratio: contrastRatio(over(fg, bg, it.op), bg), need: contrastNeeded(it.size, it.weight), size: it.size, weight: it.weight };
  });
}

/** The labels that fall short, as readable lines for an assertion. */
export function faintLabels(where: string, labels: DomLabel[]): string[] {
  return labels.filter((l) => l.ratio < l.need).map((l) => `${where}: "${l.text}" ${l.ratio.toFixed(1)}:1 (needs ${l.need}:1 at ${l.size}px/${l.weight})`);
}
