import { afterEach, describe, expect, it } from 'vitest';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { DT, player, power } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; max: number; size: number; player: 0 | 1 };
const box = (f: Floater) => {
  const w = Math.min(W - 16, [...f.str].length * scaledSize(f.size) * 0.55);
  return [f.x - w / 2, f.y - scaledSize(f.size) * 0.45, f.x + w / 2, f.y + scaledSize(f.size) * 0.45];
};
const readable = (f: Floater) => Math.min(1, (f.life / f.max) * 1.6) >= 0.5;
const BANNER = new Set(['FRENZY!', 'Faster snacks!']);

// F379: when FRENZY! started, the banner (bare text drawn under the pops) printed through the
// seat's "🧲 Magnet!", "Miss!" and catch pops. It now pops like the game's other words, so no
// readable pop shares its box while it is readable.
describe('Snack Snatch: no readable pop over the FRENZY! lines', () => {
  afterEach(() => setTextScale(1));
  for (const scale of [1, BIG_TEXT]) it(`in normal v easy bot matches with every power${scale === 1 ? '' : ' (Bigger text)'}`, () => {
    setTextScale(scale);
    let frames = 0;
    let over = 0;
    const hits: Record<string, number> = {};
    for (const seed of [1, 2, 3]) {
      for (const id of ['magnet', 'sticky', 'double', 'rain', 'sleepy']) {
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal', power: power('snacksnatch', id) }), player({ bot: 'easy', power: power('snacksnatch', 'magnet') })];
        const fx = new Fx();
        let ended = false;
        const view = GAMES.snacksnatch.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as { update(dt: number, i: Input): void };
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        for (let i = 0; i < 60 * 240 && !ended; i++) {
          view.update(DT, input);
          fx.update(DT);
          const live = (fx as unknown as { floaters: Floater[] }).floaters.filter(readable);
          const banners = live.filter((f) => BANNER.has(f.str));
          if (!banners.length) continue;
          frames++;
          for (const f of live) {
            if (BANNER.has(f.str)) continue;
            const fb = box(f);
            const b = banners.find((g) => { const gb = box(g); return fb[0] < gb[2] && gb[0] < fb[2] && fb[1] < gb[3] && gb[1] < fb[3]; });
            if (b) {
              over++;
              hits[`${f.str} | ${b.str}`] = (hits[`${f.str} | ${b.str}`] ?? 0) + 1;
            }
          }
        }
        expect(ended).toBe(true);
      }
    }
    console.log(`snacksnatch frenzy: ${over} readable pops over ${frames} banner frames`);
    expect(frames).toBeGreaterThan(300);
    expect(over, JSON.stringify(hits)).toBe(0);
  }, 120_000);
});
