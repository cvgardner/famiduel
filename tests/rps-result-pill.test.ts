import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import type { G } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { H } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { DT, player } from './helpers';

type Floater = { str: string };
const idle = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
const RESULT = /wins! \+1|beats|Tie! Go again/;

// F235: the round result ("Rock wins! +1" / "Rock beats scissors" / "Tie! Go again") popped at
// MID ± 150, right on each seat's round-win pips (ny + 29 = H - 175, radius 12), so the score
// hid while it showed. It now sits in the seat's prompt pill (H - 140), clear of the pips.
describe('Rock Paper Scissors: the round result reads off the pips', () => {
  it('bot vs bot, every round, both seats', () => {
    const seen = { win: [0, 0], beat: [0, 0], tie: [0, 0] };
    let onPips = 0;
    let pops = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: 'normal' }), player({ bot: 'normal' })];
      const fx = new Fx();
      let ended = false;
      const view = GAMES.rps.create({ seed, rng: makeRng(seed), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx, end() { ended = true; } }) as unknown as { update(dt: number, i: Input): void; render(g: G): void };
      const { g, words } = recorder();
      for (let i = 0; i < 60 * 120 && !ended; i++) {
        view.update(DT, idle);
        fx.update(DT);
        pops += (fx as unknown as { floaters: Floater[] }).floaters.filter((f) => RESULT.test(f.str)).length;
        words.length = 0;
        view.render(g);
        for (const w of words) {
          if (!RESULT.test(w.str)) continue;
          const seat = w.y > H / 2 ? 0 : 1;
          const kind = /wins/.test(w.str) ? 'win' : /beats/.test(w.str) ? 'beat' : 'tie';
          seen[kind][seat]++;
          // The pips' band in this seat's half (centre H - 175, radius 12), plus half a line.
          const pipY = seat === 0 ? H - 175 : 175;
          if (Math.abs(w.y - pipY) < 12 + 10) onPips++;
        }
      }
      expect(ended).toBe(true);
    }
    expect(pops).toBe(0);
    expect(onPips).toBe(0);
    for (const k of ['win', 'beat', 'tie'] as const) for (const s of [0, 1]) expect(seen[k][s], `${k} seat ${s}`).toBeGreaterThan(0);
  }, 60_000);
});
