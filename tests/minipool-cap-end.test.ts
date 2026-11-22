// F443: a rack that hits the shot cap ended with "<name> has fewer left" and a result line
// "Fewer balls left", which never said why the rack stopped. It now pops "Out of shots!" and
// then who won it, each on its own seat's half and clear of each other, at 1x and Bigger text.
import { afterEach, describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { GameResult, PlayerInfo } from '../src/core/types';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { MID } from '../src/engine/world';
import { RULES, type MiniPool } from '../src/games/minipool/logic';
import { GAMES } from '../src/games/registry';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; size: number; player: 0 | 1 };

function capRack(seed: number, level: boolean) {
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal', name: 'Maya' }), player({ bot: 'normal', name: 'Dad' })];
  const fx = new Fx();
  let result: GameResult | null = null;
  const view = GAMES.minipool.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end(r: GameResult) { result = r; } }) as unknown as { game: MiniPool; update(dt: number, i: Input): void };
  const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
  const g = view.game as unknown as MiniPool & { shotsThisRack: number };
  const born: Floater[] = [];
  const seen = new Set<Floater>();
  let armed = false;
  for (let i = 0; i < 60 * 120 && !result; i++) {
    if (!armed && g.phase === 'aim') {
      g.shotsThisRack = RULES.rackShotCap - 1;
      // Level: take one of each colour off (with fewer, the next shot can't pot both).
      if (!level) for (const b of g.balls) if (b.kind === 1 && b.on) { b.on = false; break; }
      armed = true;
    }
    view.update(DT, input);
    for (const f of (fx as unknown as { floaters: Floater[] }).floaters) if (!seen.has(f)) { seen.add(f); born.push(f); }
    fx.update(DT);
  }
  return { result: result as GameResult | null, born, g };
}

describe('Mini Pool shot-cap ending', () => {
  afterEach(() => setTextScale(1));
  for (const scale of [1, BIG_TEXT]) {
    it(`says "Out of shots!" then who won, on each seat's half${scale === 1 ? '' : ' (Bigger text)'}`, () => {
      setTextScale(scale);
      let fewer = 0;
      let levels = 0;
      let missing = 0;
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        for (const level of [false, true]) {
          const { result, born, g } = capRack(seed, level);
          expect(result).not.toBeNull();
          if (g.lastRack?.how !== 'cap') continue;
          const r = result as unknown as GameResult;
          expect(r.summary).toMatch(/^Out of shots/);
          for (const p of [0, 1] as const) {
            const out = born.find((f) => f.player === p && f.str === 'Out of shots!');
            const who = born.find((f) => f.player === p && /has fewer left$| wins$/.test(f.str));
            expect(out, `seat ${p} Out of shots`).toBeTruthy();
            if (!who) { missing++; continue; }
            for (const f of [out!, who]) {
              const s = scaledSize(f.size) * 0.45;
              expect(f.player === 0 ? f.y - s >= MID : f.y + s <= MID, `${f.str} on its half`).toBe(true);
            }
            // The two lines don't overlap.
            const gap = Math.abs(out!.y - who.y);
            expect(gap).toBeGreaterThanOrEqual((scaledSize(out!.size) + scaledSize(who.size)) * 0.45);
            if (who.str.startsWith('Level!')) levels++;
            else fewer++;
          }
        }
      }
      expect(fewer).toBeGreaterThan(0);
      expect(levels).toBeGreaterThan(0);
      // Mostly shown; skipped only when no clear line is left on a crowded half.
      expect(missing).toBeLessThanOrEqual((fewer + levels) / 3);
    }, 120_000);
  }
});
