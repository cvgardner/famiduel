// A little still picture of each game for its home card, in place of the emoji: the game's
// own scene with its key moment (a puck between two paddles, two snakes and their trails).
// Chris, 20 Nov 2026, after looking at another two-player app whose menu is a grid of
// small gameplay pictures. Drawn in code (inline SVG, no assets), reusing the scenes of the
// power pictures (powerpic.ts) so a game looks the same on its card and on its intro.
// The bottom player is drawn in seat 1's colour (`--y`), the top one in seat 2's (`--t`),
// the same way round as at the table. A new game needs one too (tests/cardpic.test.ts).

import { arena, board, green, mat, pitch, pong, pool, ring, sand, sea, seaBg, table, tug, woods } from './powerpic';

/** Bottom player (seat 1) and top player (seat 2). */
const Y = 'var(--y, #ffd166)';
const T = 'var(--t, #6ec6ff)';

const paint = (attr: 'fill' | 'stroke', c: string) => (c.startsWith('var(') ? `style="${attr}:${c}"` : `${attr}="${c}"`);
const dot = (cx: number, cy: number, r: number, fill: string, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" ${paint('fill', fill)}${extra}/>`;
const box = (x: number, y: number, w: number, h: number, fill: string, rx = Math.min(w, h) / 2, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${paint('fill', fill)}${extra}/>`;
const path = (d: string, stroke: string, w: number, extra = '') =>
  `<path d="${d}" fill="none" ${paint('stroke', stroke)} stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const OUTLINE = ' stroke="#fff" stroke-width="1.2"';
const DASH = ' stroke-dasharray="2 2.5" opacity="0.85"';

/** A round paddle or mallet seen from above. */
const mallet = (cx: number, cy: number, fill: string) => dot(cx, cy, 6, fill, OUTLINE) + dot(cx, cy, 2.5, '#fff', ' opacity="0.45"');
/** A bat with its handle pointing away from the table. */
const bat = (cx: number, cy: number, fill: string, up: boolean) =>
  box(cx - 1.2, up ? cy - 9 : cy + 3, 2.4, 6, '#8b5a2b', 1) + dot(cx, cy, 5, fill, OUTLINE);
/** A frog-like critter's head poking in from the top or the bottom edge, with its two eyes. */
const critter = (cx: number, top: boolean, fill: string) => {
  const y = top ? 1 : 43;
  const ey = top ? 7 : 37;
  return `<ellipse cx="${cx}" cy="${y}" rx="11" ry="8" ${paint('fill', fill)}${OUTLINE}/>` + [-4, 4].map((d) => dot(cx + d, ey, 2.4, '#fff') + dot(cx + d, ey + (top ? 0.6 : -0.6), 1.1, '#14112b')).join('');
};
/** A tank from above: body, turret and barrel pointing at (ax, ay). */
const tank = (x: number, y: number, ax: number, ay: number, fill: string) => {
  const len = Math.hypot(ax - x, ay - y) || 1;
  const bx = x + ((ax - x) / len) * 8;
  const by = y + ((ay - y) / len) * 8;
  return box(x - 6, y - 5, 12, 10, fill, 2.5, OUTLINE) + path(`M${x} ${y}L${bx.toFixed(1)} ${by.toFixed(1)}`, '#2a2a2a', 2.6) + dot(x, y, 3, '#2a2a2a', ' opacity="0.35"');
};
/** A snake's head with an eye, facing along (dx, dy). */
const snakeHead = (x: number, y: number, dx: number, dy: number, fill: string) =>
  dot(x, y, 3.6, fill, OUTLINE) + dot(x + dx * 1.4 - dy * 1.2, y + dy * 1.4 + dx * 1.2, 1, '#14112b');
/** A pool ball with a thin dark edge, so it reads as a ball and not a ring. */
const ball = (cx: number, cy: number, fill: string) => dot(cx, cy, 2.8, fill, ' stroke="#07060a" stroke-opacity="0.6" stroke-width="0.5"');
/** A kid seen from above: a head in the seat colour with a lighter face. */
const kid = (cx: number, cy: number, fill: string) => dot(cx, cy, 4.2, fill, OUTLINE) + dot(cx, cy + 0.8, 2, '#ffd9b5', ' opacity="0.9"');
/** A hand reaching in from the player's own edge (sleeve in the seat colour): rock or scissors. */
const hand = (cx: number, top: boolean, kind: 'rock' | 'scissors', fill: string) => {
  const s = top ? 1 : -1; // toward the middle
  const py = top ? 13 : 31;
  const sleeve = box(cx - 5, top ? 1 : 37, 10, 6, fill, 2, OUTLINE);
  const palm = `<ellipse cx="${cx}" cy="${py}" rx="7" ry="6" fill="#f2c39b" stroke="#c98f62" stroke-width="1"/>`;
  if (kind === 'rock') return sleeve + palm + [-3, 0, 3].map((d) => path(`M${cx + d} ${py + s * 2}L${cx + d} ${py + s * 4.5}`, '#c98f62', 0.9)).join('');
  const blades = [-1, 1].map((d) => path(`M${cx + d * 1.5} ${py + s * 3}L${cx + d * 6.5} ${py + s * 13}`, '#c98f62', 3.6) + path(`M${cx + d * 1.5} ${py + s * 3}L${cx + d * 6.5} ${py + s * 13}`, '#f2c39b', 2.2)).join('');
  return sleeve + blades + palm;
};

const PICS: Record<string, string> = {
  // The cup and its flag, their ball already close; your putt rolls up the aim line toward it.
  minigolf:
    green +
    dot(23, 12, 3, T, OUTLINE) +
    `<rect x="12" y="20" width="18" height="4" rx="2" fill="#e8e2d0"/>` +
    path('M32 9L32 1.5', '#fff', 1.2) +
    `<path d="M32 1.8L39 3.8L32 5.8Z" fill="#ff5c7a"/>` +
    path('M42 36Q46 22 34 11', '#fff', 1.2, DASH) +
    dot(42, 36, 3, Y, OUTLINE),
  // Two mallets and the puck streaking toward the top goal.
  airhockey:
    table +
    path('M40 33L30 20', '#fff', 2, ' opacity="0.35"') +
    mallet(22, 10, T) +
    mallet(42, 35, Y) +
    dot(29, 18.5, 3, '#14112b', OUTLINE),
  // Two wrestlers in the ring, one shoving the other toward the edge.
  sumo:
    ring +
    dot(27, 26, 8, Y, OUTLINE) +
    dot(41, 15, 8, T, OUTLINE) +
    `<rect x="19" y="25" width="16" height="2.4" fill="#14112b" opacity="0.35"/><rect x="33" y="14" width="16" height="2.4" fill="#14112b" opacity="0.35"/>` +
    path('M34 22L36 18M36 24L39 21M31 20L33 17', '#fff', 1.2),
  // A rally: two bats and the ball arcing over the net.
  pingpong:
    pong +
    path('M38 34Q48 22 28 9', '#fff', 1.1, DASH) +
    bat(24, 8, T, true) +
    bat(40, 36, Y, false) +
    dot(30, 11, 2.4, '#fff', ' stroke="#ff9f43" stroke-width="0.8"'),
  // Two critters snapping for the snacks; a gold one in the middle.
  snacksnatch:
    mat +
    [[12, 18, '#ff9f43'], [50, 25, '#ff9f43'], [20, 28, '#ff7eb3'], [44, 14, '#7ee081']].map(([x, y, c]) => dot(x as number, y as number, 2.6, c as string)).join('') +
    dot(32, 22, 3.6, '#ffd166', ' stroke="#fff3b0" stroke-width="1.2"') +
    path('M38 36L48 26.5', '#ff7eb3', 2.6) +
    critter(18, true, T) +
    critter(38, false, Y),
  // Two tanks round a block; your shell bounces off the wall toward the other.
  tanks:
    arena +
    box(27, 17, 10, 10, '#7f8f7a', 1.5) +
    path('M18 30L6 16L28 6', '#ffd166', 1.1, DASH) +
    dot(23, 8, 1.8, '#ffd166', OUTLINE) +
    tank(14, 34, 6, 22, Y) +
    tank(48, 10, 40, 22, T),
  // Two snakes and their trails; yours cuts across in front of the other.
  snake:
    board +
    path('M6 40L6 30L22 30L22 18L40 18', Y, 4) +
    snakeHead(41, 18, 1, 0, Y) +
    path('M58 4L58 12L46 12L46 30L38 30', T, 4) +
    snakeHead(37, 30, -1, 0, T),
  // The keeper in the goal; your shot flies for the corner.
  penalty:
    pitch +
    `<path d="M15 3H49M15 6H49M15 9H49M20 2V11M26 2V11M32 2V11M38 2V11M44 2V11" stroke="#fff" stroke-opacity="0.3" stroke-width="0.6"/>` +
    box(26, 6, 12, 5, T, 2, OUTLINE) +
    path('M32 38Q22 28 20 8', '#fff', 1.1, DASH) +
    `<circle cx="21" cy="12" r="3.2" fill="#fff" stroke="#14112b" stroke-width="0.8"/><circle cx="21" cy="12" r="1" fill="#14112b"/>` +
    dot(32, 39, 2.5, Y, ' opacity="0.5"'),
  // The 8 and a few balls left; your cue is drawn back, aimed at one of yours by the corner.
  minipool:
    pool +
    ball(16, 12, T) +
    ball(44, 30, T) +
    ball(25, 16, '#14112b') +
    // The 8's white spot, drawn (no text in the pictures: page probes read SVG text as menu text).
    `<circle cx="25" cy="16" r="1.4" fill="#fff"/>` +
    ball(12, 29, Y) +
    path('M30 32L48.5 13.5', '#fff', 1, DASH) +
    ball(51, 11, Y) +
    path('M27.6 34.4L19 43', '#c98f62', 2.2) +
    ball(30, 32, '#fff'),
  // The DRAW! sign in the middle and both buttons ready; you tap first.
  quickdraw:
    sand +
    `<rect x="21" y="15.5" width="22" height="13" rx="6.5" fill="#5eead4" stroke="#fff" stroke-width="1.2"/>` +
    // The DRAW! signal as a bold "!" on the sign.
    `<rect x="30.6" y="17.6" width="2.8" height="6" rx="1.4" fill="#0b3b36"/><circle cx="32" cy="26" r="1.5" fill="#0b3b36"/>` +
    dot(32, 7, 5, T, OUTLINE) +
    `<circle cx="32" cy="37" r="8.5" fill="none" stroke="#fff" stroke-width="1" opacity="0.7"/>` +
    dot(32, 37, 5, Y, OUTLINE),
  // Two trees with branches to dodge, a kid chopping at each; chips fly.
  chopchop:
    woods +
    [17, 45].map((x) => `<rect x="${x - 4}" y="3" width="8" height="34" fill="#8b5a2b"/>`).join('') +
    `<rect x="7" y="10" width="7" height="3" rx="1" fill="#5a3a1a"/><rect x="20" y="22" width="7" height="3" rx="1" fill="#5a3a1a"/>` +
    `<rect x="35" y="8" width="7" height="3" rx="1" fill="#5a3a1a"/><rect x="48" y="18" width="7" height="3" rx="1" fill="#5a3a1a"/>` +
    `<rect x="36" y="27" width="3" height="3" fill="#ffd166"/><rect x="33" y="23" width="2.4" height="2.4" fill="#ffd166"/>` +
    kid(9, 32, T) +
    kid(53, 32, Y),
  // The rope across the mud, the red ribbon pulled most of the way to your line: you're winning.
  // The scene draws your line in the intro's colour (--c), which on a home card is the card's own
  // colour, so it is drawn here in seat 1's colour like everything else of yours.
  tugofwar:
    tug.replace('stroke:var(--c, #ffd166)', `stroke:${Y}`) +
    box(26, 25.5, 12, 4, '#e8312b', 2) +
    kid(32, 6, T) +
    kid(32, 38, Y),
  // The sea grid with one of their ships found: two hits, a miss, and your sight on the next square.
  seabattle:
    seaBg +
    sea(5, 6, 4).replace(/y="8"/g, 'y="4"').replace(/y="17"/g, 'y="13"').replace(/y="26"/g, 'y="22"').replace(/y="35"/g, 'y="31"') +
    box(15, 14, 24, 6, T, 3, OUTLINE) +
    `<rect x="14" y="13" width="8" height="8" rx="1.5" fill="#ff5c7a" opacity="0.85"/><rect x="23" y="13" width="8" height="8" rx="1.5" fill="#ff5c7a" opacity="0.85"/>` +
    dot(45, 26, 1.6, '#fff') +
    `<rect x="31.5" y="12.5" width="9" height="9" rx="2" fill="none" ${paint('stroke', Y)} stroke-width="1.6"/>` +
    path('M36 10L36 13M36 21L36 24M29 17L32 17M40 17L43 17', Y, 1.2),
  // Scissors from the top, rock from the bottom: rock wins.
  rps:
    `<rect x="1" y="1" width="62" height="42" rx="8" fill="#3a2c5c"/>` +
    hand(25, true, 'scissors', T) +
    hand(39, false, 'rock', Y),
  // Board games, hidden for now (`/?all` still shows them).
  tictactoe:
    `<rect x="1" y="1" width="62" height="42" rx="8" fill="#e9eef5"/>` +
    path('M26 5V39M38 5V39M15 16H49M15 28H49', '#14112b', 1.6) +
    path('M17 7L23 13M23 7L17 13M29 19L35 25M35 19L29 25', Y, 2.4) +
    `<circle cx="44" cy="22" r="3.4" fill="none" ${paint('stroke', T)} stroke-width="2.2"/><circle cx="32" cy="34" r="3.4" fill="none" ${paint('stroke', T)} stroke-width="2.2"/>`,
  fourinarow:
    `<rect x="1" y="1" width="62" height="42" rx="8" fill="#1e5bd0"/>` +
    Array.from({ length: 24 }, (_, i) => {
      const c = i % 6;
      const r = Math.floor(i / 6);
      const who = ['....Y.', '...TYT', '..YTYT', '.TYYTY'][r][c];
      return dot(9 + c * 9.2, 8 + r * 9.5, 3.4, who === 'Y' ? Y : who === 'T' ? T : '#0d2f73');
    }).join(''),
  checkers:
    `<rect x="1" y="1" width="62" height="42" rx="8" fill="#e8d2a8"/>` +
    Array.from({ length: 24 }, (_, i) => {
      const c = i % 6;
      const r = Math.floor(i / 6);
      return (c + r) % 2 ? `<rect x="${5 + c * 9}" y="${4 + r * 9}" width="9" height="9" fill="#6d4c41"/>` : '';
    }).join('') +
    [[18.5, 8.5], [36.5, 8.5], [27.5, 17.5]].map(([x, y]) => dot(x, y, 3.2, T, OUTLINE)).join('') +
    [[9.5, 35.5], [27.5, 35.5], [45.5, 26.5]].map(([x, y]) => dot(x, y, 3.2, Y, OUTLINE)).join(''),
};

/** True when this game has a card picture. */
export function hasCardPic(game: string): boolean {
  return !!PICS[game];
}

/** The still card picture for a game, or '' when it has none (the card shows its emoji). */
export function cardPicHtml(game: string): string {
  const body = PICS[game];
  if (!body) return '';
  return `<svg class="card-pic" data-game="${game}" viewBox="1 1 62 42" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${body}</svg>`;
}
