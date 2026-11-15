import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { cellsOf, N, type SeaBattle } from '../src/games/seabattle/logic';
import { DT, player } from './helpers';

// Layout in the person's frame (src/games/seabattle/index.ts): big grid at GX, GY, cells of C.
const C = 27;
const GX = (360 - N * C) / 2;
const GY = 82;
const centre = (cell: number) => ({ x: GX + (cell % N) * C + C / 2, y: GY + Math.floor(cell / N) * C + C / 2 });

type View = { update(dt: number, i: Input): void; game: SeaBattle; mode: { kind: string }; picked: number | null };
type Floater = { str: string };

function setup() {
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: 'easy' })];
  const fx = new Fx();
  const sounds: string[] = [];
  const sfx = { play(n: string) { sounds.push(n); } } as unknown as Sfx;
  const view = GAMES.seabattle.create({ seed: 3, rng: makeRng(3), players, powersOn: false, sfx, fx, end() {} }) as unknown as View;
  const input = new Input();
  for (let i = 0; i < 600 && view.mode.kind !== 'place'; i++) { view.update(DT, input); input.endFrame(); }
  expect(view.mode.kind).toBe('place');
  const step = () => { view.update(DT, input); fx.update(DT); input.endFrame(); };
  const tap = (cell: number) => {
    const c = centre(cell);
    input.down(1, c.x, c.y);
    step();
    input.up(1);
    step();
  };
  const words = () => (fx as unknown as { floaters: Floater[] }).floaters.map((f) => f.str);
  return { view, tap, words, sounds };
}

/** A clear spot for ship i (same direction): its middle on an empty cell far from where it is. */
function openSpot(g: SeaBattle, i: number): number {
  const sea = g.seas[0];
  const s = sea.ships[i];
  const mid = Math.floor((s.len - 1) / 2);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const tx = s.horiz ? x - mid : x;
      const ty = s.horiz ? y : y - mid;
      if (Math.abs(tx - s.x) + Math.abs(ty - s.y) < 2) continue;
      if (g.canPlace(0, i, tx, ty, s.horiz)) return y * N + x;
    }
  throw new Error('no open spot');
}

// F269: NN/g kids' UX research: under-9s struggle with precise drag-and-drop; give them a
// tap-a-destination way too. Tap a ship (it turns, as before, and stays picked), tap water to move it.
describe('Sea Battle placement: tap a ship, then tap a spot', () => {
  it('moves the picked ship to the tapped water, keeping its direction', () => {
    const { view, tap, words } = setup();
    const g = view.game;
    const sea = g.seas[0];
    const i = 0;
    tap(cellsOf(sea.ships[i])[0]);
    expect(view.picked).toBe(i);
    const s = sea.ships[i];
    const horiz = s.horiz;
    const spot = openSpot(g, i);
    tap(spot);
    expect(cellsOf(s), 'the ship now covers the tapped square').toContain(spot);
    expect(s.horiz).toBe(horiz);
    expect(view.picked, 'it stays picked, so a second tap can nudge it again').toBe(i);
    expect(words()).not.toContain("Doesn't fit there");
  });

  it('a tap on water with no ship picked does nothing', () => {
    const { view, tap } = setup();
    const sea = view.game.seas[0];
    const before = JSON.stringify(sea.ships);
    const empty = [...Array(N * N).keys()].find((c) => sea.occ[c] < 0)!;
    tap(empty);
    expect(JSON.stringify(sea.ships)).toBe(before);
    expect(view.picked).toBeNull();
  });

  it('a spot where it cannot go buzzes and pops "Doesn\'t fit there"; the ship stays put', () => {
    const { view, tap, words, sounds } = setup();
    const g = view.game;
    const sea = g.seas[0];
    // Pick the longest ship, then tap a square where no slide of it fits (if any exists).
    const i = sea.ships.reduce((b, s, k) => (s.len > sea.ships[b].len ? k : b), 0);
    tap(cellsOf(sea.ships[i])[0]);
    const s = sea.ships[i];
    const bad = [...Array(N * N).keys()].find((c) => {
      if (sea.occ[c] >= 0) return false;
      const cx = c % N;
      const cy = Math.floor(c / N);
      for (let k = 0; k < s.len; k++) if (g.canPlace(0, i, s.horiz ? cx - k : cx, s.horiz ? cy : cy - k, s.horiz)) return false;
      return true;
    });
    expect(bad, 'seed 3 leaves a square the longest ship cannot cover').toBeDefined();
    const before = { x: s.x, y: s.y, horiz: s.horiz };
    tap(bad!);
    expect({ x: s.x, y: s.y, horiz: s.horiz }).toEqual(before);
    expect(sounds).toContain('buzz');
    expect(words()).toContain("Doesn't fit there");
  });
});
