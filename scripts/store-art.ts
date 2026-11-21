// Draws the iOS app icon and launch splash from code (like the rest of FamiDuel's
// art) and writes them into the Xcode asset catalog.
//
//   npm run store:art
//
// Output PNGs have no alpha channel: App Store Connect rejects an app icon with one.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { rgbPng } from './rgbpng';

const ROOT = join(import.meta.dirname, '..');
const ASSETS = join(ROOT, 'ios/App/App/Assets.xcassets');

const P0 = '#3fa9ff'; // bottom player (blue)
const P1 = '#ff5c7a'; // top player (red)
const BG = '#110e26';
const GOLD = '#ffd54a';

/**
 * The emblem in a 1024 box: the table seen from above, red half on top, blue half
 * below, each player's paddle at their edge and a puck with a power bolt on the
 * centre line ("classic 2-player games, with super powers").
 */
function emblem(): string {
  return `
  <defs>
    <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff8aa0"/><stop offset="1" stop-color="${P1}"/>
    </linearGradient>
    <linearGradient id="bot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P0}"/><stop offset="1" stop-color="#1f7fe0"/>
    </linearGradient>
    <radialGradient id="puck" cx="0.4" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dcd8f5"/>
    </radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="1024" height="512" fill="url(#top)"/>
  <rect x="0" y="512" width="1024" height="512" fill="url(#bot)"/>
  <!-- centre line and circle of the table -->
  <rect x="0" y="502" width="1024" height="20" fill="${BG}" opacity="0.9"/>
  <circle cx="512" cy="512" r="250" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="14"/>
  <!-- paddles -->
  <rect x="352" y="118" width="320" height="76" rx="38" fill="#fff0f3"/>
  <rect x="352" y="830" width="320" height="76" rx="38" fill="#eaf7ff"/>
  <!-- puck with a power bolt -->
  <circle cx="512" cy="512" r="190" fill="${GOLD}" opacity="0.55" filter="url(#glow)"/>
  <circle cx="512" cy="512" r="168" fill="${BG}"/>
  <circle cx="512" cy="512" r="150" fill="url(#puck)"/>
  <path d="M548 372 L430 534 L506 534 L476 652 L596 486 L518 486 Z" fill="${GOLD}" stroke="#c98a00" stroke-width="10" stroke-linejoin="round"/>`;
}

function iconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${emblem()}</svg>`;
}

/** 2732 square, cropped to fill by the launch screen: keep everything near the centre. */
function splashSvg(): string {
  const s = 640; // emblem size: inside the ~1260 px wide strip a phone shows
  const x = (2732 - s) / 2;
  const y = (2732 - s) / 2 - 140;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="${BG}"/>
  <defs><clipPath id="r"><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.225}"/></clipPath></defs>
  <g clip-path="url(#r)"><g transform="translate(${x} ${y}) scale(${s / 1024})">${emblem()}</g></g>
  <text x="1366" y="${y + s + 170}" text-anchor="middle" font-family="DejaVu Sans, Helvetica, Arial, sans-serif"
    font-weight="bold" font-size="150"><tspan fill="#eaf7ff">Fami</tspan><tspan fill="#fff0f3">Duel</tspan></text>
</svg>`;
}

function render(svg: string, file: string): void {
  const img = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' } }).render();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, rgbPng(img.pixels, img.width, img.height));
  console.log(`${file.replace(ROOT + '/', '')}  ${img.width}x${img.height}`);
}

render(iconSvg(), join(ASSETS, 'AppIcon.appiconset/AppIcon-512@2x.png'));
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  render(splashSvg(), join(ASSETS, 'Splash.imageset', f));
// A copy of the icon for the store kit and the privacy page.
render(iconSvg(), join(ROOT, 'docs/app-store/icon-1024.png'));
writeFileSync(join(ROOT, 'docs/app-store/icon.svg'), iconSvg());
