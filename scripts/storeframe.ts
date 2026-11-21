// Puts a caption above an App Store screenshot: big words on top, the real app screen
// below with rounded corners, on FamiDuel's night-blue with the two players' colours
// (red top, blue bottom, like the icon). Used by scripts/store-shots.ts; the order and
// the words live in docs/app-store/screenshots.json.
//
// Drawn with resvg (no browser), so it can be checked anywhere. The output is an RGB PNG:
// App Store Connect refuses screenshots with an alpha channel.
import { Resvg } from '@resvg/resvg-js';
import { rgbPng } from './rgbpng';

export type Caption = { caption: string; sub?: string };

const BG = '#110e26';
const P0 = '#3fa9ff'; // bottom player (blue)
const P1 = '#ff5c7a'; // top player (red)
const GOLD = '#ffd54a';
/** Rounded and bold like the app's own type; the first one installed wins (macOS has Arial Rounded). */
const FONT = "'Arial Rounded MT Bold', 'SF Pro Rounded', 'Nunito', 'Inter', 'DejaVu Sans', sans-serif";

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Width and height of a PNG, read from its header. */
export function pngSize(png: Buffer): { w: number; h: number } {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
}

/** Where things go on a W x H store image (the shot keeps its own aspect, about the phone's). */
export function layout(W: number, H: number, shotW: number, shotH: number, lines: number, longest = 12) {
  const s = W * 0.74; // the screen's width on the image
  const sh = (s * shotH) / shotW;
  const bottom = H * 0.045;
  const top = H - bottom - sh; // the caption gets everything above the screen
  // Bold rounded type runs about 0.6 of its size per letter: shrink a long line to fit.
  const size = Math.min(W * 0.088, (W * 0.9) / (longest * 0.6));
  const subSize = W * 0.047;
  const lead = size * 1.12;
  const block = lines * lead + subSize * 1.6;
  const y0 = Math.max(W * 0.06, (top - block) / 2) + size; // first baseline
  return { s, sh, x: (W - s) / 2, top, size, subSize, lead, y0, r: s * 0.065 };
}

export function frameSvg(shotPng: Buffer, W: number, H: number, cap: Caption): string {
  const { w: sw, h: shh } = pngSize(shotPng);
  const lines = cap.caption.split('\n');
  const L = layout(W, H, sw, shh, lines.length, Math.max(...lines.map((t) => t.length)));
  const text = lines
    .map((t, i) => `<text x="${W / 2}" y="${L.y0 + i * L.lead}" font-size="${L.size}">${esc(t)}</text>`)
    .join('');
  const subY = L.y0 + (lines.length - 1) * L.lead + L.subSize * 1.55;
  const sub = cap.sub
    ? `<text x="${W / 2}" y="${subY}" font-size="${L.subSize}" fill="${GOLD}">${esc(cap.sub)}</text>`
    : '';
  const href = `data:image/png;base64,${shotPng.toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="red" cx="0.15" cy="0.05" r="0.75"><stop offset="0" stop-color="${P1}" stop-opacity="0.55"/><stop offset="1" stop-color="${P1}" stop-opacity="0"/></radialGradient>
    <radialGradient id="blue" cx="0.9" cy="0.95" r="0.8"><stop offset="0" stop-color="${P0}" stop-opacity="0.5"/><stop offset="1" stop-color="${P0}" stop-opacity="0"/></radialGradient>
    <clipPath id="screen"><rect x="${L.x}" y="${L.top}" width="${L.s}" height="${L.sh}" rx="${L.r}"/></clipPath>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${W * 0.02}"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#red)"/>
  <rect width="${W}" height="${H}" fill="url(#blue)"/>
  <g font-family="${FONT}" font-weight="bold" fill="#ffffff" text-anchor="middle">${text}${sub}</g>
  <rect x="${L.x}" y="${L.top}" width="${L.s}" height="${L.sh}" rx="${L.r}" fill="#000000" opacity="0.55" filter="url(#glow)"/>
  <image x="${L.x}" y="${L.top}" width="${L.s}" height="${L.sh}" preserveAspectRatio="xMidYMid slice" clip-path="url(#screen)" xlink:href="${href}" href="${href}"/>
  <rect x="${L.x}" y="${L.top}" width="${L.s}" height="${L.sh}" rx="${L.r}" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="${W * 0.006}"/>
</svg>`;
}

/** The finished store image as an RGB PNG, W x H pixels. */
export function frame(shotPng: Buffer, W: number, H: number, cap: Caption): Buffer {
  const img = new Resvg(frameSvg(shotPng, W, H, cap), {
    fitTo: { mode: 'original' },
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
  }).render();
  if (img.width !== W || img.height !== H) throw new Error(`framed ${img.width}x${img.height}, wanted ${W}x${H}`);
  return rgbPng(img.pixels, img.width, img.height);
}
