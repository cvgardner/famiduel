// A short looping picture of what a power does, for kids who picked a power
// without reading its line. Drawn in code (inline SVG with SMIL animations, no
// assets), ~2 s a loop. "You" are drawn in the seat colour (`--c` on the half),
// the other player in grey. Shown on the mid-match "How to play" screen beside
// the picked power and on the intro once a power is picked. Every shown game's
// powers have one; a new power needs one too (tests/powerpic.test.ts).

import { onReducedMotionChange, reducedMotion } from '../engine/calm';

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

const rect = (x: number, y: number, w: number, h: number, fill: string, kids = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" ${fill.startsWith('var(') ? `style="fill:${fill}"` : `fill="${fill}"`}>${kids}</rect>`;

// Ping Pong: a table with the net across the middle.
const pong = `<rect x="1" y="1" width="62" height="42" rx="8" fill="#1b6b5a"/><rect x="8" y="4" width="48" height="36" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="1"/><line x1="4" y1="22" x2="60" y2="22" stroke="#fff" stroke-width="2"/>`;
// Penalty: grass with a goal at the top.
const pitch = `<rect x="1" y="1" width="62" height="42" rx="8" fill="#2f8f46"/><rect x="14" y="2" width="36" height="9" fill="none" stroke="#fff" stroke-width="1.5"/>`;
// Snack Snatch: a mat with your critter's mouth at the bottom.
const mat = `<rect x="1" y="1" width="62" height="42" rx="8" fill="#3a2c5c"/>`;

// Tanks: a dark arena.
const arena = `<rect x="1" y="1" width="62" height="42" rx="8" fill="#2c3b2e" stroke="#7f8f7a" stroke-width="2"/>`;
// Snake: a dark board.
const board = `<rect x="1" y="1" width="62" height="42" rx="8" fill="#14202c"/>`;
// Chop Chop: sky with two trees, theirs on the left, yours on the right.
const woods = `<rect x="1" y="1" width="62" height="42" rx="8" fill="#9fd3f0"/><rect x="1" y="36" width="62" height="7" rx="3" fill="#5aa04a"/>`;
// Quick Draw: sand with the signal in the middle.
const sand = `<rect x="1" y="1" width="62" height="42" rx="8" fill="#e8b878"/><line x1="4" y1="22" x2="60" y2="22" stroke="#b07a40" stroke-width="1" stroke-dasharray="4 3"/>`;
// Sea Battle: a strip of sea cells.
const sea = (x0: number, n: number, rows: number) =>
  Array.from({ length: n * rows }, (_, i) => `<rect x="${x0 + (i % n) * 9}" y="${8 + Math.floor(i / n) * 9}" width="8" height="8" rx="1.5" fill="#1d4f7a"/>`).join('');
const seaBg = `<rect x="1" y="1" width="62" height="42" rx="8" fill="#0f2c48"/>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w: number, kids = '', extra = '') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${stroke.startsWith('var(') ? `style="stroke:${stroke}"` : `stroke="${stroke}"`} stroke-width="${w}" stroke-linecap="round"${extra}>${kids}</line>`;
const tank = (x: number, y: number, fill: string, kids = '') => rect(x - 5, y - 4, 10, 8, fill, kids);
// A trunk with a kid (a dot in the seat colour) beside it.
const tree = (x: number, fill: string) => `<rect x="${x - 4}" y="6" width="8" height="31" fill="${fill}"/>`;

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
  pingpong: {
    // Your return flies super fast, leaving a streak.
    smash:
      pong +
      rect(26, 4, 12, 3, THEM) +
      rect(24, 37, 16, 4, YOU) +
      `<line x1="32" y1="34" x2="32" y2="34" stroke="#ffd166" stroke-width="3" stroke-linecap="round">${anim('y2', [34, 34, 8, 8], [0, 0.3, 0.42, 1])}${anim('opacity', [0, 0, 0.9, 0, 0], [0, 0.3, 0.42, 0.6, 1])}</line>` +
      circle(32, 34, 2.5, '#fff', anim('cy', [12, 33, 33, 8, 8], [0, 0.28, 0.3, 0.42, 1]) + anim('opacity', [1, 1, 1, 1, 0, 0], [0, 0.3, 0.42, 0.5, 0.55, 1])),
    // The ball slows right down as it comes to you.
    slowmo:
      pong +
      rect(26, 4, 12, 3, THEM) +
      rect(24, 37, 16, 4, YOU) +
      `<rect x="9" y="23" width="46" height="16" fill="#8fdcff">${anim('opacity', [0, 0, 0.25, 0.25, 0], [0, 0.2, 0.25, 0.9, 1])}</rect>` +
      circle(32, 8, 2.5, '#fff', anim('cy', [8, 22, 28, 33, 34], [0, 0.2, 0.55, 0.9, 1])),
    // Your return bends away from the other paddle.
    curve:
      pong +
      rect(16, 4, 12, 3, THEM) +
      rect(24, 37, 16, 4, YOU) +
      circle(32, 34, 2.5, '#fff', anim('cx', [32, 32, 24, 34, 50, 50], [0, 0.15, 0.35, 0.55, 0.75, 1]) + anim('cy', [34, 34, 26, 16, 6, 6], [0, 0.15, 0.35, 0.55, 0.75, 1]) + anim('opacity', [1, 1, 1, 0, 0], [0, 0.75, 0.8, 0.85, 1])),
  },
  penalty: {
    // Your shot swings out wide, then bends back on target past the keeper.
    curveshot:
      pitch +
      rect(26, 8, 12, 4, THEM) +
      circle(32, 38, 3, YOU, anim('cx', [32, 32, 50, 54, 44, 44], [0, 0.15, 0.4, 0.55, 0.75, 1]) + anim('cy', [38, 38, 28, 18, 7, 7], [0, 0.15, 0.4, 0.55, 0.75, 1]) + anim('opacity', [1, 1, 1, 0], [0, 0.88, 0.92, 1])),
    // Your keeper spreads extra wide and blocks the shot.
    widekeeper:
      pitch +
      rect(26, 7, 12, 4, YOU, anim('x', [26, 26, 18, 18, 26], [0, 0.15, 0.3, 0.85, 1]) + anim('width', [12, 12, 28, 28, 12], [0, 0.15, 0.3, 0.85, 1])) +
      circle(40, 38, 3, THEM, anim('cx', [40, 40, 42, 40, 40], [0, 0.3, 0.55, 0.8, 1]) + anim('cy', [38, 38, 12, 24, 24], [0, 0.3, 0.55, 0.8, 1]) + anim('opacity', [1, 1, 1, 1, 0], [0, 0.3, 0.55, 0.85, 1])),
    // Your shot sends a fake ball too; the keeper dives for the wrong one.
    decoy:
      pitch +
      rect(26, 8, 12, 4, THEM, anim('x', [26, 26, 16, 16], [0, 0.4, 0.6, 1])) +
      circle(32, 38, 3, YOU, anim('cx', [32, 32, 46, 46], [0, 0.15, 0.6, 1]) + anim('cy', [38, 38, 7, 7], [0, 0.15, 0.6, 1]) + anim('opacity', [1, 1, 1, 0], [0, 0.85, 0.9, 1])) +
      circle(32, 38, 3, YOU, anim('cx', [32, 32, 20, 20], [0, 0.15, 0.6, 1]) + anim('cy', [38, 38, 7, 7], [0, 0.15, 0.6, 1]) + anim('opacity', [0, 0, 0.6, 0.6, 0, 0], [0, 0.14, 0.16, 0.6, 0.7, 1]), ' stroke="#fff" stroke-dasharray="2 2"'),
  },
  snacksnatch: {
    // Snacks drift toward your critter.
    magnet:
      mat +
      rect(22, 34, 20, 8, YOU) +
      [[10, 8], [54, 12], [30, 4]].map(([x, y], i) => circle(x, y, 3, '#ffb347', anim('cx', [x, x, 32, 32], [0, 0.1 + i * 0.08, 0.75, 1]) + anim('cy', [y, y, 33, 33], [0, 0.1 + i * 0.08, 0.75, 1]) + anim('opacity', [1, 1, 1, 0, 0], [0, 0.7, 0.75, 0.8, 1]))).join(''),
    // Snacks slow right down on your side.
    sticky:
      mat +
      `<rect x="2" y="22" width="60" height="20" rx="6" fill="#ffd166" opacity="0.18"/>` +
      rect(22, 34, 20, 8, YOU) +
      [14, 32, 50].map((x, i) => circle(x, 2, 3, '#ffb347', anim('cy', [2, 2, 22, 30, 30], [0, i * 0.1, 0.2 + i * 0.1, 0.9, 1]))).join(''),
    // Your next snaps reach twice as far.
    double:
      mat +
      circle(32, 6, 3, '#ffb347', anim('opacity', [1, 1, 0, 0, 1], [0, 0.55, 0.6, 0.9, 1])) +
      `<line x1="32" y1="34" x2="32" y2="34" stroke="#ff7eb3" stroke-width="4" stroke-linecap="round">${anim('y2', [34, 34, 22, 22, 34, 34, 7, 34, 34], [0, 0.1, 0.2, 0.25, 0.32, 0.4, 0.55, 0.7, 1])}</line>` +
      rect(22, 34, 20, 8, YOU),
  },
  tanks: {
    // Your shells glow and bounce off the walls.
    bouncy:
      arena +
      tank(12, 34, YOU) +
      tank(50, 10, THEM) +
      circle(16, 31, 2.5, '#ffd166', anim('cx', [16, 16, 60, 40, 22, 22], [0, 0.1, 0.4, 0.6, 0.85, 1]) + anim('cy', [31, 31, 18, 3, 18, 18], [0, 0.1, 0.4, 0.6, 0.85, 1]) + anim('opacity', [1, 1, 1, 1, 0, 0], [0, 0.1, 0.6, 0.85, 0.9, 1]), ' stroke="#fff" stroke-width="1"'),
    // A bubble round you blocks the other tank's shell.
    shield:
      arena +
      tank(50, 10, THEM) +
      tank(14, 32, YOU) +
      `<circle cx="14" cy="32" r="10" fill="#8fdcff" fill-opacity="0.25" stroke="#8fdcff" stroke-width="1.5">${anim('opacity', [0, 0, 1, 1, 0], [0, 0.15, 0.25, 0.9, 1])}</circle>` +
      circle(45, 13, 2, '#fff', anim('cx', [45, 45, 23, 23], [0, 0.3, 0.65, 1]) + anim('cy', [13, 13, 26, 26], [0, 0.3, 0.65, 1]) + anim('opacity', [1, 1, 1, 0, 0], [0, 0.3, 0.65, 0.7, 1])),
    // Drop a blinking mine; it goes off under the other tank.
    mine:
      arena +
      circle(30, 30, 3, '#ff5c7a', anim('opacity', [0, 0, 1, 0.3, 1, 0.3, 1, 0, 0], [0, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.66, 1])) +
      `<circle cx="30" cy="30" r="3" fill="none" stroke="#ffd166" stroke-width="2">${anim('r', [3, 3, 14, 14], [0, 0.62, 0.8, 1])}${anim('opacity', [0, 0, 1, 0, 0], [0, 0.62, 0.64, 0.8, 1])}</circle>` +
      tank(30, 30, YOU, anim('x', [25, 25, 7, 7], [0, 0.1, 0.35, 1])) +
      tank(54, 30, THEM, anim('x', [49, 49, 25, 25, 49], [0, 0.35, 0.62, 0.95, 1])),
  },
  snake: {
    // Your snake zooms faster.
    boost:
      board +
      line(6, 30, 6, 30, YOU, 4, anim('x1', [6, 6, 12, 36, 36], [0, 0.05, 0.45, 0.75, 1]) + anim('x2', [14, 14, 26, 58, 58], [0, 0.05, 0.45, 0.75, 1]) + anim('opacity', [1, 1, 1, 1, 0], [0, 0.45, 0.75, 0.85, 1])) +
      [24, 30, 36].map((y) => line(10, y, 18, y, '#ffd166', 1.5, anim('opacity', [0, 0, 0.9, 0, 0], [0, 0.45, 0.55, 0.75, 1]))).join('') +
      line(4, 12, 40, 12, THEM, 4),
    // Pass through one trail.
    phase:
      board +
      line(32, 4, 32, 40, THEM, 4) +
      line(8, 22, 8, 22, YOU, 4, anim('x1', [8, 8, 30, 30], [0, 0.05, 0.85, 1]) + anim('x2', [16, 16, 56, 56], [0, 0.05, 0.85, 1]) + anim('opacity', [1, 1, 0.4, 0.4, 1, 1, 0], [0, 0.3, 0.38, 0.55, 0.62, 0.85, 1])),
    // Blow a gap in the trails round your head.
    bomb:
      board +
      line(36, 4, 36, 15, THEM, 4) +
      line(36, 29, 36, 40, THEM, 4) +
      line(36, 15, 36, 29, THEM, 4, anim('opacity', [1, 1, 0, 0, 1], [0, 0.35, 0.4, 0.9, 1])) +
      line(6, 22, 28, 22, YOU, 4) +
      `<circle cx="30" cy="22" r="3" fill="none" stroke="#ffd166" stroke-width="2.5">${anim('r', [3, 3, 14, 14], [0, 0.3, 0.5, 1])}${anim('opacity', [0, 0, 1, 0, 0], [0, 0.3, 0.32, 0.5, 1])}</circle>`,
  },
  chopchop: {
    // A falling branch breaks on you instead of bonking you: mash away.
    shield:
      woods +
      tree(32, '#8b5a2b') +
      `<circle cx="44" cy="31" r="8" fill="#ffd166" fill-opacity="0.2" stroke="#ffd166" stroke-width="1.5">${anim('opacity', [0, 0, 1, 1, 0], [0, 0.1, 0.2, 0.9, 1])}</circle>` +
      rect(36, 10, 14, 3, '#5a3a1a', anim('y', [4, 4, 22, 22, 4], [0, 0.25, 0.5, 0.55, 1]) + anim('opacity', [0, 1, 1, 0, 0], [0, 0.25, 0.5, 0.56, 1])) +
      [-1, 1].map((d) => rect(41, 22, 5, 3, '#5a3a1a', anim('x', [41, 41, 41 + d * 12, 41 + d * 12], [0, 0.5, 0.7, 1]) + anim('y', [22, 22, 30, 30], [0, 0.5, 0.7, 1]) + anim('opacity', [0, 0, 1, 0, 0], [0, 0.5, 0.52, 0.75, 1]))).join('') +
      circle(44, 31, 4, YOU),
    // The other tree freezes: no chopping for a moment.
    freeze:
      woods +
      `<rect x="14" y="6" width="8" height="31" fill="#8b5a2b">${anim('fill', ['#8b5a2b', '#8b5a2b', '#8fdcff', '#8fdcff', '#8b5a2b'], [0, 0.2, 0.25, 0.85, 1])}</rect>` +
      tree(46, '#8b5a2b') +
      circle(10, 31, 4, THEM) +
      circle(40, 31, 4, YOU, anim('cx', [40, 41, 40, 41, 40, 41, 40], [0, 0.15, 0.3, 0.45, 0.6, 0.75, 1])),
    // Your next chops count twice.
    double:
      woods +
      tree(32, '#8b5a2b') +
      // Each chop knocks out two logs.
      [0, 0.45].flatMap((t0) => [28, 18].map((y) => `<rect x="28" y="${y}" width="8" height="8" fill="#ffd166" stroke="#8b5a2b" stroke-width="1">${anim('x', [28, 28, 4, 4], [0, t0 + 0.05, t0 + 0.3, 1])}${anim('opacity', [0, 0, 1, 1, 0, 0], [0, t0 + 0.05, t0 + 0.07, t0 + 0.22, t0 + 0.3, 1])}</rect>`)).join('') +
      circle(44, 31, 4, YOU, anim('cx', [44, 44, 40, 44, 44, 40, 44, 44], [0, 0.03, 0.06, 0.1, 0.48, 0.51, 0.55, 1])),
  },
  quickdraw: {
    // A fake signal that only you know is fake: the other player jumps the gun.
    fakeout:
      sand +
      `<circle cx="32" cy="22" r="7" fill="#ff5c7a" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 2">${anim('opacity', [0, 0, 1, 1, 0, 0], [0, 0.2, 0.25, 0.6, 0.65, 1])}</circle>` +
      circle(32, 7, 5, THEM, anim('r', [5, 5, 4, 5, 5], [0, 0.35, 0.4, 0.45, 1]) + anim('fill', [THEM, THEM, '#ff5c7a', '#ff5c7a', THEM], [0, 0.39, 0.4, 0.8, 1])) +
      circle(32, 37, 5, YOU),
    // Your side glows "get ready" just before the signal.
    slowtime:
      sand +
      `<rect x="2" y="23" width="60" height="19" rx="6" fill="#ffd166">${anim('opacity', [0, 0, 0.45, 0.15, 0.45, 0, 0], [0, 0.2, 0.3, 0.4, 0.5, 0.56, 1])}</rect>` +
      `<circle cx="32" cy="22" r="7" fill="#5eead4" stroke="#fff" stroke-width="1.5">${anim('opacity', [0, 0, 1, 1, 0], [0, 0.55, 0.57, 0.9, 1])}</circle>` +
      circle(32, 7, 5, THEM) +
      circle(32, 37, 5, YOU, anim('r', [5, 5, 4, 5, 5], [0, 0.58, 0.61, 0.65, 1])),
    // One early tap is forgiven.
    double:
      sand +
      `<circle cx="32" cy="37" r="9" fill="none" stroke="#ffd166" stroke-width="1.5">${anim('opacity', [1, 1, 0, 0, 1], [0, 0.25, 0.3, 0.9, 1])}</circle>` +
      `<circle cx="32" cy="22" r="7" fill="#5eead4" stroke="#fff" stroke-width="1.5">${anim('opacity', [0, 0, 1, 1, 0], [0, 0.55, 0.57, 0.9, 1])}</circle>` +
      circle(32, 7, 5, THEM) +
      circle(32, 37, 5, YOU, anim('r', [5, 5, 4, 5, 5, 4, 5, 5], [0, 0.2, 0.23, 0.27, 0.6, 0.63, 0.67, 1])),
  },
  seabattle: {
    // Scan a 3x3 patch: a hidden ship shows up.
    radar:
      seaBg +
      sea(5, 6, 3) +
      `<rect x="13" y="7" width="28" height="28" rx="3" style="fill:${YOU};stroke:${YOU}" fill-opacity="0.2" stroke-width="1.5">${anim('x', [3, 3, 13, 22, 22], [0, 0.1, 0.4, 0.6, 1])}${anim('opacity', [0, 1, 1, 1, 0], [0, 0.1, 0.6, 0.9, 1])}</rect>` +
      `<rect x="32" y="17" width="8" height="8" rx="1.5" fill="#b8b4cc">${anim('opacity', [0, 0, 1, 1, 0], [0, 0.6, 0.65, 0.9, 1])}</rect>`,
    // Hit 5 cells of a row at once.
    airstrike:
      seaBg +
      sea(5, 6, 3) +
      [0, 1, 2, 3, 4].map((i) => `<rect x="${5 + i * 9}" y="17" width="8" height="8" rx="1.5" fill="#ff5c7a">${anim('opacity', [0, 0, 1, 1, 0], [0, 0.25 + i * 0.08, 0.27 + i * 0.08, 0.9, 1])}</rect>`).join('') +
      rect(0, 18, 8, 6, YOU, anim('x', [-8, -8, 60, 60], [0, 0.2, 0.7, 1])),
    // A hidden mine in your sea: whoever fires on it gets one of their own ships hit.
    mine:
      seaBg +
      sea(4, 3, 3) +
      sea(36, 3, 3) +
      `<rect x="2" y="5" width="30" height="32" rx="4" fill="none" style="stroke:${YOU}" stroke-width="1.5"/>` +
      circle(17, 21, 2.5, '#ffd166') +
      `<circle cx="17" cy="21" r="3" fill="none" stroke="#ff5c7a" stroke-width="2">${anim('r', [3, 3, 12, 12], [0, 0.3, 0.5, 1])}${anim('opacity', [0, 0, 1, 0, 0], [0, 0.3, 0.32, 0.5, 1])}</circle>` +
      `<rect x="45" y="17" width="8" height="8" rx="1.5" fill="#ff5c7a">${anim('opacity', [0, 0, 1, 1, 0], [0, 0.55, 0.6, 0.9, 1])}</rect>`,
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

/** Seconds into the 2 s loop shown when the phone asks for reduced motion: mid-action. */
export const STILL_AT = 1;

/** Freeze (or, with `still` false, restart) every power picture under root. */
export function holdPicsStill(root: ParentNode, still = true): void {
  root.querySelectorAll<SVGSVGElement>('svg.power-pic').forEach((svg) => {
    if (still) {
      svg.pauseAnimations();
      svg.setCurrentTime(STILL_AT);
      svg.dataset.still = '1';
    } else if (svg.dataset.still) {
      delete svg.dataset.still;
      svg.unpauseAnimations();
    }
  });
}

/**
 * With reduce motion on, every power picture the app puts on screen (intro, How to play)
 * holds still on one frame; turning the setting off mid-session sets them moving again.
 */
export function watchPowerPics(root: HTMLElement): void {
  if (typeof MutationObserver !== 'function') return;
  const sync = () => holdPicsStill(root, reducedMotion());
  new MutationObserver(() => {
    if (reducedMotion() && root.querySelector('svg.power-pic:not([data-still])')) holdPicsStill(root);
  }).observe(root, { childList: true, subtree: true });
  onReducedMotionChange(sync);
  sync();
}
