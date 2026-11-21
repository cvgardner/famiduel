import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { frame, pngSize } from '../scripts/storeframe';
import { rgbPng } from '../scripts/rgbpng';

// The App Store screenshots: a caption above the real app screen (scripts/storeframe.ts),
// in the order and words of docs/app-store/screenshots.json.
const plan = JSON.parse(readFileSync(join(import.meta.dirname, '../docs/app-store/screenshots.json'), 'utf8')) as {
  shots: { scene: string; caption: string; sub?: string }[];
};

/** A stand-in app screen at the 6.3" phone's shape. */
function fakeShot(w = 134, h = 291): Buffer {
  const img = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#1f7fe0"/></svg>`).render();
  return rgbPng(img.pixels, img.width, img.height);
}

describe('store screenshot plan', () => {
  it('has 3 to 10 shots, each with a short caption', () => {
    expect(plan.shots.length).toBeGreaterThanOrEqual(3);
    expect(plan.shots.length).toBeLessThanOrEqual(10);
    for (const s of plan.shots) {
      const lines = s.caption.split('\n');
      expect(lines.length, s.caption).toBeLessThanOrEqual(2);
      for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(16);
      expect((s.sub ?? '').length, s.sub).toBeLessThanOrEqual(30);
    }
  });

  it('names each scene once', () => {
    const scenes = plan.shots.map((s) => s.scene);
    expect(new Set(scenes).size).toBe(scenes.length);
  });
});

describe('store frame', () => {
  it('makes an RGB PNG at the exact store size', () => {
    const out = frame(fakeShot(), 1206, 2622, { caption: 'Two players.\nOne phone.', sub: 'Lay it flat and duel' });
    expect(pngSize(out)).toEqual({ w: 1206, h: 2622 });
    expect(out[25]).toBe(2); // colour type RGB: no alpha channel
  });
});
