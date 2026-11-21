import { afterEach, describe, expect, it } from 'vitest';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { DT, player, power } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };

const SHELL_WORDS = new Set(['HIT!', 'Splash', 'Hit back!']);

// F234: an Airstrike lands five shells side by side, 0.09 s apart. Each popped its own
// "HIT!"/"Splash" beside its cell, so four or five words stacked into a smear over the hit
// markers. Airstrike shells now pop no word (burst, sound, MINE! and "<ship> sunk!" stay).
describe('Sea Battle: an Airstrike pops no stack of shell words', () => {
  afterEach(() => setTextScale(1));
  for (const scale of [1, BIG_TEXT]) it(`in bot matches with Airstrike on both sides${scale === 1 ? '' : ' (Bigger text)'}`, () => {
    setTextScale(scale);
    let strikes = 0;
    let shellWords = 0;
    let overlaps = 0;
    let most = 0;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const pw = power('seabattle', 'airstrike');
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: pw }), player({ bot: level, power: pw })];
        const fx = new Fx();
        let ended = false;
        const view = GAMES.seabattle.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as { update(dt: number, i: Input): void };
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        const seenStrike = new Set<Floater>();
        const seenWord = new Set<Floater>();
        for (let i = 0; i < 60 * 600 && !ended; i++) {
          view.update(DT, input);
          fx.update(DT);
          const fl = (fx as unknown as { floaters: Floater[] }).floaters;
          for (const f of fl) {
            if (f.str.includes('Airstrike') && !seenStrike.has(f)) { seenStrike.add(f); strikes++; }
            if (SHELL_WORDS.has(f.str) && !seenWord.has(f)) { seenWord.add(f); shellWords++; }
          }
          const words = fl.filter((f) => SHELL_WORDS.has(f.str) && f.life > 0.15);
          for (const s of [0, 1]) most = Math.max(most, words.filter((f) => f.player === s).length);
          for (let a = 0; a < words.length; a++) {
            for (let b = a + 1; b < words.length; b++) {
              const p = words[a], q = words[b];
              if (p.player !== q.player) continue;
              const wa = ([...p.str].length * scaledSize(p.size) * 0.55) / 2;
              const wb = ([...q.str].length * scaledSize(q.size) * 0.55) / 2;
              if (Math.abs(p.x - q.x) < wa + wb && Math.abs(p.y - q.y) < (scaledSize(p.size) + scaledSize(q.size)) * 0.45) overlaps++;
            }
          }
        }
        expect(ended).toBe(true);
      }
    }
    console.log(`seabattle airstrike: ${strikes} strikes, ${shellWords} shell words, ${overlaps} overlapping word frames, at most ${most} shell words up at once`);
    expect(strikes).toBeGreaterThan(10);
    expect(shellWords).toBeGreaterThan(50); // single shots still say HIT!/Splash
    expect(overlaps).toBe(0);
    expect(most).toBeLessThanOrEqual(2); // a shot and a hit-back; an airstrike put up 5
  }, 120_000);
});
