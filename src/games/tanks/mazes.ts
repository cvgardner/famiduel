// Tank Duel arenas, as data. Each layout lists only the top half (player 1's
// side, rows 0–5, '#' = toy block). The bottom half is the same half turned
// 180°, so both players always get exactly the same arena from their seat.
// Keep row 0 / columns 4–5 open: that is the spawn spot. Keep column 0 of
// rows 5–6 open: the pause button sits over it.

export const COLS = 10;
export const ROWS = 12;

export type Layout = { name: string; block: string; floor: string; top: string[] };

export const LAYOUTS: Layout[] = [
  {
    name: 'Blocks',
    block: '#ff8a65',
    floor: '#fff4dc',
    top: ['..........', '.##....##.', '..........', '...#..#...', '.#......#.', '....##....'],
  },
  {
    name: 'Lanes',
    block: '#4fc3f7',
    floor: '#eef8ff',
    top: ['..........', '...#..#...', '.#.#..#.#.', '.#......#.', '...####...', '.......#..'],
  },
  {
    name: 'Zigzag',
    block: '#ba68c8',
    floor: '#f8efff',
    top: ['..........', '......###.', '.##.......', '...#..##..', '...#......', '..##...#..'],
  },
  {
    name: 'Bunkers',
    block: '#81c784',
    floor: '#f0fbe9',
    top: ['..........', '.#.#..#.#.', '.#......#.', '....##....', '.##....##.', '..........'],
  },
  {
    name: 'Rooms',
    block: '#ffb74d',
    floor: '#fff7e6',
    top: ['..........', '.###..###.', '.#......#.', '.#.#..#.#.', '...#..#...', '.....#....'],
  },
];

/** Full grid, row-major: true = solid block. */
export function buildGrid(layout: Layout): boolean[] {
  const half = layout.top;
  const rows: string[] = [...half];
  for (let r = half.length; r < ROWS; r++) rows.push([...half[ROWS - 1 - r]].reverse().join(''));
  const grid: boolean[] = [];
  for (const row of rows) for (let c = 0; c < COLS; c++) grid.push(row[c] === '#');
  return grid;
}
