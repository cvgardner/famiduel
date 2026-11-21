import { afterEach, describe, expect, it } from 'vitest';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; max: number; size: number; player: 0 | 1 };
const box = (f: Floater) => {
  const w = Math.min(W - 16, [...f.str].length * scaledSize(f.size) * 0.55);
  return [f.x - w / 2, f.y - scaledSize(f.size) * 0.45, f.x + w / 2, f.y + scaledSize(f.size) * 0.45];
};
const readable = (f: Floater) => Math.min(1, (f.life / f.max) * 1.6) >= 0.5;
const WORDS = new Set(['SUDDEN SNACK!', 'First to gulp the gold wins']);

// F380: SUDDEN SNACK! was bare text under the pops for the whole sudden snack, so Miss!, power
// names and the winning gulp's pop printed through it. It now pops once like the game's other
// words, so no readable pop shares its box while it is readable.
describe('Snack Snatch: no readable pop over the SUDDEN SNACK! lines', () => {
  afterEach(() => setTextScale(1));
  for (const scale of [1, BIG_TEXT]) it(`in mirror bot matches that reach a sudden snack${scale === 1 ? '' : ' (Bigger text)'}`, () => {
    setTextScale(scale);
    let sudden = 0;
    let frames = 0;
    let over = 0;
    const hits: Record<string, number> = {};
    for (let seed = 1; seed <= 400 && sudden < 8; seed++) {
      const level = (['easy', 'normal', 'hard'] as const)[seed % 3];
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: level }), player({ bot: level })];
      const fx = new Fx();
      let ended = false;
      const view = GAMES.snacksnatch.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as { update(dt: number, i: Input): void; game: { sudden: boolean } };
      const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
      let reached = false;
      for (let i = 0; i < 60 * 240 && !ended; i++) {
        view.update(DT, input);
        fx.update(DT);
        if (view.game.sudden) reached = true;
        const live = (fx as unknown as { floaters: Floater[] }).floaters.filter(readable);
        const words = live.filter((f) => WORDS.has(f.str));
        if (!words.length) continue;
        frames++;
        for (const f of live) {
          if (WORDS.has(f.str)) continue;
          const fb = box(f);
          const b = words.find((g) => { const gb = box(g); return fb[0] < gb[2] && gb[0] < fb[2] && fb[1] < gb[3] && gb[1] < fb[3]; });
          if (b) {
            over++;
            hits[`${f.str} | ${b.str}`] = (hits[`${f.str} | ${b.str}`] ?? 0) + 1;
          }
        }
      }
      if (reached) sudden++;
    }
    console.log(`snacksnatch sudden: ${sudden} matches, ${over} readable pops over ${frames} frames`);
    expect(sudden).toBeGreaterThanOrEqual(8);
    expect(over, JSON.stringify(hits)).toBe(0);
  }, 120_000);
});
