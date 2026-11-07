// A short looping picture of what a power does, for kids who picked a power
// without reading its line. Drawn in code (inline SVG with SMIL animations, no
// assets), ~2 s a loop. "You" are drawn in the seat colour (`--c` on the half),
// the other player in grey. Shown on the mid-match "How to play" screen beside
// the picked power. Started with the three free games; other games show none
// until they get pictures (see docs/backlog.md).

const DUR = '2s';
const YOU = 'var(--c, #ffd166)';
const THEM = '#b8b4cc';
const LINE = 'rgba(255,255,255,0.55)';

/** One animated attribute: `values` at evenly spread key times unless `times` is given. */
function anim(attr: string, values: (string | number)[], times?: number[]): string {
  const kt = times ?? values.map((_, i) => +(i / (values.length - 1)).toFixed(3));
  return `<animate attributeName="${attr}" dur="${DUR}" repeatCount="indefinite" values="${values.join(';')}" keyTimes="${kt.join(';')}"/>`;
}

const circle = (cx: number, cy: number, r: number, fill: string, kids = '', extra = '') =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" ${fill.startsWith('var(') ? `style="fill:${fill}"` : `fill="${fill}"`}${extra}>${kids}</circle>`;

// Minigolf: a green with the cup near the top.
const green = `<rect x="1" y="1" width="62" height="42" rx="8" fill="#1f7a4a"/>${circle(32, 9, 4, '#0b2a18')}`;
// Air hockey: a table with a goal slot at each end.
const table = `<rect x="1" y="1" width="62" height="42" rx="8" fill="#1d3a5c"/><line x1="4" y1="22" x2="60" y2="22" stroke="${LINE}" stroke-width="1"/><rect x="22" y="1" width="20" height="3" rx="1.5" fill="#0a1626"/><rect x="22" y="40" width="20" height="3" rx="1.5" fill="#0a1626"/>`;
// Sumo: the ring from above.
const ring = `<rect x="1" y="1" width="62" height="42" rx="8" fill="#5a3a22"/><circle cx="32" cy="22" r="19" fill="#c9a66b" stroke="#fff" stroke-opacity="0.7" stroke-width="1.5"/>`;

const PICS: Record<string, Record<string, string>> = {
  minigolf: {
    // The other player's shot heads for the cup, a gust blows it past.
    wind:
      green +
      circle(12, 36, 3, YOU) +
      [10, 20, 30].map((y, i) =>
        `<line x1="0" y1="${y}" x2="10" y2="${y}" stroke="#fff" stroke-width="1.5" stroke-linecap="round">${anim('opacity', [0, 0, 0.9, 0.9, 0, 0], [0, 0.25 + i * 0.03, 0.35 + i * 0.03, 0.7, 0.8, 1])}${anim('x1', [0, 0, 54, 54], [0, 0.25 + i * 0.03, 0.75, 1])}${anim('x2', [10, 10, 64, 64], [0, 0.25 + i * 0.03, 0.75, 1])}</line>`,
      ).join('') +
      circle(32, 38, 3, THEM, anim('cx', [32, 32, 34, 46, 50, 50], [0, 0.15, 0.35, 0.65, 0.8, 1]) + anim('cy', [38, 38, 26, 14, 10, 10], [0, 0.15, 0.35, 0.65, 0.8, 1]) + anim('opacity', [1, 1, 1, 0], [0, 0.85, 0.9, 1])),
    // Your shot stops short; the cup's pull reels it in.
    magnet:
      green +
      `<circle cx="32" cy="9" r="5" fill="none" stroke="#ffd166" stroke-width="1.5">${anim('r', [5, 5, 16, 5], [0, 0.4, 0.75, 1])}${anim('opacity', [0, 0, 0.9, 0, 0], [0, 0.4, 0.5, 0.8, 1])}</circle>` +
      circle(32, 38, 3, YOU, anim('cy', [38, 38, 22, 22, 9, 9], [0, 0.1, 0.4, 0.5, 0.75, 1]) + anim('r', [3, 3, 3, 3, 2, 2], [0, 0.1, 0.4, 0.5, 0.75, 1]) + anim('opacity', [1, 1, 1, 0], [0, 0.85, 0.9, 1])),
    // Your shot floats through a wall.
    ghost:
      green +
      `<rect x="14" y="20" width="36" height="5" rx="2" fill="#e8e2d0"/>` +
      circle(32, 38, 3, YOU, anim('cy', [38, 38, 9, 9], [0, 0.1, 0.75, 1]) + anim('opacity', [1, 1, 0.35, 0.35, 1, 1, 0], [0, 0.3, 0.38, 0.52, 0.6, 0.85, 1])),
  },
  airhockey: {
    // The other paddle slides, turns to ice and stops; the puck goes in.
    freeze:
      table +
      circle(32, 10, 6, THEM, anim('cx', [20, 44, 32, 32, 32], [0, 0.2, 0.35, 0.9, 1]) + anim('fill', [THEM, THEM, '#8fdcff', '#8fdcff', THEM], [0, 0.34, 0.36, 0.9, 1]), ' stroke="#fff" stroke-opacity="0.6"') +
      circle(32, 34, 3, '#fff', anim('cx', [32, 32, 46, 46], [0, 0.45, 0.8, 1]) + anim('cy', [34, 34, 2, 2], [0, 0.45, 0.8, 1]) + anim('opacity', [1, 1, 0, 0], [0, 0.78, 0.82, 1])) +
      circle(32, 36, 6, YOU),
    // Your paddle grows huge, then shrinks back.
    giant:
      table +
      circle(32, 10, 6, THEM) +
      circle(32, 34, 6, YOU, anim('r', [6, 6, 12, 12, 6], [0, 0.2, 0.35, 0.85, 1])),
    // The puck splits in two; either can score.
    split:
      table +
      circle(32, 8, 6, THEM) +
      circle(32, 36, 6, YOU) +
      [-1, 1].map((d) => circle(32, 28, 3, '#fff', anim('cx', [32, 32, 32 + d * 8, 32 + d * 8], [0, 0.35, 0.85, 1]) + anim('cy', [28, 22, 4, 4], [0, 0.35, 0.85, 1]) + anim('opacity', [1, 1, 1, 0], [0, 0.8, 0.85, 1]))).join(''),
  },
  sumo: {
    // Stomp: a shockwave shoves the other wrestler away.
    pound:
      ring +
      `<circle cx="24" cy="22" r="7" fill="none" stroke="#fff" stroke-width="2">${anim('r', [7, 7, 22, 22], [0, 0.25, 0.55, 1])}${anim('opacity', [0, 0.9, 0, 0], [0, 0.26, 0.55, 1])}</circle>` +
      circle(24, 22, 7, YOU, anim('r', [7, 8, 6, 7, 7], [0, 0.15, 0.25, 0.35, 1])) +
      circle(40, 22, 7, THEM, anim('cx', [36, 36, 48, 48, 36], [0, 0.3, 0.55, 0.85, 1])),
    // Grow big and heavy, nudging the other wrestler back.
    grow:
      ring +
      circle(40, 22, 7, THEM, anim('cx', [40, 40, 46, 46, 40], [0, 0.2, 0.4, 0.8, 1])) +
      circle(24, 22, 7, YOU, anim('r', [7, 7, 12, 12, 7], [0, 0.2, 0.4, 0.8, 1])),
    // The floor turns slippery: the other wrestler slides around.
    slip:
      ring +
      [[38, 30], [46, 16], [30, 12]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="2" fill="none" stroke="#fff" stroke-width="1">${anim('opacity', [0, 0.9, 0], [0, 0.3 + i * 0.15, 1])}${anim('r', [1, 3, 3], [0, 0.3 + i * 0.15, 1])}</circle>`).join('') +
      circle(24, 22, 7, YOU) +
      circle(40, 22, 7, THEM, anim('cx', [40, 46, 36, 46, 40], [0, 0.25, 0.5, 0.75, 1]) + anim('cy', [22, 16, 28, 26, 22], [0, 0.25, 0.5, 0.75, 1])),
  },
};

/** True when this game's power has a picture. */
export function hasPowerPic(game: string, power: string): boolean {
  return !!PICS[game]?.[power];
}

/** The looping picture for a power, or '' when it has none yet. */
export function powerPicHtml(game: string, power: string): string {
  const body = PICS[game]?.[power];
  if (!body) return '';
  return `<svg class="power-pic" data-power="${power}" viewBox="0 0 64 44" width="64" height="44" aria-hidden="true">${body}</svg>`;
}
